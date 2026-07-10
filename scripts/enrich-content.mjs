#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/enrich-content.mjs
// Description: Content ENRICHMENT step (plan step content-enrichment). Takes the 56 reused
//   seed Situations (content/packs/seed-course.json) — whose patterns/vocabulary/goals/
//   cultural_notes are VERBATIM originals — and AUGMENTS each with the voice-first layers it
//   lacks: multi-speaker dialogues (Listening), branching roleplays L1-L5 (Simulator),
//   real-world missions (prep/fallback_phrases/likely_responses), phrase-pattern slots+variants
//   (Pattern Builder), extra structured cultural_notes, review_items, and pronunciation guides
//   on vocabulary. Generation is done by Gemini (REST, no SDK) with a system+user prompt that
//   pins each situation's practical level (L0-L5), reuses its existing patterns/vocab, and
//   enforces the same European-Portuguese / anti-Brazilian rules the content validator checks
//   (mirrors supabase/functions/_shared/gemini.ts PT_PT_ENFORCEMENT + level-lock discipline).
//   NEVER overwrites the reused originals — merge is strictly additive. Also curates ONE
//   verified real pt-PT YouTube video into media[] (replaces the known placeholder id).
//   Resumable: checkpoints done situation ids to a state file; batched (default 8);
//   retries Gemini with backoff, skips + logs on repeated failure. Validates the enriched
//   pack after each batch (schema.ts validators), regenerates content/packs/seed-course.json,
//   bumps pack version 1.0.0 -> 1.1.0, recomputes checksum, emits per-batch REVIEW files to
//   projects/falamadeira/content-review/, and publishes validated content to the DB
//   (content_packs.payload + situations projection, idempotent upserts — same pattern as
//   scripts/seed-content.mjs). NB: src/content/packs/seed-course.ts is NOT regenerated here
//   (src/ is owned by a concurrent agent); regenerate it from the JSON afterwards.
//   Usage: node scripts/enrich-content.mjs [--skip-db] [--limit N] [--batch N] [--model ID] [--reset]
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import pg from 'pg';
import dotenv from 'dotenv';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const argVal = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const SKIP_DB = hasFlag('--skip-db');
const RESET = hasFlag('--reset');
const LIMIT = Number(argVal('--limit', '0')) || 0; // 0 = all remaining
const BATCH_SIZE = Number(argVal('--batch', '8')) || 8;
const MODEL = argVal('--model', 'gemini-2.5-flash');

// ---------------------------------------------------------------------------
// Paths + constants
// ---------------------------------------------------------------------------
const JSON_IN = join(REPO_ROOT, 'content', 'packs', 'seed-course.json');
const JSON_OUT = JSON_IN; // regenerate in place (content/ dir; src/ is off-limits)
const REVIEW_DIR = join(REPO_ROOT, 'projects', 'falamadeira', 'content-review');
const STATE_FILE = join(REVIEW_DIR, '.enrich-state.json');

const NEW_PACK_VERSION = '1.1.0';

// Media curation: the seed carried a placeholder video id on the "ter" situation.
// Replace ONLY this known placeholder with a verified real European-Portuguese video.
// Verified via YouTube oEmbed (2026-07-10): id resolves 200; title
// "Essential Guide to the Portuguese verb 'TER'..."; channel learn_with_yvana teaches
// European Portuguese (Portugal) — topical + language match for sit-d16-ter-have-need-feel.
const PLACEHOLDER_VIDEO_ID = 'XhY7X_Y_X_Y';
const CURATED_VIDEO = {
  situationMatch: (s) => s.id === 'sit-d16-ter-have-need-feel',
  ref: {
    type: 'video',
    url: 'https://www.youtube.com/watch?v=5PonqyoB06E',
    caption: "Essential Guide to the Portuguese verb 'TER' (European Portuguese)",
  },
};

// ---------------------------------------------------------------------------
// Load schema (TS via tsx — no build step)
// ---------------------------------------------------------------------------
const schema = await tsImport('../src/content/schema.ts', import.meta.url);

// ---------------------------------------------------------------------------
// Gemini API key (from .env.local; NEVER printed or persisted)
// ---------------------------------------------------------------------------
dotenv.config({ path: join(REPO_ROOT, '.env.local'), quiet: true });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('FATAL: GEMINI_API_KEY missing in .env.local — cannot enrich');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// pt-PT enforcement + level-lock blocks (mirror _shared/gemini.ts discipline)
// ---------------------------------------------------------------------------
const PRACTICAL_LEVELS = {
  0: 'L0 Tourist survival — greet, order, pay, ask where things are, escape politely when lost.',
  1: 'L1 Daily function — routine daily life: shopping, café, pharmacy, times, prices, simple past/future.',
  2: 'L2 House & service management — cleaners, tradespeople, deliveries, bills, appointments by phone.',
  3: 'L3 Local conversation — real conversations with neighbours: opinions, plans, stories.',
  4: 'L4 Problem solving — complaints, misunderstandings, negotiations, bureaucracy pushback.',
  5: 'L5 Integrated resident — function socially and administratively like a resident: humour, indirectness, formal writing.',
};

const PT_PT_ENFORCEMENT = `EUROPEAN PORTUGUESE (pt-PT) ENFORCEMENT — non-negotiable:
- All Portuguese is European Portuguese (pt-PT). Spelling follows the Acordo Ortográfico as used in Portugal; vocabulary, syntax and idiom follow Portuguese (not Brazilian) norms.
- Madeiran spoken realism where natural: reductions ("tá" for "está", "p'ra" for "para"), "pois"/"pois é" for agreement, "Diga!"/"Diz?"/"Como?" when not hearing, "imenso" (a lot), "um bocado" (a little), local words (bica, semilha, levada, poncha, bolo do caco). Realism, NOT phonetic dialect spelling — write standard orthography.
- NO articles before professions: "Sou professor" (never "Sou um professor").
- Register (pt-PT): default to tu (informal, peers/neighbours) OR null-subject 3rd person / "o senhor / a senhora" (polite service & officials). Do NOT use "você" as the default polite address — in Portugal it can read as distancing. Only use "você" if the situation is explicitly teaching it.
- Use "estar a + infinitive" for ongoing action ("estou a fazer"), NEVER the Brazilian gerund periphrasis ("estou fazendo").
- FORBIDDEN Brazilian markers — never emit these; always use the European form:
  ônibus/ponto de ônibus → autocarro/paragem de autocarro; trem → comboio; banheiro → casa de banho; celular → telemóvel; geladeira → frigorífico; sorvete → gelado; suco → sumo; café da manhã → pequeno-almoço; açougue → talho; aeromoça → assistente de bordo; encanador → canalizador; caminhão → camião; esporte(s) → desporto(s); equipe → equipa; usuário/usuária → utilizador/utilizadora; registro/cadastro → registo; gerenciar → gerir; planejar/planejamento → planear/planeamento.`;

const VOICE_TYPES_DOC = `The 7 voice archetypes (voice_type MUST be exactly one of these lowercase strings):
- "teacher" (clear, slow model voice), "local" (natural Madeiran speed/rhythm), "older", "younger",
  "service" (counter/shop/phone-desk workers), "phone" (degraded phone audio), "noisy" (café/market ambience).
Dialogue realism: short turns, interjections (Diga!, Pois, Então, P'ra já!), no textbook monologues.
L0-L1 favour teacher+service clarity; L2+ MUST include at least one "local"-speed line; where the scenario
justifies it at L3+, include a "phone" or "noisy" line.`;

function levelLockBlock(level, knownVocab, situationContext) {
  const parts = [];
  if (PRACTICAL_LEVELS[level]) {
    parts.push(`LEVEL LOCK — the learner is at ${PRACTICAL_LEVELS[level]}
- Speak AT this level (at most i+1). Keep sentences, vocabulary and grammar within reach for this level.
- Do NOT dump advanced grammar, rare tenses, or vocabulary the learner is unlikely to know at this level.`);
  }
  if (knownVocab && knownVocab.length > 0) {
    parts.push(
      `KNOWN VOCABULARY / PHRASES already in this situation — REUSE these first, build on them before introducing anything new: ${knownVocab.slice(0, 80).join('; ')}.`
    );
  }
  if (situationContext) {
    parts.push(`CURRENT SITUATION — anchor everything you generate in this real-life context: ${situationContext}.`);
  }
  return parts.join('\n\n');
}

const SYSTEM_INSTRUCTION_BASE = `You are the FalaMadeira content-enrichment engine for European Portuguese as spoken in Madeira. You output STRICT, VALID JSON only — no prose, no markdown fences, no commentary.

${PT_PT_ENFORCEMENT}

${VOICE_TYPES_DOC}`;

// ---------------------------------------------------------------------------
// Prompt builder — asks ONLY for the missing fields, in exact schema shapes
// ---------------------------------------------------------------------------
function buildUserPrompt(sit) {
  const existingPatternBases = (sit.phrase_patterns ?? []).map((p) => `${p.id}: "${p.base}"`);
  const existingVocab = (sit.vocabulary ?? []).map((v) => `${v.word} = ${v.translation}`);
  const knownVocab = [
    ...(sit.phrase_patterns ?? []).map((p) => p.base),
    ...(sit.vocabulary ?? []).map((v) => v.word),
  ];
  const ll = levelLockBlock(sit.level, knownVocab, `${sit.title} — ${sit.summary}`);

  return `${ll}

SITUATION (id "${sit.id}", level L${sit.level}, CEFR ${sit.cefr}):
Title: ${sit.title}
Summary: ${sit.summary}
Goals: ${(sit.goals ?? []).join(' | ') || '(none)'}
EXISTING phrase patterns (these are FIXED originals — do NOT rewrite them; you will only add slots/variants keyed to them):
${existingPatternBases.join('\n') || '(none)'}
EXISTING vocabulary (FIXED originals):
${existingVocab.join('\n') || '(none)'}

TASK: Generate ONLY the missing voice-first enrichment layers for this situation, reusing the existing patterns and vocabulary above and staying strictly within level L${sit.level}. Return a single JSON object with EXACTLY these keys:

{
  "pattern_enrichment": [
    // For EACH existing pattern above that can sensibly take substitutions, one object.
    // "id" MUST be one of the existing pattern ids listed above. Only include patterns you enrich.
    {
      "id": "<existing pattern id>",
      "slots": [ { "name": "<slot name, lowercase, no spaces>", "description": "<English>", "options": ["<pt-PT option>", "..."] } ],
      // A slot's {name} MUST be intended to slot into that pattern's base; provide 3-6 natural pt-PT options each.
      "variants": [ { "text": "<pt-PT variant of the base phrase>", "translation": "<English>", "register": "informal|neutral|formal", "note": "<optional English>" } ]
    }
  ],
  "dialogues": [
    // 1-2 multi-speaker dialogues. Each line MUST carry a valid voice_type.
    { "id": "<unique, prefix dlg-${sit.course?.legacy_lesson_id ?? sit.id}->", "title": "<short English>", "context": "<where/who/what, English>",
      "lines": [ { "speaker": "<role/name>", "voice_type": "<one of the 7>", "text": "<pt-PT>", "translation": "<English>" } ] }
  ],
  "roleplay": {
    // ONE branching roleplay. difficulty is an integer 1-5 appropriate to level L${sit.level}
    // (L0-L1 -> difficulty 1-2 guided; L2-L3 -> 2-3; L4 -> 4; L5 -> 5 messy).
    "scenario": "<English scene description>",
    "difficulty": <1-5>,
    "entry_node": "<id of the starting node>",
    "nodes": [
      { "id": "<node id>", "npc_text": "<pt-PT what the other party says>", "npc_translation": "<English>", "npc_voice_type": "<one of the 7>",
        "options": [ { "text": "<pt-PT learner line>", "translation": "<English>", "next": "<id of another node, or omit to end>", "feedback": "<English coaching>" } ] }
    ]
    // 3-6 nodes; at least one branch reaches a terminal node (options: []). Every "next" MUST match a node id. entry_node MUST match a node id.
  },
  "mission": {
    "title": "<English real-world assignment title>",
    "prep": ["<English rehearsal step>", "..."],
    "fallback_phrases": ["<pt-PT escape-hatch phrase>", "..."],
    "likely_responses": ["<pt-PT what the other party will probably say>", "..."]
  },
  "cultural_notes": [
    // 1-2 ADDITIONAL structured notes (social code / register / indirectness / timing). Do NOT repeat the existing note.
    { "title": "<English>", "body": "<English explainer>" }
  ],
  "pronunciation": [
    // Pronunciation guides for the trickier existing vocabulary words. "word" MUST match an existing vocabulary word above.
    { "word": "<existing vocabulary word>", "pronunciation": "<simple English-reader phonetic guide, e.g. BEE-kah>" }
  ]
}

Rules:
- Portuguese ONLY in: slot options, variant text, dialogue line text, roleplay npc_text and option text, mission fallback_phrases and likely_responses. Everything else (titles, translations, descriptions, prep, feedback, cultural note bodies, pronunciation guides) is ENGLISH.
- Obey the pt-PT / anti-Brazilian and level-lock rules in your system instruction for ALL Portuguese.
- Keep it grounded and realistic for daily life in Madeira. No invented slang, no phonetic dialect spelling.
- Output the JSON object ONLY.`;
}

// ---------------------------------------------------------------------------
// Gemini REST call with retry/backoff
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateJson(userPrompt, { retries = 4 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION_BASE }] },
          generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
        }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        // 429 / 5xx are retryable; 4xx (except 429) are not.
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`retryable ${res.status}: ${body}`);
        }
        throw Object.assign(new Error(`Gemini ${res.status}: ${body}`), { fatal: true });
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!text.trim()) throw new Error('empty candidate text');
      return JSON.parse(stripFences(text));
    } catch (e) {
      lastErr = e;
      if (e.fatal) throw e;
      if (attempt < retries) {
        const backoff = Math.min(1000 * 2 ** attempt, 15000) + Math.floor(Math.random() * 500);
        console.log(`    retry ${attempt + 1}/${retries} after ${backoff}ms (${e.message.slice(0, 80)})`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

function stripFences(t) {
  const s = t.trim();
  if (s.startsWith('```')) {
    return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  return s;
}

// ---------------------------------------------------------------------------
// Additive merge — NEVER overwrites reused originals
// ---------------------------------------------------------------------------
function mergeEnrichment(sit, gen) {
  const out = structuredClone(sit);
  const legacy = sit.course?.legacy_lesson_id ?? sit.id;

  // 1. Pattern slots + variants — attach to the EXISTING pattern by id; never touch `base`.
  if (Array.isArray(gen.pattern_enrichment)) {
    const byId = new Map(out.phrase_patterns.map((p) => [p.id, p]));
    for (const pe of gen.pattern_enrichment) {
      const target = byId.get(pe?.id);
      if (!target) continue; // ignore hallucinated ids — we never create new base patterns here
      if (Array.isArray(pe.slots)) {
        const good = pe.slots.filter(
          (s) =>
            s && typeof s.name === 'string' && s.name.trim() &&
            Array.isArray(s.options) && s.options.length > 0 &&
            // schema warns (not errors) if base lacks {name}; keep only slots the base references
            // OR options are clearly usable — but to avoid validation warnings, require the marker.
            typeof target.base === 'string' && target.base.includes(`{${s.name}}`)
        );
        // If the model returned slots whose {name} the FIXED base does not contain, we cannot add
        // them without either rewriting base (forbidden) or emitting a warning. Drop those silently.
        if (good.length) target.slots = [...(target.slots ?? []), ...good.map(cleanSlot)];
      }
      if (Array.isArray(pe.variants)) {
        const good = pe.variants
          .filter((v) => v && typeof v.text === 'string' && v.text.trim())
          .map(cleanVariant);
        if (good.length) target.variants = [...(target.variants ?? []), ...good];
      }
    }
  }

  // 2. Dialogues — append; ensure unique, prefixed ids + valid voice_types.
  if (Array.isArray(gen.dialogues) && gen.dialogues.length) {
    const dlgs = [];
    gen.dialogues.forEach((d, i) => {
      if (!d || !Array.isArray(d.lines) || d.lines.length === 0) return;
      const lines = d.lines
        .filter((l) => l && typeof l.text === 'string' && l.text.trim() && typeof l.speaker === 'string')
        .map((l) => ({
          speaker: String(l.speaker),
          voice_type: schema.VOICE_TYPES.includes(l.voice_type) ? l.voice_type : 'local',
          text: String(l.text),
          ...(typeof l.translation === 'string' ? { translation: l.translation } : {}),
        }));
      if (lines.length === 0) return;
      dlgs.push({
        id: `dlg-${legacy}-${i + 1}`,
        ...(typeof d.title === 'string' && d.title.trim() ? { title: d.title } : {}),
        ...(typeof d.context === 'string' && d.context.trim() ? { context: d.context } : {}),
        lines,
      });
    });
    if (dlgs.length) out.dialogues = [...(out.dialogues ?? []), ...dlgs];
  }

  // 3. Roleplay — set only if absent (augment: seed has none). Repair ids/refs to satisfy schema.
  if (!out.roleplay && gen.roleplay && typeof gen.roleplay === 'object') {
    const rp = normalizeRoleplay(gen.roleplay, sit.level);
    if (rp) out.roleplay = rp;
  }

  // 4. Mission — set only if absent.
  if (!out.mission && gen.mission && typeof gen.mission === 'object') {
    const m = gen.mission;
    const strArr = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()) : []);
    if (typeof m.title === 'string' && strArr(m.prep).length && strArr(m.fallback_phrases).length && strArr(m.likely_responses).length) {
      out.mission = {
        title: m.title,
        prep: strArr(m.prep),
        fallback_phrases: strArr(m.fallback_phrases),
        likely_responses: strArr(m.likely_responses),
      };
    }
  }

  // 5. Cultural notes — APPEND additional notes; never replace the existing verbatim note.
  if (Array.isArray(gen.cultural_notes) && gen.cultural_notes.length) {
    const existingBodies = new Set((out.cultural_notes ?? []).map((n) => n.body));
    const extra = gen.cultural_notes
      .filter((n) => n && typeof n.title === 'string' && n.title.trim() && typeof n.body === 'string' && n.body.trim())
      .filter((n) => !existingBodies.has(n.body))
      .map((n) => ({ title: n.title, body: n.body }));
    if (extra.length) out.cultural_notes = [...(out.cultural_notes ?? []), ...extra];
  }

  // 6. Pronunciation — enrich EXISTING vocabulary items only where pronunciation is absent.
  if (Array.isArray(gen.pronunciation) && gen.pronunciation.length) {
    const byWord = new Map(out.vocabulary.map((v) => [v.word, v]));
    for (const p of gen.pronunciation) {
      if (!p || typeof p.word !== 'string' || typeof p.pronunciation !== 'string') continue;
      const v = byWord.get(p.word);
      if (v && !v.pronunciation && p.pronunciation.trim()) v.pronunciation = p.pronunciation.trim();
    }
  }

  // 7. Derived review_items — deterministic, from existing + newly-added data (not model text).
  out.review_items = deriveReviewItems(out);

  // 8. Media curation — replace the known placeholder id with a verified real pt-PT video.
  out.media = curateMedia(out);

  return out;
}

function cleanSlot(s) {
  return {
    name: String(s.name),
    ...(typeof s.description === 'string' && s.description.trim() ? { description: s.description } : {}),
    options: s.options.filter((o) => typeof o === 'string' && o.trim()).map(String),
  };
}
function cleanVariant(v) {
  return {
    text: String(v.text),
    ...(typeof v.translation === 'string' ? { translation: v.translation } : {}),
    ...(schema.REGISTERS?.includes?.(v.register) ? { register: v.register } : {}),
    ...(typeof v.note === 'string' && v.note.trim() ? { note: v.note } : {}),
  };
}

function normalizeRoleplay(rp, level) {
  if (!Array.isArray(rp.nodes) || rp.nodes.length === 0) return null;
  const nodes = [];
  const ids = new Set();
  for (const n of rp.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id.trim() || typeof n.npc_text !== 'string' || !n.npc_text.trim()) continue;
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    nodes.push(n);
  }
  if (nodes.length === 0) return null;
  const idSet = new Set(nodes.map((n) => n.id));
  const clean = nodes.map((n) => {
    const options = Array.isArray(n.options)
      ? n.options
          .filter((o) => o && typeof o.text === 'string' && o.text.trim())
          .map((o) => {
            const opt = {
              text: String(o.text),
              ...(typeof o.translation === 'string' ? { translation: o.translation } : {}),
              ...(typeof o.feedback === 'string' && o.feedback.trim() ? { feedback: o.feedback } : {}),
            };
            // keep `next` only when it resolves to a real node (drop dangling branches -> terminal)
            if (typeof o.next === 'string' && idSet.has(o.next)) opt.next = o.next;
            return opt;
          })
      : [];
    return {
      id: n.id,
      npc_text: String(n.npc_text),
      ...(typeof n.npc_translation === 'string' ? { npc_translation: n.npc_translation } : {}),
      ...(schema.VOICE_TYPES.includes(n.npc_voice_type) ? { npc_voice_type: n.npc_voice_type } : { npc_voice_type: 'local' }),
      options,
    };
  });
  let entry = typeof rp.entry_node === 'string' && idSet.has(rp.entry_node) ? rp.entry_node : clean[0].id;
  let difficulty = Number(rp.difficulty);
  if (!schema.ROLEPLAY_DIFFICULTIES.includes(difficulty)) {
    difficulty = Math.max(1, Math.min(5, level >= 5 ? 5 : level >= 4 ? 4 : level >= 2 ? 3 : level >= 1 ? 2 : 1));
  }
  const scenario = typeof rp.scenario === 'string' && rp.scenario.trim() ? rp.scenario : 'Practise this situation.';
  return { scenario, difficulty, entry_node: entry, nodes: clean };
}

// Deterministic review items derived from the situation's own data (no model prose).
function deriveReviewItems(sit) {
  const items = [];
  const legacy = sit.course?.legacy_lesson_id ?? sit.id;
  (sit.phrase_patterns ?? []).slice(0, 4).forEach((p, i) => {
    items.push({
      id: `rv-${legacy}-say-${i + 1}`,
      dimension: 'say',
      prompt: p.translation ? `Say in Portuguese: ${p.translation}` : `Say this phrase from memory: "${p.base}"`,
      answer: p.base,
      source_ref: p.id,
    });
  });
  (sit.vocabulary ?? []).slice(0, 4).forEach((v, i) => {
    items.push({
      id: `rv-${legacy}-retrieve-${i + 1}`,
      dimension: 'retrieve',
      prompt: `Recall the Portuguese for: ${v.translation}`,
      answer: v.word,
      source_ref: v.word,
    });
  });
  if ((sit.dialogues ?? []).length > 0) {
    const d = sit.dialogues[0];
    items.push({
      id: `rv-${legacy}-hear-1`,
      dimension: 'hear',
      prompt: 'Listen to the dialogue at natural speed and answer: what is being asked for?',
      source_ref: d.id,
    });
  }
  return items;
}

function curateMedia(sit) {
  let media = Array.isArray(sit.media) ? [...sit.media] : [];
  // remove the known placeholder id anywhere it appears
  media = media.filter((m) => !(m && typeof m.url === 'string' && m.url.includes(PLACEHOLDER_VIDEO_ID)));
  if (CURATED_VIDEO.situationMatch(sit)) {
    const already = media.some((m) => m && m.url === CURATED_VIDEO.ref.url);
    if (!already) media.push({ ...CURATED_VIDEO.ref });
  }
  return media;
}

// ---------------------------------------------------------------------------
// Pack assembly + checksum
// ---------------------------------------------------------------------------
function assemblePack(base, situations) {
  const pack = {
    id: base.id,
    name: base.name,
    version: NEW_PACK_VERSION,
    schema_version: base.schema_version ?? schema.CONTENT_SCHEMA_VERSION,
    status: base.status ?? 'published',
    situations,
    tracks: base.tracks ?? [],
  };
  pack.checksum = createHash('sha256').update(schema.canonicalPackPayload(pack), 'utf8').digest('hex');
  return pack;
}

// ---------------------------------------------------------------------------
// State (resumable checkpoint)
// ---------------------------------------------------------------------------
function loadState() {
  if (RESET || !existsSync(STATE_FILE)) return { done: {}, failed: {}, batches: 0 };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { done: {}, failed: {}, batches: 0 };
  }
}
function saveState(state) {
  mkdirSync(REVIEW_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// DB publish (idempotent; same pattern as scripts/seed-content.mjs)
// ---------------------------------------------------------------------------
async function publishToDb(pack) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const projectRef = supabaseUrl ? supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] : null;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!projectRef || !dbPassword) {
    console.error('  WARN: missing VITE_SUPABASE_URL / SUPABASE_DB_PASSWORD — skipping DB publish');
    return false;
  }
  const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  const packJson = JSON.stringify(pack, null, 2);
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO public.content_packs (id, name, version, schema_version, status, checksum, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, version=EXCLUDED.version,
         schema_version=EXCLUDED.schema_version, status=EXCLUDED.status,
         checksum=EXCLUDED.checksum, payload=EXCLUDED.payload`,
      [pack.id, pack.name, pack.version, pack.schema_version, pack.status, pack.checksum, packJson]
    );
    for (const s of pack.situations) {
      await client.query(
        `INSERT INTO public.situations (id, pack_id, payload, level, cefr, tracks, course_month, course_day, version)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET pack_id=EXCLUDED.pack_id, payload=EXCLUDED.payload,
           level=EXCLUDED.level, cefr=EXCLUDED.cefr, tracks=EXCLUDED.tracks,
           course_month=EXCLUDED.course_month, course_day=EXCLUDED.course_day, version=EXCLUDED.version`,
        [s.id, pack.id, JSON.stringify(s), s.level, s.cefr, s.tracks, s.course?.month ?? null, s.course?.day ?? null, 2]
      );
    }
    for (const t of pack.tracks ?? []) {
      await client.query(
        `INSERT INTO public.tracks (id, pack_id, name, goal, situation_ids, payload)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (id) DO UPDATE SET pack_id=EXCLUDED.pack_id, name=EXCLUDED.name,
           goal=EXCLUDED.goal, situation_ids=EXCLUDED.situation_ids, payload=EXCLUDED.payload`,
        [t.id, pack.id, t.name, t.goal, t.situations, JSON.stringify(t)]
      );
    }
    await client.query('COMMIT');
    const chk = await client.query(`SELECT version, checksum FROM public.content_packs WHERE id=$1`, [pack.id]);
    const ok = chk.rows[0]?.version === pack.version && chk.rows[0]?.checksum === pack.checksum;
    console.log(`  DB publish committed — version=${chk.rows[0]?.version} checksum match=${ok}`);
    return ok;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('  WARN: DB publish failed:', e.message);
    return false;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
mkdirSync(REVIEW_DIR, { recursive: true });

const base = JSON.parse(readFileSync(JSON_IN, 'utf8'));
if (!Array.isArray(base.situations) || base.situations.length === 0) {
  console.error('FATAL: base pack has no situations');
  process.exit(1);
}

const state = loadState();
// The working situation list carries any enrichment already merged in previous runs
// (so re-runs are idempotent + resumable). We keep an id-indexed working copy.
const working = new Map(base.situations.map((s) => [s.id, structuredClone(s)]));

const pending = base.situations.filter((s) => !state.done[s.id]);
const targets = LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

console.log(`Enrichment run — model=${MODEL} batch=${BATCH_SIZE} skipDb=${SKIP_DB}`);
console.log(`total situations: ${base.situations.length}  already done: ${Object.keys(state.done).length}  this run targets: ${targets.length}`);

let batchIndex = state.batches;
for (let i = 0; i < targets.length; i += BATCH_SIZE) {
  const batch = targets.slice(i, i + BATCH_SIZE);
  batchIndex += 1;
  console.log(`\n=== Batch ${batchIndex} (${batch.length} situations) ===`);
  const review = [];

  for (const sit of batch) {
    process.stdout.write(`  ${sit.id} [L${sit.level}] ... `);
    try {
      const gen = await generateJson(buildUserPrompt(sit), { retries: 4 });
      const merged = mergeEnrichment(sit, gen);
      const issues = schema.validateSituation(merged, `situation:${sit.id}`);
      const errors = issues.filter((x) => x.severity === 'error');
      if (errors.length) {
        // one repair pass is implicit in merge; if still invalid, skip + log
        console.log(`INVALID (${errors.length} err) — skipped`);
        errors.slice(0, 4).forEach((e) => console.log(`      ${e.path}: ${e.message}`));
        state.failed[sit.id] = { reason: 'schema-invalid', errors: errors.map((e) => `${e.path}: ${e.message}`) };
        continue;
      }
      working.set(sit.id, merged);
      state.done[sit.id] = { at: new Date().toISOString(), model: MODEL };
      delete state.failed[sit.id];
      const added = {
        dialogues: (merged.dialogues?.length ?? 0) - (sit.dialogues?.length ?? 0),
        roleplay: merged.roleplay && !sit.roleplay ? 1 : 0,
        mission: merged.mission && !sit.mission ? 1 : 0,
        pattern_slots: merged.phrase_patterns.reduce((n, p) => n + (p.slots?.length ?? 0), 0),
        pattern_variants: merged.phrase_patterns.reduce((n, p) => n + (p.variants?.length ?? 0), 0),
        extra_cultural_notes: (merged.cultural_notes?.length ?? 0) - (sit.cultural_notes?.length ?? 0),
        review_items: merged.review_items?.length ?? 0,
        media_video: merged.media?.some((m) => m.type === 'video') ? 1 : 0,
      };
      console.log(
        `OK  +${added.dialogues}dlg +${added.roleplay}rp +${added.mission}mis ${added.pattern_slots}slots ${added.pattern_variants}var +${added.extra_cultural_notes}cn`
      );
      review.push({
        id: sit.id,
        title: sit.title,
        level: sit.level,
        cefr: sit.cefr,
        added,
        generated: {
          dialogues: merged.dialogues ?? [],
          roleplay: merged.roleplay ?? null,
          mission: merged.mission ?? null,
          phrase_patterns_enriched: merged.phrase_patterns
            .filter((p) => (p.slots?.length ?? 0) || (p.variants?.length ?? 0))
            .map((p) => ({ id: p.id, base: p.base, slots: p.slots ?? [], variants: p.variants ?? [] })),
          cultural_notes: merged.cultural_notes ?? [],
          review_items: merged.review_items ?? [],
          media: merged.media ?? [],
        },
      });
    } catch (e) {
      console.log(`FAILED — ${e.message.slice(0, 100)}`);
      state.failed[sit.id] = { reason: 'gemini-failed', message: e.message.slice(0, 200) };
    }
  }

  state.batches = batchIndex;

  // Write review file for this batch (human-readable).
  if (review.length) {
    const reviewFile = join(REVIEW_DIR, `enrichment-batch-${batchIndex}.json`);
    writeFileSync(
      reviewFile,
      JSON.stringify(
        { batch: batchIndex, model: MODEL, generated_at: new Date().toISOString(), count: review.length, situations: review },
        null,
        2
      ) + '\n',
      'utf8'
    );
    console.log(`  review -> ${reviewFile}`);
  }

  // Assemble + validate the WHOLE pack after this batch (published content must be valid).
  const situations = base.situations.map((s) => working.get(s.id) ?? s);
  const pack = assemblePack(base, situations);
  const result = schema.validateContentPack(pack);
  if (!result.valid) {
    console.error(`  FATAL: assembled pack invalid after batch ${batchIndex} (${result.errors.length} errors) — not writing/publishing this batch`);
    result.errors.slice(0, 10).forEach((e) => console.error(`    ${e.path}: ${e.message}`));
    saveState(state);
    process.exit(1);
  }

  // Persist: regenerate JSON (content/ only) + checkpoint state.
  writeFileSync(JSON_OUT, JSON.stringify(pack, null, 2) + '\n', 'utf8');
  saveState(state);
  console.log(`  wrote ${JSON_OUT} (version ${pack.version}, checksum ${pack.checksum.slice(0, 12)}…)`);

  // Publish this cumulative state to DB (idempotent).
  if (!SKIP_DB) {
    await publishToDb(pack);
  }
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
const doneCount = Object.keys(state.done).length;
const failedIds = Object.keys(state.failed);
console.log('\n=== Enrichment summary ===');
console.log(`enriched + validated: ${doneCount}/${base.situations.length}`);
console.log(`pending:              ${base.situations.length - doneCount}`);
console.log(`failed this run:      ${failedIds.length}${failedIds.length ? ' — ' + failedIds.join(', ') : ''}`);
console.log(`state file:           ${STATE_FILE}`);
console.log(`review files:         ${REVIEW_DIR}/enrichment-batch-*.json`);
console.log(`pack JSON:            ${JSON_OUT} (version ${NEW_PACK_VERSION})`);
console.log('NOTE: src/content/packs/seed-course.ts NOT regenerated (src/ owned by concurrent agent).');
console.log('      Regenerate it from content/packs/seed-course.json once src/ is released.');
