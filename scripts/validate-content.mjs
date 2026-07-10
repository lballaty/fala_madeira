#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/validate-content.mjs
// Description: Content pack validator. Loads src/content/schema.ts (via tsx), runs schema
//              self-tests on inline fixtures, then validates every pack JSON under
//              content/packs/ and src/content/packs/: required fields, level 0-5,
//              CEFR A1-B2, track refs, pack integrity (unique ids, version, checksum),
//              and a European-Portuguese scan flagging Brazilian-Portuguese markers.
//              Exit 0 when valid (or when no packs exist yet), non-zero with a report.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_DIRS = [join(REPO_ROOT, 'content', 'packs'), join(REPO_ROOT, 'src', 'content', 'packs')];

// ---------------------------------------------------------------------------
// European-Portuguese scan: Brazilian-Portuguese markers
// ---------------------------------------------------------------------------
// EXTEND HERE: add new Brazilian lexical markers as [brazilian_term, european_term]
// pairs. Keep entries unambiguous — words that also exist with a common meaning
// in European Portuguese (e.g. "tela" = canvas, "legal" = lawful, "time" clashes
// with English) belong in BR_WARN_MARKERS or need a smarter contextual check.
const BR_ERROR_MARKERS = [
  ['ônibus', 'autocarro'],
  ['ponto de ônibus', 'paragem de autocarro'],
  ['trem', 'comboio'],
  ['banheiro', 'casa de banho'],
  ['celular', 'telemóvel'],
  ['geladeira', 'frigorífico'],
  ['sorvete', 'gelado'],
  ['suco', 'sumo'],
  ['café da manhã', 'pequeno-almoço'],
  ['açougue', 'talho'],
  ['aeromoça', 'assistente de bordo'],
  ['encanador', 'canalizador'],
  ['caminhão', 'camião'],
  ['esporte', 'desporto'],
  ['esportes', 'desportos'],
  ['equipe', 'equipa'],
  ['usuário', 'utilizador'],
  ['usuária', 'utilizadora'],
  ['registro', 'registo'],
  ['cadastro', 'registo'],
  ['gerenciar', 'gerir'],
  ['planejar', 'planear'],
  ['planejamento', 'planeamento'],
];

// Markers that are only suspicious (warning, not error).
// "você" is legitimate EP but must not be the *default* register — EP prefers
// tu (informal) or "o senhor / a senhora" (formal). See docs/CONTENT-STANDARDS.md.
const BR_WARN_MARKERS = [
  ['você', 'check register: tu (informal) or o senhor/a senhora (formal) is usually more natural in EP'],
  ['vocês', 'acceptable plural address in EP, but check the register of surrounding lines'],
];

// Gerund periphrasis: "estou fazendo" (BR) vs "estou a fazer" (EP).
// Matches estar (present/imperfect) + a gerund-shaped word, allowing an
// intervening clitic (me/te/se/nos). EXTEND the exception list for adjectives
// and conjunctions that merely *end* in -ndo (they are not gerunds).
const GERUND_PERIPHRASIS =
  /\best(?:ou|ás|á|amos|ão|ava|avas|ávamos|avam)\s+(?:(?:me|te|se|nos)\s+)?(\p{L}+[aei]ndo)\b/giu;
const GERUND_EXCEPTIONS = new Set(['quando', 'lindo', 'linda', 'brando', 'branda', 'infando']);

// Situation fields that carry Portuguese text (translations/titles are English
// and must NOT be scanned — English "time", "trem"-free prose, etc.).
function collectPortugueseStrings(situation, basePath) {
  const found = []; // { path, text }
  const push = (path, text) => {
    if (typeof text === 'string' && text.trim() !== '') found.push({ path, text });
  };
  (situation.phrase_patterns ?? []).forEach((p, i) => {
    const pp = `${basePath}.phrase_patterns[${i}]`;
    push(`${pp}.base`, p?.base);
    (p?.slots ?? []).forEach((s, j) =>
      (s?.options ?? []).forEach((o, k) => push(`${pp}.slots[${j}].options[${k}]`, o))
    );
    (p?.variants ?? []).forEach((v, j) => push(`${pp}.variants[${j}].text`, v?.text));
  });
  (situation.vocabulary ?? []).forEach((v, i) => push(`${basePath}.vocabulary[${i}].word`, v?.word));
  (situation.dialogues ?? []).forEach((d, i) =>
    (d?.lines ?? []).forEach((l, j) => push(`${basePath}.dialogues[${i}].lines[${j}].text`, l?.text))
  );
  if (situation.roleplay) {
    (situation.roleplay.nodes ?? []).forEach((n, i) => {
      push(`${basePath}.roleplay.nodes[${i}].npc_text`, n?.npc_text);
      (n?.options ?? []).forEach((o, j) =>
        push(`${basePath}.roleplay.nodes[${i}].options[${j}].text`, o?.text)
      );
    });
  }
  if (situation.mission) {
    (situation.mission.fallback_phrases ?? []).forEach((p, i) =>
      push(`${basePath}.mission.fallback_phrases[${i}]`, p)
    );
    (situation.mission.likely_responses ?? []).forEach((p, i) =>
      push(`${basePath}.mission.likely_responses[${i}]`, p)
    );
  }
  (situation.review_items ?? []).forEach((r, i) => {
    push(`${basePath}.review_items[${i}].prompt`, r?.prompt);
    push(`${basePath}.review_items[${i}].answer`, r?.answer);
  });
  return found;
}

function scanEuropeanPortuguese(pack) {
  const errors = [];
  const warnings = [];
  (pack.situations ?? []).forEach((situation, i) => {
    const strings = collectPortugueseStrings(situation ?? {}, `pack.situations[${i}]`);
    for (const { path, text } of strings) {
      const lower = text.toLowerCase();
      for (const [marker, replacement] of BR_ERROR_MARKERS) {
        const re = new RegExp(`(?<!\\p{L})${marker}(?!\\p{L})`, 'iu');
        if (re.test(lower)) {
          errors.push({ path, message: `Brazilian marker "${marker}" — use European "${replacement}"` });
        }
      }
      for (const [marker, hint] of BR_WARN_MARKERS) {
        const re = new RegExp(`(?<!\\p{L})${marker}(?!\\p{L})`, 'iu');
        if (re.test(lower)) {
          warnings.push({ path, message: `"${marker}" found — ${hint}` });
        }
      }
      GERUND_PERIPHRASIS.lastIndex = 0;
      let m;
      while ((m = GERUND_PERIPHRASIS.exec(text)) !== null) {
        if (!GERUND_EXCEPTIONS.has(m[1].toLowerCase())) {
          errors.push({
            path,
            message: `gerund periphrasis "${m[0]}" (Brazilian) — European Portuguese uses "estar a + infinitive" (e.g. "estou a fazer")`,
          });
        }
      }
    }
  });
  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Load the schema module (TypeScript) through tsx — no build step required.
// ---------------------------------------------------------------------------

const schema = await tsImport('../src/content/schema.ts', import.meta.url);

// ---------------------------------------------------------------------------
// Self-tests on inline fixtures (run every time; guard against schema drift)
// ---------------------------------------------------------------------------

function makeValidPack() {
  return {
    id: 'pack-selftest',
    name: 'Self-test pack',
    version: '0.0.1',
    schema_version: schema.CONTENT_SCHEMA_VERSION,
    status: 'draft',
    situations: [
      {
        id: 'sit-cafe',
        title: 'Ordering a bica',
        summary: 'Order coffee and a pastry in a Funchal snack bar.',
        tracks: ['track-a'],
        level: 0,
        cefr: 'A1',
        soft_prerequisites: [],
        goals: ['Order coffee confidently'],
        course: { month: 1, day: 2, category: 'daily', legacy_lesson_id: 'd2' },
        phrase_patterns: [
          {
            id: 'pp-1',
            base: 'Queria {bebida}, se faz favor.',
            translation: 'I would like {drink}, please.',
            slots: [{ name: 'bebida', options: ['uma bica', 'um garoto', 'um galão'] }],
            variants: [{ text: 'Era uma bica, se faz favor.', register: 'neutral' }],
          },
        ],
        vocabulary: [
          { word: 'bica', translation: 'espresso', pronunciation: 'BEE-kah', register: 'neutral' },
        ],
        dialogues: [
          {
            id: 'dlg-1',
            context: 'Morning rush at a snack bar counter.',
            lines: [
              { speaker: 'Empregado', voice_type: 'service', text: 'Bom dia, diga!' },
              { speaker: 'Cliente', voice_type: 'teacher', text: 'Queria uma bica, se faz favor.' },
            ],
          },
        ],
        cultural_notes: [{ title: 'A bica', body: 'A "bica" is the standard espresso in Madeira.' }],
        roleplay: {
          scenario: 'Order at the counter.',
          difficulty: 1,
          entry_node: 'n1',
          nodes: [
            {
              id: 'n1',
              npc_text: 'Bom dia, diga!',
              npc_voice_type: 'service',
              options: [{ text: 'Queria uma bica, se faz favor.', next: 'n2' }],
            },
            { id: 'n2', npc_text: 'É para já!', options: [] },
          ],
        },
        mission: {
          title: 'Order a coffee for real',
          prep: ['Rehearse the base phrase aloud'],
          fallback_phrases: ['Desculpe, pode repetir?'],
          likely_responses: ['É para já!', 'Mais alguma coisa?'],
        },
        review_items: [
          { id: 'rv-1', dimension: 'say', prompt: 'Order an espresso politely', answer: 'Queria uma bica, se faz favor.' },
        ],
        media: [],
      },
    ],
    tracks: [
      { id: 'track-a', name: 'Survival Madeira', goal: 'Handle arrival basics', situations: ['sit-cafe'] },
    ],
  };
}

function runSelfTests() {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok, detail });

  // 1. A fully-populated pack validates cleanly.
  const valid = schema.validateContentPack(makeValidPack());
  check(
    'valid pack passes',
    valid.valid && valid.errors.length === 0,
    valid.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
  );

  // 2. Broken pack: each corruption must be caught.
  const broken = makeValidPack();
  delete broken.version; // missing version
  broken.situations[0].level = 7; // level out of 0-5
  broken.situations[0].cefr = 'C1'; // cefr out of A1-B2
  broken.situations[0].dialogues[0].lines[0].voice_type = 'robot'; // bad voice type
  broken.situations[0].review_items[0].dimension = 'guess'; // bad dimension
  broken.situations[0].roleplay.difficulty = 6; // difficulty out of 1-5
  broken.situations[0].roleplay.nodes[0].options[0].next = 'missing-node'; // dangling branch
  broken.tracks[0].situations.push('sit-ghost'); // unresolved track->situation ref
  broken.situations.push({ ...makeValidPack().situations[0] }); // duplicate situation id
  const bad = schema.validateContentPack(broken);
  const msgs = bad.errors.map((e) => `${e.path} ${e.message}`).join('\n');
  const expects = [
    ['missing version', /pack\.version.*missing/i],
    ['level 7 rejected', /level.*not one of/i],
    ['cefr C1 rejected', /cefr.*not one of/i],
    ['voice_type robot rejected', /voice_type.*not one of/i],
    ['dimension guess rejected', /dimension.*not one of/i],
    ['difficulty 6 rejected', /difficulty.*not one of/i],
    ['dangling roleplay branch', /next "missing-node"/i],
    ['unresolved track ref', /"sit-ghost" not found/i],
    ['duplicate situation id', /duplicate situation id/i],
  ];
  check('broken pack is invalid', !bad.valid);
  for (const [name, re] of expects) check(name, re.test(msgs), 'not found in error report');

  // 3. European-Portuguese scan catches Brazilian markers.
  const brPack = makeValidPack();
  brPack.situations[0].phrase_patterns[0].base = 'Vou pegar o ônibus para o centro.';
  brPack.situations[0].dialogues[0].lines[1].text = 'Estou fazendo o pequeno-almoço.';
  brPack.situations[0].vocabulary[0].word = 'celular';
  const scan = scanEuropeanPortuguese(brPack);
  const scanText = scan.errors.map((e) => e.message).join('\n');
  check('BR lexical marker (ônibus) flagged', /ônibus/.test(scanText));
  check('BR lexical marker (celular) flagged', /celular/.test(scanText));
  check('BR gerund periphrasis flagged', /estou fazendo/i.test(scanText));

  // 4. EP scan does not false-positive on correct European Portuguese.
  const epPack = makeValidPack();
  epPack.situations[0].dialogues[0].lines[1].text = 'Estou a fazer o jantar; o tempo está lindo, e quando chegares avisa.';
  const epScan = scanEuropeanPortuguese(epPack);
  check('correct EP not flagged', epScan.errors.length === 0, JSON.stringify(epScan.errors));

  // 5. você produces a warning (register check), not an error.
  const vcPack = makeValidPack();
  vcPack.situations[0].dialogues[0].lines[1].text = 'E você, o que deseja?';
  const vcScan = scanEuropeanPortuguese(vcPack);
  check('você yields warning not error', vcScan.errors.length === 0 && vcScan.warnings.length > 0);

  // 6. Checksum is computable and deterministic.
  const p1 = schema.canonicalPackPayload(makeValidPack());
  const p2 = schema.canonicalPackPayload(makeValidPack());
  const digest = createHash('sha256').update(p1, 'utf8').digest('hex');
  check('checksum computable + deterministic', p1 === p2 && /^[0-9a-f]{64}$/.test(digest));

  return results;
}

// ---------------------------------------------------------------------------
// Pack discovery + validation
// ---------------------------------------------------------------------------

function discoverPackFiles() {
  const files = [];
  for (const dir of PACK_DIRS) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(join(entry.parentPath ?? entry.path, entry.name));
      }
    }
  }
  return files.sort();
}

function validatePackFile(file) {
  const rel = relative(REPO_ROOT, file);
  let pack;
  try {
    pack = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { rel, errors: [{ path: rel, message: `invalid JSON: ${e.message}` }], warnings: [] };
  }

  const result = schema.validateContentPack(pack);
  const errors = result.errors.map((e) => ({ path: e.path, message: e.message }));
  const warnings = result.warnings.map((w) => ({ path: w.path, message: w.message }));

  // European-Portuguese scan.
  const scan = scanEuropeanPortuguese(pack);
  errors.push(...scan.errors);
  warnings.push(...scan.warnings);

  // Checksum integrity: computable always; must match when declared.
  try {
    const computed = createHash('sha256')
      .update(schema.canonicalPackPayload(pack), 'utf8')
      .digest('hex');
    if (typeof pack.checksum === 'string' && pack.checksum !== '') {
      if (pack.checksum !== computed) {
        errors.push({
          path: 'pack.checksum',
          message: `checksum mismatch: declared ${pack.checksum}, computed ${computed}`,
        });
      }
    } else {
      warnings.push({ path: 'pack.checksum', message: `no checksum declared; computed ${computed}` });
    }
  } catch (e) {
    errors.push({ path: 'pack.checksum', message: `checksum not computable: ${e.message}` });
  }

  return { rel, errors, warnings };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const selfTests = runSelfTests();
const failedSelfTests = selfTests.filter((t) => !t.ok);
console.log(`Schema self-tests: ${selfTests.length - failedSelfTests.length}/${selfTests.length} passed`);
if (failedSelfTests.length > 0) {
  for (const t of failedSelfTests) console.error(`  FAIL ${t.name}${t.detail ? ` — ${t.detail}` : ''}`);
  console.error('\nSelf-tests failed — the schema module and validator have drifted apart.');
  process.exit(1);
}

const packFiles = discoverPackFiles();
if (packFiles.length === 0) {
  console.log('no content packs found, schema self-check passed');
  process.exit(0);
}

let totalErrors = 0;
for (const file of packFiles) {
  const { rel, errors, warnings } = validatePackFile(file);
  totalErrors += errors.length;
  const status = errors.length === 0 ? 'OK' : 'INVALID';
  console.log(`\n${status}  ${rel}  (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const e of errors) console.log(`  error   ${e.path}: ${e.message}`);
  for (const w of warnings) console.log(`  warning ${w.path}: ${w.message}`);
}

console.log(
  `\n${packFiles.length} pack(s) checked — ${totalErrors === 0 ? 'all valid' : `${totalErrors} error(s) found`}`
);
process.exit(totalErrors === 0 ? 0 : 1);
