#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/generate-content.mjs
// Description: Content GENERATION step (plan step author-tracks-and-curriculum; tasks C2/A3/C3/C4).
//   Authors ONLY the NET-NEW content on top of the enriched v1.1.0 seed pack
//   (content/packs/seed-course.json) — it never regenerates the reused/enriched M1-3
//   situations, only reads them.
//
//   PHASE 1 (deterministic, no AI) — RE-TAG. Assigns the existing 56 enriched situations
//   into the 5 Goal Tracks (A Survival, B Property Owner/Host, C Social Integration,
//   D Bureaucracy/Services, E Work/Business) by category/level/theme. A situation can serve
//   several tracks. Adds the goal-track ids to each situation's tracks[] (keeps the existing
//   'track-structured-course' membership), and BUILDS the 5 Track rows (situation_ids ordered
//   by level then day). The Structured Course track is kept unchanged.
//
//   PHASE 2 (Gemini REST, gemini-2.5-flash, no SDK) — GENERATE the gaps as FULL situations:
//     (a) Months 4-6 of the Structured Course (M1-3 exist; author M4-6 continuing the
//         day/month calendar from day 57) — these join track-structured-course + their
//         thematic goal tracks;
//     (b) per-track net-new situations each track needs but the seed lacks
//         (Host: boiler broken / guest noise complaint / check-in handover / cleaning brief;
//          Bureaucracy: calling Finanças / registering at the health centre / bank account /
//          residency at the Junta; Work: scope escalation / scheduling a site visit /
//          quoting a job / chasing an invoice; Social: dinner invitation / festival small talk;
//          Survival: taxi from the airport / buying a bus/SIM ...).
//   Each generated situation is a FULL Situation (phrase_patterns w/ slots+variants, vocabulary
//   w/ pronunciation, multi-voice dialogues, cultural_notes, branching roleplay L1-L5, mission,
//   review_items, level/cefr/tracks/course-slot where applicable). EU-PT enforced + level-locked
//   (mirrors scripts/enrich-content.mjs PT_PT_ENFORCEMENT + level lock). Every generated situation
//   is validated with schema.validateSituation; invalid ones are skipped + logged (never published).
//
//   VIDEO curation: re-curates the 2 dead seed videos flagged by enrichment (id S2_YmG_l-p4 on
//   sit-d1 + sit-d15, verified 404) with real pt-PT YouTube videos, and attaches curated real
//   videos to new week-block anchor situations where a verified pt-PT video exists. Every video id
//   is oEmbed-verified (HTTP 200) at run time before it is attached; NEVER fabricate an id — a
//   candidate that fails verification is left absent.
//
//   Resumable/batched like enrich: checkpoints generated ids to a state file; batches Gemini calls;
//   retries with backoff; validates the WHOLE pack (validateContentPack) after each batch; emits
//   per-batch review files to projects/falamadeira/content-review/tracks-batch-<n>.json; publishes
//   validated content to the DB (content_packs payload + situations + tracks projections, idempotent
//   upserts — same pattern as scripts/seed-content.mjs / enrich-content.mjs); bumps pack version
//   1.1.0 -> 1.2.0 + recomputes checksum; regenerates content/packs/seed-course.json (NOT the .ts —
//   the orchestrator regenerates src/content/packs/seed-course.ts from JSON afterwards).
//   Usage: node scripts/generate-content.mjs [--skip-db] [--limit N] [--batch N] [--model ID]
//                                            [--reset] [--no-video] [--retag-only]
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
const NO_VIDEO = hasFlag('--no-video');
const RETAG_ONLY = hasFlag('--retag-only');
const LIMIT = Number(argVal('--limit', '0')) || 0; // 0 = all remaining
const BATCH_SIZE = Number(argVal('--batch', '6')) || 6;
const MODEL = argVal('--model', 'gemini-2.5-flash');

// ---------------------------------------------------------------------------
// Paths + constants
// ---------------------------------------------------------------------------
const JSON_IN = join(REPO_ROOT, 'content', 'packs', 'seed-course.json');
const JSON_OUT = JSON_IN; // regenerate in place (content/ dir; src/ is off-limits)
const REVIEW_DIR = join(REPO_ROOT, 'projects', 'falamadeira', 'content-review');
const STATE_FILE = join(REVIEW_DIR, '.generate-state.json');

const NEW_PACK_VERSION = '1.2.0';

// The 5 Goal Tracks (CONTENT-ARCHITECTURE §2.2). Structured Course track already exists.
const TRACK_STRUCTURED = 'track-structured-course';
const GOAL_TRACKS = [
  {
    id: 'track-survival',
    name: 'Survival Madeira',
    goal: 'Handle arrivals and everyday visitor basics: greet, order, pay, ask directions, shop, get help.',
  },
  {
    id: 'track-host',
    name: 'Property Owner / Rental Host',
    goal: 'Run a rental property in Madeira: cleaners, tradespeople, guests, bills, repairs, handovers.',
  },
  {
    id: 'track-social',
    name: 'Social Integration',
    goal: 'Belong socially in Madeira: neighbours, festivals, invitations, opinions, humour, small talk.',
  },
  {
    id: 'track-bureaucracy',
    name: 'Bureaucracy / Services',
    goal: 'Deal with Finanças, Câmara/Junta, the health centre, banks and utilities like a resident.',
  },
  {
    id: 'track-work',
    name: 'Work / Business Madeira',
    goal: 'Function professionally: introductions, scheduling, scope, quotes, escalation, follow-up.',
  },
];
const GOAL_TRACK_IDS = new Set(GOAL_TRACKS.map((t) => t.id));

// ---------------------------------------------------------------------------
// Load schema (TS via tsx — no build step)
// ---------------------------------------------------------------------------
const schema = await tsImport('../src/content/schema.ts', import.meta.url);

// ---------------------------------------------------------------------------
// Gemini API key (from .env.local; NEVER printed or persisted)
// ---------------------------------------------------------------------------
dotenv.config({ path: join(REPO_ROOT, '.env.local'), quiet: true });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY && !RETAG_ONLY) {
  console.error('FATAL: GEMINI_API_KEY missing in .env.local — cannot generate (use --retag-only to skip generation)');
  process.exit(1);
}

// ===========================================================================
// PHASE 1 — RE-TAG (deterministic; theme/category/level driven)
// ===========================================================================
// Honest, conservative classifier: a situation joins a goal track only where its
// theme genuinely fits that life-goal — NOT "any L0-L1 => survival". Every seed
// situation keeps its 'track-structured-course' membership; goal-track ids are ADDED.
function classifyTracks(sit) {
  const t = `${sit.title} ${sit.summary}`.toLowerCase();
  const cat = sit.course?.category ?? 'custom';
  const L = sit.level;
  const set = new Set();

  // A — Survival: the practical arrival/visitor basics (greet, order, pay, directions,
  // numbers/prices, shopping, pharmacy, restaurant, times, asking for clarification).
  if (
    /greet|caf[ée]|order|direction|locations|number|price|shopping|clothes|colour|pharmac|health|restaurant|meal|time:|days|hours|confusion|clarification|self-introduction|introduc/.test(
      t
    )
  ) {
    set.add('track-survival');
  }

  // C — Social Integration: neighbours, opinions, emotions, conversation, register,
  // festivals/culture/geography, talking about others/preferences.
  if (
    cat === 'social' ||
    /opinion|preference|emotion|empath|comfort|conversation|register|social|cultur|geograph|festival|others|small talk|invitation|agree|disagree/.test(
      t
    )
  ) {
    set.add('track-social');
  }

  // D — Bureaucracy / Services: formal register, telephone/formal messages, formal writing,
  // professional-formal counter/office interactions.
  if (/formal|telephone|message|writing|funchal|professional/.test(t)) {
    set.add('track-bureaucracy');
  }

  // E — Work / Business: work category, professional register, abstract work/decisions.
  if (cat === 'work' || /work|professional|decision|business/.test(t)) {
    set.add('track-work');
  }

  // B — Property Owner / Host: managing a home + service interactions (L2+ service register).
  if (/home|describ|house|apartment|repair|clean|bill/.test(t)) {
    set.add('track-host');
  }
  // Telephone / formal-message + appointment skills feed the Host track too (calling a
  // tradesperson is the core host skill).
  if (/telephone|message/.test(t) && L >= 1) set.add('track-host');

  return [...set];
}

// Re-tag situations into goal tracks and return trackId -> [situationId,...].
//   - SEED situations (id in `seedIds`): (re-)classified by keyword; always keep
//     track-structured-course; goal-track tags rebuilt from the classifier. This is the
//     Phase-1 data-tagging of the enriched M1-3 content.
//   - GENERATED situations (id NOT in seedIds): their tracks[] were authored deterministically
//     from the generation spec (goalTracks, + structured-course only for course-slot M4-6
//     situations). These are PRESERVED verbatim — never clobbered by the keyword classifier —
//     and just read into the mapping. A generated situation carrying track-structured-course
//     (i.e. an M4-6 course situation) is ALSO keyword-classified so it can join thematic goal
//     tracks, additively, without losing its authored memberships.
function retagSituations(situations, seedIds) {
  const mapping = {}; // trackId -> [situationId,...]
  for (const g of GOAL_TRACKS) mapping[g.id] = [];
  for (const sit of situations) {
    const isSeed = seedIds.has(sit.id);
    if (isSeed) {
      const goalTracks = classifyTracks(sit);
      const base = new Set(sit.tracks ?? []);
      base.add(TRACK_STRUCTURED);
      for (const gt of GOAL_TRACK_IDS) base.delete(gt); // clear stale goal-track tags first
      for (const gt of goalTracks) base.add(gt);
      sit.tracks = [...base];
      for (const gt of goalTracks) mapping[gt].push(sit.id);
    } else {
      // Generated: keep authored tracks[]. If it is an M4-6 course situation, additively
      // let the classifier add extra thematic goal tracks (never removing authored ones).
      const base = new Set(sit.tracks ?? []);
      if (base.has(TRACK_STRUCTURED)) {
        for (const gt of classifyTracks(sit)) base.add(gt);
      }
      sit.tracks = [...base];
      for (const gt of base) if (GOAL_TRACK_IDS.has(gt)) mapping[gt].push(sit.id);
    }
  }
  return mapping;
}

// Order a track's situation ids by (level asc, then course.day asc, then id) — deterministic.
function orderTrackSituations(ids, byId) {
  return [...ids].sort((a, b) => {
    const sa = byId.get(a);
    const sb = byId.get(b);
    if (sa.level !== sb.level) return sa.level - sb.level;
    const da = sa.course?.day ?? 9999;
    const db = sb.course?.day ?? 9999;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}

// ===========================================================================
// PHASE 2 — GENERATION SPECS (what NET-NEW content to author)
// ===========================================================================
// Structured-course M4-6 continue the calendar. Seed ends at month 3, day 56.
// We author a compact but honest continuation: 4 anchor situations per month
// (weeks 1-4 of that month), days 57.. — enough to make M4-6 usable without padding.
const COURSE_M4_6 = [
  // Month 4 — Local Slang & Culture (L3 / B1)
  { key: 'm4w1-neighbourhood-small-talk', month: 4, day: 57, level: 3, cefr: 'B1', category: 'social',
    title: 'Neighbourhood Small Talk', theme: 'Chatting with a neighbour on the street: weather, the levada, how things are going — the daily social glue of belonging in a Madeira bairro.',
    goalTracks: ['track-social'] },
  { key: 'm4w2-festival-arraial', month: 4, day: 64, level: 3, cefr: 'B1', category: 'social',
    title: 'At the Arraial (Festival)', theme: 'Enjoying a Madeiran arraial: buying espetada and poncha, joining the crowd, understanding festival announcements and invitations.',
    goalTracks: ['track-social'] },
  { key: 'm4w3-madeiran-expressions', month: 4, day: 71, level: 3, cefr: 'B1', category: 'social',
    title: 'Madeiran Expressions & Humour', theme: 'Understanding and using local turns of phrase and gentle humour so conversation feels natural, not textbook.',
    goalTracks: ['track-social'] },
  { key: 'm4w4-month4-stress-test', month: 4, day: 78, level: 3, cefr: 'B1', category: 'social',
    title: 'Month 4 Stress Test', theme: 'Mixed real-time social conversation: neighbours, festival, opinions and local expressions combined under light pressure.',
    goalTracks: ['track-social'] },

  // Month 5 — Social Mastery / problem solving (L4 / B1)
  { key: 'm5w1-complaint-politely', month: 5, day: 85, level: 4, cefr: 'B1', category: 'social',
    title: 'Making a Complaint Politely', theme: 'Raising a problem — a wrong bill, poor service, a mistake — firmly but politely, the Portuguese indirect way.',
    goalTracks: ['track-social', 'track-bureaucracy'] },
  { key: 'm5w2-negotiating-arranging', month: 5, day: 92, level: 4, cefr: 'B1', category: 'daily',
    title: 'Negotiating & Arranging', theme: 'Agreeing prices, times and terms: getting a tradesperson to commit, pushing back on a quote, settling on a plan.',
    goalTracks: ['track-host', 'track-work'] },
  { key: 'm5w3-misunderstandings-repair', month: 5, day: 99, level: 4, cefr: 'B1', category: 'social',
    title: 'Repairing Misunderstandings', theme: 'When something is misheard or goes wrong mid-conversation: clarifying, apologising, and getting back on track.',
    goalTracks: ['track-social'] },
  { key: 'm5w4-month5-stress-test', month: 5, day: 106, level: 4, cefr: 'B1', category: 'social',
    title: 'Month 5 Stress Test', theme: 'Problem-solving under pressure: complaints, negotiation and misunderstandings combined in messy real-life exchanges.',
    goalTracks: ['track-social'] },

  // Month 6 — Full Immersion (L5 / B2)
  { key: 'm6w1-telling-a-story', month: 6, day: 113, level: 5, cefr: 'B2', category: 'social',
    title: 'Telling a Story', theme: 'Holding the floor: recounting something that happened with tenses, connectors and colour, and reacting to others’ stories.',
    goalTracks: ['track-social'] },
  { key: 'm6w2-formal-email-office', month: 6, day: 120, level: 5, cefr: 'B2', category: 'work',
    title: 'Formal Email & Office Portuguese', theme: 'Writing and speaking formally: a well-structured email, a professional phone call, resident-level register.',
    goalTracks: ['track-work', 'track-bureaucracy'] },
  { key: 'm6w3-debating-opinions', month: 6, day: 127, level: 5, cefr: 'B2', category: 'social',
    title: 'Debating & Defending Opinions', theme: 'Discussing a real topic with a Madeiran: agreeing, disagreeing, conceding and holding your ground with nuance.',
    goalTracks: ['track-social'] },
  { key: 'm6w4-final-immersion-test', month: 6, day: 134, level: 5, cefr: 'B2', category: 'social',
    title: 'Full Immersion Final Test', theme: 'The graduation exchange: an unscripted, multi-topic conversation drawing on everything — the integrated-resident test.',
    goalTracks: ['track-social'] },
];

// Per-track net-new situations (not calendar-bound; no course slot).
const TRACK_GENERATION = [
  // B — Property Owner / Host
  { key: 'host-boiler-not-working', level: 2, cefr: 'A2', goalTracks: ['track-host'],
    title: 'The Boiler Is Not Working', theme: 'Phoning a technician because the boiler / water heater (esquentador) has stopped and there is no hot water for guests — describing the fault, arranging a visit.' },
  { key: 'host-guest-noise-complaint', level: 3, cefr: 'B1', goalTracks: ['track-host', 'track-social'],
    title: 'Guest Complaint About Noise', theme: 'Handling a guest complaining about noise from neighbours or the street, apologising, and speaking to a neighbour to ask them to keep it down.' },
  { key: 'host-guest-checkin-handover', level: 2, cefr: 'A2', goalTracks: ['track-host'],
    title: 'Guest Check-in & Key Handover', theme: 'Meeting a guest to hand over keys: explaining the flat, wifi, rubbish days, and what to do in an emergency.' },
  { key: 'host-briefing-the-cleaner', level: 2, cefr: 'A2', goalTracks: ['track-host', 'track-work'],
    title: 'Briefing the Cleaner', theme: 'Telling the cleaner (a senhora da limpeza) what to do before the next check-in: turnaround, laundry, what to restock and when to come.' },
  { key: 'host-reporting-a-water-leak', level: 3, cefr: 'B1', goalTracks: ['track-host'],
    title: 'Reporting a Water Leak', theme: 'Calling a plumber (canalizador) about a leak: locating it, urgency, agreeing a price and a time to come.' },

  // D — Bureaucracy / Services
  { key: 'bureau-calling-financas', level: 4, cefr: 'B1', goalTracks: ['track-bureaucracy'],
    title: 'Calling Finanças', theme: 'Phoning the tax office (Finanças) about your NIF or a tax matter: waiting, explaining your situation, and understanding what document you must bring.' },
  { key: 'bureau-registering-health-centre', level: 3, cefr: 'B1', goalTracks: ['track-bureaucracy'],
    title: 'Registering at the Health Centre', theme: 'Registering at the centro de saúde and asking to be assigned a family doctor: the counter conversation, the forms, the follow-up.' },
  { key: 'bureau-opening-bank-account', level: 3, cefr: 'B1', goalTracks: ['track-bureaucracy'],
    title: 'Opening a Bank Account', theme: 'Opening an account at the bank counter: what you need, the questions the clerk asks, and setting up the card and app.' },
  { key: 'bureau-utilities-setup', level: 2, cefr: 'A2', goalTracks: ['track-bureaucracy', 'track-host'],
    title: 'Setting Up Electricity & Water', theme: 'Setting up or transferring the electricity and water (a luz e a água) for a home: giving the meter reading, the address, and arranging billing.' },
  { key: 'bureau-junta-residency', level: 4, cefr: 'B1', goalTracks: ['track-bureaucracy'],
    title: 'Residency at the Junta de Freguesia', theme: 'At the Junta de Freguesia asking for a certificate of residence (atestado de residência): explaining what you need it for and which documents prove it.' },

  // E — Work / Business
  { key: 'work-scheduling-site-visit', level: 3, cefr: 'B1', goalTracks: ['track-work', 'track-host'],
    title: 'Scheduling a Site Visit', theme: 'Arranging for someone to come and see a job in person: proposing days and times, confirming the address, and reconfirming the day before.' },
  { key: 'work-scope-escalation', level: 4, cefr: 'B1', goalTracks: ['track-work'],
    title: 'Scope Escalation', theme: 'A job has grown beyond what was agreed: explaining the extra work, the extra cost and time, and getting the client to approve before continuing.' },
  { key: 'work-quoting-a-job', level: 3, cefr: 'B1', goalTracks: ['track-work', 'track-host'],
    title: 'Quoting a Job', theme: 'Giving or asking for a quote (um orçamento): what is included, when it can be done, and how payment works.' },
  { key: 'work-chasing-an-invoice', level: 4, cefr: 'B1', goalTracks: ['track-work'],
    title: 'Chasing an Unpaid Invoice', theme: 'Politely but firmly following up on an invoice that has not been paid: reminding, restating the amount, and agreeing a date to settle.' },
  { key: 'work-introductions-networking', level: 3, cefr: 'B1', goalTracks: ['track-work', 'track-social'],
    title: 'Professional Introductions', theme: 'Introducing yourself and your work at a meeting or a networking event: your role, what you do, and asking about theirs.' },

  // A — Survival (net-new gaps the seed lacks)
  { key: 'survival-taxi-from-airport', level: 0, cefr: 'A1', goalTracks: ['track-survival'],
    title: 'A Taxi from the Airport', theme: 'Taking a taxi from Madeira airport into Funchal: giving the address, asking the fare, and paying.' },
  { key: 'survival-buying-sim-and-bus', level: 1, cefr: 'A2', goalTracks: ['track-survival'],
    title: 'SIM Card & Bus Ticket', theme: 'Getting a phone SIM (cartão) and a bus (autocarro) ticket: asking for what you need, understanding the price, and topping up.' },

  // C — Social (a couple of net-new everyday-belonging gaps)
  { key: 'social-dinner-invitation', level: 3, cefr: 'B1', goalTracks: ['track-social'],
    title: 'A Dinner Invitation', theme: 'Being invited to a neighbour’s or friend’s home for dinner: accepting, asking what to bring, and the table small talk once there.' },
  { key: 'social-making-plans-weekend', level: 2, cefr: 'A2', goalTracks: ['track-social'],
    title: 'Making Weekend Plans', theme: 'Arranging to meet up: suggesting a levada walk or a coffee, agreeing a time and place, and confirming by message.' },
];

// Build the full generation queue (each item -> one FULL situation).
function buildGenSpecs() {
  const specs = [];
  for (const c of COURSE_M4_6) {
    specs.push({
      id: `sit-${c.key}`,
      kind: 'course',
      title: c.title,
      theme: c.theme,
      level: c.level,
      cefr: c.cefr,
      category: c.category,
      course: { month: c.month, day: c.day, category: c.category },
      goalTracks: c.goalTracks,
    });
  }
  for (const g of TRACK_GENERATION) {
    specs.push({
      id: `sit-${g.key}`,
      kind: 'track',
      title: g.title,
      theme: g.theme,
      level: g.level,
      cefr: g.cefr,
      course: null,
      goalTracks: g.goalTracks,
    });
  }
  return specs;
}

// ---------------------------------------------------------------------------
// pt-PT enforcement + level-lock (mirror scripts/enrich-content.mjs)
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
- Madeiran spoken realism where natural: reductions ("tá" for "está", "p'ra" for "para"), "pois"/"pois é" for agreement, "Diga!"/"Diz?"/"Como?" when not hearing, "imenso" (a lot), "um bocado" (a little), local words (bica, semilha, levada, poncha, bolo do caco, espetada). Realism, NOT phonetic dialect spelling — write standard orthography.
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

const SYSTEM_INSTRUCTION_BASE = `You are the FalaMadeira content-generation engine for European Portuguese as spoken in Madeira. You output STRICT, VALID JSON only — no prose, no markdown fences, no commentary.

${PT_PT_ENFORCEMENT}

${VOICE_TYPES_DOC}`;

function levelLockBlock(level) {
  const p = PRACTICAL_LEVELS[level];
  return p
    ? `LEVEL LOCK — the learner is at ${p}
- Speak AT this level (at most i+1). Keep sentences, vocabulary and grammar within reach for this level.
- Do NOT dump advanced grammar, rare tenses, or vocabulary the learner is unlikely to know at this level.`
    : '';
}

// ---------------------------------------------------------------------------
// Prompt builder — asks for a FULL situation body in exact schema shapes
// ---------------------------------------------------------------------------
function buildUserPrompt(spec) {
  const ll = levelLockBlock(spec.level);
  return `${ll}

NEW SITUATION TO AUTHOR (id "${spec.id}", level L${spec.level}, CEFR ${spec.cefr}):
Title: ${spec.title}
Real-life context to anchor everything in: ${spec.theme}

TASK: Author a COMPLETE, self-contained FalaMadeira Situation for daily life in Madeira, strictly within level L${spec.level}. It must be practiceable by MULTIPLE modes from its own data. Return a single JSON object with EXACTLY these keys:

{
  "phrase_patterns": [
    // 3-5 base phrases. Each id MUST be unique and start with "pp-${spec.id}-".
    // Give 2-4 of them a "slots" array (a slot {name} MUST appear literally in that base as "{name}")
    // and/or a "variants" array. base/slot options/variant text are pt-PT.
    {
      "id": "pp-${spec.id}-1",
      "base": "<pt-PT base phrase, may contain {slot} markers>",
      "translation": "<English>",
      "slots": [ { "name": "<lowercase, no spaces>", "description": "<English>", "options": ["<pt-PT>", "..."] } ],
      "variants": [ { "text": "<pt-PT>", "translation": "<English>", "register": "informal|neutral|formal", "note": "<optional English>" } ]
    }
  ],
  "vocabulary": [
    // 5-8 words/phrases central to this situation. word is pt-PT; translation + pronunciation are English.
    { "word": "<pt-PT>", "translation": "<English>", "pronunciation": "<English-reader phonetic, e.g. BEE-kah>", "register": "informal|neutral|formal", "note": "<optional, mark Madeira/Portugal regionalisms>" }
  ],
  "dialogues": [
    // 1-2 multi-speaker dialogues. Each line MUST carry a valid voice_type. Each dialogue needs a "context".
    { "id": "dlg-${spec.id}-1", "title": "<short English>", "context": "<where/who/what, English>",
      "lines": [ { "speaker": "<role/name>", "voice_type": "<one of the 7>", "text": "<pt-PT>", "translation": "<English>" } ] }
  ],
  "cultural_notes": [
    // 1-2 structured notes: the social code, register, indirectness, timing or local practice this situation needs.
    { "title": "<English>", "body": "<English explainer>" }
  ],
  "roleplay": {
    // ONE branching roleplay. difficulty is an integer 1-5 appropriate to L${spec.level}
    // (L0-L1 -> 1-2 guided; L2-L3 -> 2-3; L4 -> 4; L5 -> 5 messy real-life).
    "scenario": "<English scene description>",
    "difficulty": <1-5>,
    "entry_node": "<id of the starting node>",
    "nodes": [
      { "id": "<node id>", "npc_text": "<pt-PT>", "npc_translation": "<English>", "npc_voice_type": "<one of the 7>",
        "options": [ { "text": "<pt-PT learner line>", "translation": "<English>", "next": "<another node id, or omit to end>", "feedback": "<English coaching>" } ] }
    ]
    // 4-6 nodes; at least one branch reaches a terminal node (options: []). Every "next" MUST match a node id. entry_node MUST match a node id.
  },
  "mission": {
    "title": "<English real-world assignment title>",
    "prep": ["<English rehearsal step>", "..."],
    "fallback_phrases": ["<pt-PT escape-hatch phrase>", "..."],
    "likely_responses": ["<pt-PT what the other party will probably say>", "..."]
  },
  "goals": ["<English learner-facing objective>", "..."]
}

Rules:
- Portuguese ONLY in: phrase_pattern base, slot options, variant text, vocabulary word, dialogue line text, roleplay npc_text and option text, mission fallback_phrases and likely_responses. Everything else (titles, translations, descriptions, goals, prep, feedback, cultural note bodies, pronunciation guides) is ENGLISH.
- Obey the pt-PT / anti-Brazilian and level-lock rules in your system instruction for ALL Portuguese.
- Ground everything in real daily life in Madeira for this exact situation. No invented slang, no phonetic dialect spelling.
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
        if (res.status === 429 || res.status >= 500) throw new Error(`retryable ${res.status}: ${body}`);
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
// Assemble a FULL situation from a spec + generated body (schema-repaired)
// ---------------------------------------------------------------------------
function assembleSituation(spec, gen) {
  const tracks = new Set([TRACK_STRUCTURED, ...spec.goalTracks]);
  // Track-only situations should NOT claim structured-course membership unless they carry a course slot.
  if (spec.kind === 'track') tracks.delete(TRACK_STRUCTURED);

  const sit = {
    id: spec.id,
    title: spec.title,
    summary: spec.theme,
    tracks: [...tracks],
    level: spec.level,
    cefr: spec.cefr,
    phrase_patterns: normalizePatterns(gen.phrase_patterns, spec.id),
    vocabulary: normalizeVocab(gen.vocabulary),
  };

  const dialogues = normalizeDialogues(gen.dialogues, spec.id);
  if (dialogues.length) sit.dialogues = dialogues;

  const notes = normalizeNotes(gen.cultural_notes);
  if (notes.length) sit.cultural_notes = notes;

  const rp = normalizeRoleplay(gen.roleplay, spec.level);
  if (rp) sit.roleplay = rp;

  const mission = normalizeMission(gen.mission);
  if (mission) sit.mission = mission;

  const goals = Array.isArray(gen.goals)
    ? gen.goals.filter((g) => typeof g === 'string' && g.trim()).map(String)
    : [];
  if (goals.length) sit.goals = goals;

  if (spec.course) {
    sit.course = { month: spec.course.month, day: spec.course.day, category: spec.course.category };
  }

  sit.review_items = deriveReviewItems(sit);
  return sit;
}

function normalizePatterns(arr, sid) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  let n = 0;
  const seen = new Set();
  for (const p of arr) {
    if (!p || typeof p.base !== 'string' || !p.base.trim()) continue;
    n += 1;
    let id = typeof p.id === 'string' && p.id.trim() ? p.id : `pp-${sid}-${n}`;
    if (seen.has(id)) id = `pp-${sid}-${n}`;
    seen.add(id);
    const pat = { id, base: String(p.base) };
    if (typeof p.translation === 'string') pat.translation = p.translation;
    // slots: keep only those whose {name} the base references (schema warns otherwise)
    if (Array.isArray(p.slots)) {
      const slots = p.slots
        .filter(
          (s) =>
            s && typeof s.name === 'string' && s.name.trim() &&
            Array.isArray(s.options) && s.options.filter((o) => typeof o === 'string' && o.trim()).length > 0 &&
            pat.base.includes(`{${s.name}}`)
        )
        .map((s) => ({
          name: String(s.name),
          ...(typeof s.description === 'string' && s.description.trim() ? { description: s.description } : {}),
          options: s.options.filter((o) => typeof o === 'string' && o.trim()).map(String),
        }));
      if (slots.length) pat.slots = slots;
    }
    if (Array.isArray(p.variants)) {
      const variants = p.variants
        .filter((v) => v && typeof v.text === 'string' && v.text.trim())
        .map((v) => ({
          text: String(v.text),
          ...(typeof v.translation === 'string' ? { translation: v.translation } : {}),
          ...(schema.REGISTERS?.includes?.(v.register) ? { register: v.register } : {}),
          ...(typeof v.note === 'string' && v.note.trim() ? { note: v.note } : {}),
        }));
      if (variants.length) pat.variants = variants;
    }
    out.push(pat);
  }
  return out;
}

function normalizeVocab(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((v) => v && typeof v.word === 'string' && v.word.trim() && typeof v.translation === 'string' && v.translation.trim())
    .map((v) => ({
      word: String(v.word),
      translation: String(v.translation),
      ...(typeof v.pronunciation === 'string' && v.pronunciation.trim() ? { pronunciation: v.pronunciation } : {}),
      ...(schema.REGISTERS?.includes?.(v.register) ? { register: v.register } : {}),
      ...(typeof v.note === 'string' && v.note.trim() ? { note: v.note } : {}),
    }));
}

function normalizeDialogues(arr, sid) {
  if (!Array.isArray(arr)) return [];
  const dlgs = [];
  arr.forEach((d, i) => {
    if (!d || !Array.isArray(d.lines) || d.lines.length === 0) return;
    const lines = d.lines
      .filter((l) => l && typeof l.text === 'string' && l.text.trim() && typeof l.speaker === 'string' && l.speaker.trim())
      .map((l) => ({
        speaker: String(l.speaker),
        voice_type: schema.VOICE_TYPES.includes(l.voice_type) ? l.voice_type : 'local',
        text: String(l.text),
        ...(typeof l.translation === 'string' ? { translation: l.translation } : {}),
      }));
    if (lines.length === 0) return;
    dlgs.push({
      id: `dlg-${sid}-${i + 1}`,
      ...(typeof d.title === 'string' && d.title.trim() ? { title: d.title } : {}),
      ...(typeof d.context === 'string' && d.context.trim() ? { context: d.context } : {}),
      lines,
    });
  });
  return dlgs;
}

function normalizeNotes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((n) => n && typeof n.title === 'string' && n.title.trim() && typeof n.body === 'string' && n.body.trim())
    .map((n) => ({ title: n.title, body: n.body }));
}

function normalizeRoleplay(rp, level) {
  if (!rp || !Array.isArray(rp.nodes) || rp.nodes.length === 0) return null;
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
  const entry = typeof rp.entry_node === 'string' && idSet.has(rp.entry_node) ? rp.entry_node : clean[0].id;
  let difficulty = Number(rp.difficulty);
  if (!schema.ROLEPLAY_DIFFICULTIES.includes(difficulty)) {
    difficulty = Math.max(1, Math.min(5, level >= 5 ? 5 : level >= 4 ? 4 : level >= 2 ? 3 : level >= 1 ? 2 : 1));
  }
  const scenario = typeof rp.scenario === 'string' && rp.scenario.trim() ? rp.scenario : 'Practise this situation.';
  return { scenario, difficulty, entry_node: entry, nodes: clean };
}

function normalizeMission(m) {
  if (!m || typeof m.title !== 'string' || !m.title.trim()) return null;
  const strArr = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map(String) : []);
  const prep = strArr(m.prep);
  const fb = strArr(m.fallback_phrases);
  const lr = strArr(m.likely_responses);
  if (!prep.length || !fb.length || !lr.length) return null;
  return { title: m.title, prep, fallback_phrases: fb, likely_responses: lr };
}

// Deterministic review items derived from the situation's own data.
function deriveReviewItems(sit) {
  const items = [];
  const sid = sit.id;
  (sit.phrase_patterns ?? []).slice(0, 4).forEach((p, i) => {
    items.push({
      id: `rv-${sid}-say-${i + 1}`,
      dimension: 'say',
      prompt: p.translation ? `Say in Portuguese: ${p.translation}` : `Say this phrase from memory: "${p.base}"`,
      answer: p.base,
      source_ref: p.id,
    });
  });
  (sit.vocabulary ?? []).slice(0, 4).forEach((v, i) => {
    items.push({
      id: `rv-${sid}-retrieve-${i + 1}`,
      dimension: 'retrieve',
      prompt: `Recall the Portuguese for: ${v.translation}`,
      answer: v.word,
      source_ref: v.word,
    });
  });
  if ((sit.dialogues ?? []).length > 0) {
    items.push({
      id: `rv-${sid}-hear-1`,
      dimension: 'hear',
      prompt: 'Listen to the dialogue at natural speed and answer: what is being asked for?',
      source_ref: sit.dialogues[0].id,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Video curation (oEmbed-verified; never fabricate an id)
// ---------------------------------------------------------------------------
// Candidate real pt-PT YouTube videos. Each is oEmbed-verified (HTTP 200) at run time
// BEFORE it is attached; a candidate that fails verification is left absent.
// Candidates were sourced from European-Portuguese teaching channels; verification is
// authoritative — no id is trusted without a live 200 from YouTube oEmbed.
const VIDEO_CANDIDATES = [
  // Re-curate the 2 dead seed videos (id S2_YmG_l-p4 -> 404). Both replacements were
  // found via WebSearch and oEmbed-verified 200 (2026-07-10) on European-Portuguese channels.
  { situationId: 'sit-d1-greetings-presence', replaceDead: true,
    // Mia Esmeriz Academy — "European Portuguese Lessons For Beginners: GREETINGS and INTRODUCTIONS"
    url: 'https://www.youtube.com/watch?v=pgC1ofHxm7s',
    caption: 'Greetings & introductions in European Portuguese (Portugal)' },
  { situationId: 'sit-d15-talking-about-others', replaceDead: true,
    // Learn Portuguese Today — European-Portuguese describing-people vocabulary (hair/features)
    url: 'https://www.youtube.com/watch?v=6F1ld7zv7yM',
    caption: 'Describing people vocabulary — European Portuguese (Portugal)' },
  // New week-block anchor (attach only if verified). Madeira food/arraial context.
  { situationId: 'sit-m4w2-festival-arraial',
    // Madeira food tour — espetada, bolo do caco, poncha (Madeira context for the arraial situation)
    url: 'https://www.youtube.com/watch?v=dd_NTKErny8',
    caption: 'Madeiran food & festival culture: espetada, bolo do caco, poncha' },
];

function extractYouTubeId(url) {
  const m = String(url).match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(url).match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

async function oembedOk(url) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { method: 'GET' }
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

// Verify candidates once; return a map situationId -> [verified MediaRef].
async function verifyVideoCandidates() {
  const attach = new Map(); // situationId -> MediaRef
  const results = []; // { situationId, url, id, status, action }
  for (const c of VIDEO_CANDIDATES) {
    const id = extractYouTubeId(c.url);
    if (!id) {
      results.push({ situationId: c.situationId, url: c.url, id: null, verified: false, action: 'left-absent (no id)' });
      continue;
    }
    const ok = await oembedOk(c.url);
    if (ok) {
      attach.set(c.situationId, { type: 'video', url: c.url, caption: c.caption });
      results.push({ situationId: c.situationId, url: c.url, id, verified: true, action: 'attached' });
    } else {
      results.push({ situationId: c.situationId, url: c.url, id, verified: false, action: 'left-absent (oEmbed != 200)' });
    }
    await sleep(150);
  }
  return { attach, results };
}

// Remove the known dead placeholder id from every seed situation's media[].
const DEAD_VIDEO_ID = 'S2_YmG_l-p4';
function stripDeadVideos(situations) {
  let removed = 0;
  for (const s of situations) {
    if (!Array.isArray(s.media)) continue;
    const before = s.media.length;
    s.media = s.media.filter((m) => !(m && typeof m.url === 'string' && m.url.includes(DEAD_VIDEO_ID)));
    removed += before - s.media.length;
  }
  return removed;
}

function attachVerifiedVideos(byId, attachMap) {
  let attached = 0;
  for (const [sid, ref] of attachMap) {
    const s = byId.get(sid);
    if (!s) continue;
    const media = Array.isArray(s.media) ? [...s.media] : [];
    if (!media.some((m) => m && m.url === ref.url)) {
      media.push({ ...ref });
      attached += 1;
    }
    s.media = media;
  }
  return attached;
}

// ---------------------------------------------------------------------------
// Pack assembly + checksum
// ---------------------------------------------------------------------------
function assemblePack(base, situations, tracks) {
  const pack = {
    id: base.id,
    name: base.name,
    version: NEW_PACK_VERSION,
    schema_version: base.schema_version ?? schema.CONTENT_SCHEMA_VERSION,
    status: base.status ?? 'published',
    situations,
    tracks,
  };
  pack.checksum = createHash('sha256').update(schema.canonicalPackPayload(pack), 'utf8').digest('hex');
  return pack;
}

// Build all track rows: keep the existing structured-course track (ordered by day),
// then the 5 goal tracks ordered by level/day.
function buildTracks(base, situations, retagMapping) {
  const byId = new Map(situations.map((s) => [s.id, s]));
  const tracks = [];

  // Structured-course: keep existing membership; append any NEW course situations by day.
  const existingStructured = (base.tracks ?? []).find((t) => t.id === TRACK_STRUCTURED);
  const structuredIds = situations
    .filter((s) => (s.tracks ?? []).includes(TRACK_STRUCTURED))
    .sort((a, b) => (a.course?.day ?? 9999) - (b.course?.day ?? 9999) || a.id.localeCompare(b.id))
    .map((s) => s.id);
  tracks.push({
    id: TRACK_STRUCTURED,
    name: existingStructured?.name ?? 'Structured Course',
    goal: existingStructured?.goal ?? 'Follow the month-by-month structured Madeira Portuguese course',
    situations: structuredIds,
  });

  for (const g of GOAL_TRACKS) {
    const ids = orderTrackSituations(retagMapping[g.id] ?? [], byId);
    tracks.push({ id: g.id, name: g.name, goal: g.goal, situations: ids });
  }
  return tracks;
}

// ---------------------------------------------------------------------------
// State (resumable checkpoint)
// ---------------------------------------------------------------------------
function loadState() {
  if (RESET || !existsSync(STATE_FILE)) return { generated: {}, failed: {}, batches: 0 };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { generated: {}, failed: {}, batches: 0 };
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
        [s.id, pack.id, JSON.stringify(s), s.level, s.cefr, s.tracks, s.course?.month ?? null, s.course?.day ?? null, 3]
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
    // Idempotency: drop projection rows of this pack no longer present.
    const sitIds = pack.situations.map((s) => s.id);
    const trkIds = (pack.tracks ?? []).map((t) => t.id);
    await client.query(`DELETE FROM public.situations WHERE pack_id=$1 AND NOT (id = ANY($2))`, [pack.id, sitIds]);
    await client.query(`DELETE FROM public.tracks WHERE pack_id=$1 AND NOT (id = ANY($2))`, [pack.id, trkIds]);
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

// ===========================================================================
// MAIN
// ===========================================================================
mkdirSync(REVIEW_DIR, { recursive: true });

const base = JSON.parse(readFileSync(JSON_IN, 'utf8'));
if (!Array.isArray(base.situations) || base.situations.length === 0) {
  console.error('FATAL: base pack has no situations');
  process.exit(1);
}
// The generation spec ids (net-new situations this script authors). Any situation whose id
// is NOT a spec id is an enriched M1-3 seed situation — even on a resumed run where the base
// pack file already contains previously-generated situations. This is the robust seed/generated
// discriminator used by retagSituations (seed => keyword-classify; generated => preserve authored tracks).
const GEN_SPEC_IDS = new Set(buildGenSpecs().map((s) => s.id));
const SEED_IDS = new Set(base.situations.map((s) => s.id).filter((id) => !GEN_SPEC_IDS.has(id)));
const SEED_COUNT = SEED_IDS.size;

const state = loadState();

// Self-heal: a checkpointed generated situation's tracks[] is DERIVED from its spec
// (deterministic), never from the model. Re-derive it here so the authored track memberships
// are authoritative on every (re-)run, independent of any earlier bug that may have mutated
// the checkpoint by reference. Content fields are left untouched.
{
  const specById = new Map(buildGenSpecs().map((s) => [s.id, s]));
  for (const [id, sit] of Object.entries(state.generated)) {
    const spec = specById.get(id);
    if (!spec || !sit) continue;
    const tracks = new Set(spec.goalTracks);
    if (spec.kind === 'course') tracks.add(TRACK_STRUCTURED); // course situations join the structured course
    sit.tracks = [...tracks];
    if (spec.course && !sit.course) sit.course = { ...spec.course };
  }
}

// Working situations, id-indexed. Start from the base (enriched seed) + any previously
// generated situations checkpointed in state (so re-runs are idempotent + resumable).
const working = new Map(base.situations.map((s) => [s.id, structuredClone(s)]));
for (const [id, sit] of Object.entries(state.generated)) {
  if (sit && sit.id) working.set(id, structuredClone(sit));
}

// ---- PHASE 1: RE-TAG (always run; deterministic) --------------------------
console.log('=== PHASE 1: re-tag existing situations into goal tracks ===');
// Re-tag ALL current situations (seed + already-generated) so tracks[] is consistent.
const retagMapping = retagSituations([...working.values()], SEED_IDS);
for (const g of GOAL_TRACKS) {
  console.log(`  ${g.id.padEnd(20)} ${retagMapping[g.id].length} situations`);
}

// ---- PHASE 2: GENERATE net-new situations ---------------------------------
const specs = buildGenSpecs();
// pending = specs not yet generated+validated in a prior run (checkpointed in state).
const pending = specs.filter((s) => !state.generated[s.id]);
const targets = RETAG_ONLY ? [] : LIMIT > 0 ? pending.slice(0, LIMIT) : pending;

console.log(`\n=== PHASE 2: generate net-new situations — model=${MODEL} batch=${BATCH_SIZE} skipDb=${SKIP_DB} ===`);
console.log(`spec total: ${specs.length}  already generated: ${Object.keys(state.generated).length}  this run targets: ${targets.length}`);

// Verify video candidates once up-front (before we may need to attach them).
let videoResults = [];
let videoAttach = new Map();
if (!NO_VIDEO) {
  console.log('\n--- verifying video candidates via YouTube oEmbed ---');
  const v = await verifyVideoCandidates();
  videoResults = v.results;
  videoAttach = v.attach;
  for (const r of videoResults) console.log(`  ${r.verified ? 'OK ' : 'X  '} ${r.situationId}  ${r.url}  -> ${r.action}`);
}

function finalizeAndWrite(reviewForBatch, batchIndex) {
  // Re-tag everything currently in `working` (covers newly-added situations).
  const allSits = [...working.values()];
  const mapping = retagSituations(allSits, SEED_IDS);
  const byId = new Map(allSits.map((s) => [s.id, s]));

  // Video: strip dead ids everywhere, attach verified candidates.
  const removedDead = stripDeadVideos(allSits);
  const attachedVideos = NO_VIDEO ? 0 : attachVerifiedVideos(byId, videoAttach);

  // Deterministic situation order: seed order first (by original index), then generated by id.
  const seedOrder = new Map(base.situations.map((s, i) => [s.id, i]));
  const ordered = allSits.sort((a, b) => {
    const ia = seedOrder.has(a.id) ? seedOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
    const ib = seedOrder.has(b.id) ? seedOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    // both generated (or both seed with equal index — impossible): course day then id
    const da = a.course?.day ?? 99999;
    const db = b.course?.day ?? 99999;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });

  const tracks = buildTracks(base, ordered, mapping);
  const pack = assemblePack(base, ordered, tracks);

  const result = schema.validateContentPack(pack);
  if (!result.valid) {
    console.error(`  FATAL: assembled pack invalid (${result.errors.length} errors) — not writing/publishing`);
    result.errors.slice(0, 12).forEach((e) => console.error(`    ${e.path}: ${e.message}`));
    saveState(state);
    process.exit(1);
  }

  writeFileSync(JSON_OUT, JSON.stringify(pack, null, 2) + '\n', 'utf8');
  saveState(state);
  console.log(`  wrote ${JSON_OUT} (version ${pack.version}, ${pack.situations.length} situations, ${pack.tracks.length} tracks, checksum ${pack.checksum.slice(0, 12)}…)`);
  console.log(`  videos: removed ${removedDead} dead, attached ${attachedVideos} verified`);

  if (reviewForBatch && reviewForBatch.length) {
    const reviewFile = join(REVIEW_DIR, `tracks-batch-${batchIndex}.json`);
    writeFileSync(
      reviewFile,
      JSON.stringify(
        {
          batch: batchIndex,
          model: MODEL,
          generated_at: new Date().toISOString(),
          retag_mapping: mapping,
          video_results: videoResults,
          count: reviewForBatch.length,
          situations: reviewForBatch,
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
    console.log(`  review -> ${reviewFile}`);
  }
  return pack;
}

let batchIndex = state.batches;
let lastPack = null;

if (targets.length === 0) {
  // Re-tag-only (or nothing pending): still rebuild tracks + video + write + publish once.
  batchIndex += 1;
  state.batches = batchIndex;
  lastPack = finalizeAndWrite([], batchIndex);
  if (!SKIP_DB) await publishToDb(lastPack);
} else {
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    batchIndex += 1;
    console.log(`\n=== Batch ${batchIndex} (${batch.length} situations) ===`);
    const review = [];

    for (const spec of batch) {
      process.stdout.write(`  ${spec.id} [${spec.kind} L${spec.level}] ... `);
      try {
        const gen = await generateJson(buildUserPrompt(spec), { retries: 4 });
        const sit = assembleSituation(spec, gen);
        const issues = schema.validateSituation(sit, `situation:${spec.id}`);
        const errors = issues.filter((x) => x.severity === 'error');
        if (errors.length) {
          console.log(`INVALID (${errors.length} err) — skipped`);
          errors.slice(0, 4).forEach((e) => console.log(`      ${e.path}: ${e.message}`));
          state.failed[spec.id] = { reason: 'schema-invalid', errors: errors.map((e) => `${e.path}: ${e.message}`) };
          continue;
        }
        working.set(spec.id, sit);
        state.generated[spec.id] = sit;
        delete state.failed[spec.id];
        console.log(
          `OK  ${sit.phrase_patterns.length}pp ${sit.vocabulary.length}voc ${(sit.dialogues?.length ?? 0)}dlg ${sit.roleplay ? 1 : 0}rp ${sit.mission ? 1 : 0}mis`
        );
        review.push({
          id: sit.id,
          kind: spec.kind,
          title: sit.title,
          level: sit.level,
          cefr: sit.cefr,
          tracks: sit.tracks,
          course: sit.course ?? null,
          situation: sit,
        });
      } catch (e) {
        console.log(`FAILED — ${e.message.slice(0, 100)}`);
        state.failed[spec.id] = { reason: 'gemini-failed', message: e.message.slice(0, 200) };
      }
    }

    state.batches = batchIndex;
    lastPack = finalizeAndWrite(review, batchIndex);
    if (!SKIP_DB) await publishToDb(lastPack);
  }
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
const genCount = Object.keys(state.generated).length;
const failedIds = Object.keys(state.failed);
const finalMapping = retagSituations([...working.values()], SEED_IDS);
console.log('\n=== Generation summary ===');
console.log(`seed situations (unchanged content, re-tagged): ${SEED_COUNT}`);
console.log(`net-new situations generated + validated:       ${genCount} / ${specs.length} specs`);
console.log(`pending specs:                                  ${specs.length - genCount}${
  specs.length - genCount ? ' — ' + specs.filter((s) => !state.generated[s.id]).map((s) => s.id).join(', ') : ''
}`);
console.log(`failed this run:                                ${failedIds.length}${failedIds.length ? ' — ' + failedIds.join(', ') : ''}`);
console.log('re-tag mapping (situations per goal track):');
for (const g of GOAL_TRACKS) console.log(`  ${g.id.padEnd(20)} ${finalMapping[g.id].length}`);
console.log(`state file:    ${STATE_FILE}`);
console.log(`review files:  ${REVIEW_DIR}/tracks-batch-*.json`);
console.log(`pack JSON:     ${JSON_OUT} (version ${NEW_PACK_VERSION})`);
console.log('NOTE: src/content/packs/seed-course.ts NOT regenerated here (orchestrator regenerates it from JSON).');
