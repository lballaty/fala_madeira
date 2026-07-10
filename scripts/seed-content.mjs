#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/seed-content.mjs
// Description: Seed-content migration (plan step seed-content-migration / task A14).
//   Maps the 56 legacy lessons (src/data/lessons.ts) VERBATIM into Situations —
//   pure mapping, zero learner-content strings of its own — assembles the
//   Structured Course seed ContentPack ('pack-seed-course'), validates it against
//   src/content/schema.ts, writes the generated bundled module
//   (src/content/packs/seed-course.ts) plus the canonical JSON artifact
//   (content/packs/seed-course.json, picked up by scripts/validate-content.mjs),
//   and publishes it to Supabase (content_packs + situations/tracks projections,
//   idempotent ON CONFLICT upserts) with live post-publish verification.
//   Re-runnable: identical input produces byte-identical outputs and a no-op upsert.
//   Usage: node scripts/seed-content.mjs [--skip-db]
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import pg from 'pg';
import dotenv from 'dotenv';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DB = process.argv.includes('--skip-db');

// ---------------------------------------------------------------------------
// Load source lessons + schema module (TypeScript, via tsx — no build step)
// ---------------------------------------------------------------------------

const { INITIAL_LESSONS } = await tsImport('../src/data/lessons.ts', import.meta.url);
const schema = await tsImport('../src/content/schema.ts', import.meta.url);

if (!Array.isArray(INITIAL_LESSONS) || INITIAL_LESSONS.length === 0) {
  console.error('FATAL: INITIAL_LESSONS is empty or not an array — refusing to seed');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Constants — structural identifiers/metadata only, never lesson content
// ---------------------------------------------------------------------------

const PACK_ID = 'pack-seed-course';
const PACK_VERSION = '1.0.0';
const TRACK_ID = 'track-structured-course';
// NB: Track.name/goal and the pack name are required schema fields (product
// metadata describing the container, not learner content). All learner-facing
// lesson content below is carried over verbatim from src/data/lessons.ts.
const PACK_NAME = 'FalaMadeira Structured Course (seed)';
const TRACK_NAME = 'Structured Course';
const TRACK_GOAL = 'Follow the month-by-month structured Madeira Portuguese course';

// Practical level (0-5) + CEFR assignment per month (task A14 mapping table:
// month1 ≈ L0-L1 / A1, month2 ≈ L1-L2 / A2, month3 ≈ L2-L3 / A2-B1).
// Within a month, lessons in the first half of the month's day span get the
// lower level (and lower CEFR where the month straddles two), the second half
// the higher — deterministic, derived only from the legacy month/day fields.
const LEVELS_BY_MONTH = {
  1: { lower: { level: 0, cefr: 'A1' }, upper: { level: 1, cefr: 'A1' } },
  2: { lower: { level: 1, cefr: 'A2' }, upper: { level: 2, cefr: 'A2' } },
  3: { lower: { level: 2, cefr: 'A2' }, upper: { level: 3, cefr: 'B1' } },
  4: { lower: { level: 3, cefr: 'B1' }, upper: { level: 4, cefr: 'B1' } },
  5: { lower: { level: 4, cefr: 'B1' }, upper: { level: 5, cefr: 'B2' } },
  6: { lower: { level: 5, cefr: 'B2' }, upper: { level: 5, cefr: 'B2' } },
};

// ---------------------------------------------------------------------------
// Mapping (VERBATIM field carry-over; see the A14 mapping table)
// ---------------------------------------------------------------------------

const slugify = (title) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Per-month day spans (legacy `level` field is the 1-based month).
const daySpans = new Map();
for (const lesson of INITIAL_LESSONS) {
  const span = daySpans.get(lesson.level) ?? { min: lesson.day, max: lesson.day };
  span.min = Math.min(span.min, lesson.day);
  span.max = Math.max(span.max, lesson.day);
  daySpans.set(lesson.level, span);
}

const assignLevel = (lesson) => {
  const table = LEVELS_BY_MONTH[lesson.level];
  if (!table) {
    console.error(`FATAL: lesson ${lesson.id} has month (legacy level) ${lesson.level} outside 1-6`);
    process.exit(1);
  }
  const span = daySpans.get(lesson.level);
  const mid = span.min + Math.floor((span.max - span.min) / 2);
  return lesson.day <= mid ? table.lower : table.upper;
};

const mapLessonToSituation = (lesson) => {
  const { level, cefr } = assignLevel(lesson);
  const situation = {
    id: `sit-${lesson.id}-${slugify(lesson.title)}`,
    title: lesson.title, // verbatim
    summary: lesson.description, // verbatim
    tracks: [TRACK_ID],
    level,
    cefr,
    // slots/variants intentionally EMPTY — the enrichment step fills them.
    phrase_patterns: lesson.patterns.map((base, i) => ({
      id: `pp-${lesson.id}-${i + 1}`,
      base, // verbatim
    })),
    vocabulary: lesson.vocabulary.map((v) => ({ ...v })), // shape-identical, verbatim
    course: {
      month: lesson.level, // legacy level 1-6 IS the month
      day: lesson.day,
      category: lesson.category,
      legacy_lesson_id: lesson.id,
    },
  };
  if (lesson.goals) situation.goals = [...lesson.goals]; // verbatim
  if (lesson.explanation) {
    // explanation -> cultural_notes[0]; title reuses the lesson title verbatim.
    situation.cultural_notes = [{ title: lesson.title, body: lesson.explanation }];
  }
  if (lesson.video_url) {
    situation.media = [{ type: 'video', url: lesson.video_url }];
  }
  // dialogues / roleplay / mission / review_items intentionally ABSENT (enrichment step).
  return situation;
};

const situations = [...INITIAL_LESSONS]
  .sort((a, b) => a.day - b.day)
  .map(mapLessonToSituation);

const track = {
  id: TRACK_ID,
  name: TRACK_NAME,
  goal: TRACK_GOAL,
  situations: situations.map((s) => s.id), // day order
};

const pack = {
  id: PACK_ID,
  name: PACK_NAME,
  version: PACK_VERSION,
  schema_version: schema.CONTENT_SCHEMA_VERSION,
  status: 'published',
  situations,
  tracks: [track],
};
pack.checksum = createHash('sha256')
  .update(schema.canonicalPackPayload(pack), 'utf8')
  .digest('hex');

// ---------------------------------------------------------------------------
// Validate (fail loudly on any schema error)
// ---------------------------------------------------------------------------

const validation = schema.validateContentPack(pack);
for (const w of validation.warnings) console.log(`  warning ${w.path}: ${w.message}`);
if (!validation.valid) {
  for (const e of validation.errors) console.error(`  error   ${e.path}: ${e.message}`);
  console.error(`FATAL: seed pack failed schema validation with ${validation.errors.length} error(s)`);
  process.exit(1);
}

// Verbatim integrity self-check: every mapped string must be byte-identical
// to its source lesson field (guards against accidental transformation).
for (const lesson of INITIAL_LESSONS) {
  const sit = situations.find((s) => s.course.legacy_lesson_id === lesson.id);
  const ok =
    sit &&
    sit.title === lesson.title &&
    sit.summary === lesson.description &&
    JSON.stringify(sit.phrase_patterns.map((p) => p.base)) === JSON.stringify(lesson.patterns) &&
    JSON.stringify(sit.vocabulary) === JSON.stringify(lesson.vocabulary) &&
    JSON.stringify(sit.goals ?? null) === JSON.stringify(lesson.goals ?? null) &&
    (sit.cultural_notes?.[0]?.body ?? null) === (lesson.explanation ?? null) &&
    (sit.media?.[0]?.url ?? null) === (lesson.video_url ?? null);
  if (!ok) {
    console.error(`FATAL: verbatim carry-over check failed for lesson ${lesson.id}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Emit generated artifacts (byte-identical across re-runs on identical input)
// ---------------------------------------------------------------------------

const packJson = JSON.stringify(pack, null, 2);

const TS_OUT = join(REPO_ROOT, 'src', 'content', 'packs', 'seed-course.ts');
const JSON_OUT = join(REPO_ROOT, 'content', 'packs', 'seed-course.json');

const tsModule = `// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/content/packs/seed-course.ts
// Description: GENERATED by scripts/seed-content.mjs — do NOT hand-edit. The seed
//   Structured Course content pack: the 56 legacy lessons (src/data/lessons.ts)
//   mapped verbatim into Situations plus the '${TRACK_ID}' track.
//   Regenerate with: node scripts/seed-content.mjs [--skip-db]
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { ContentPack } from '../schema';

export const seedCoursePack: ContentPack = ${packJson};
`;

mkdirSync(dirname(TS_OUT), { recursive: true });
mkdirSync(dirname(JSON_OUT), { recursive: true });
writeFileSync(TS_OUT, tsModule, 'utf8');
writeFileSync(JSON_OUT, packJson + '\n', 'utf8');
console.log(`\nwrote ${TS_OUT}`);
console.log(`wrote ${JSON_OUT}`);

// ---------------------------------------------------------------------------
// Mapping summary
// ---------------------------------------------------------------------------

const vocabCount = situations.reduce((n, s) => n + s.vocabulary.length, 0);
const patternCount = situations.reduce((n, s) => n + s.phrase_patterns.length, 0);
const goalsCount = situations.reduce((n, s) => n + (s.goals?.length ?? 0), 0);
const notesCount = situations.reduce((n, s) => n + (s.cultural_notes?.length ?? 0), 0);
const mediaCount = situations.reduce((n, s) => n + (s.media?.length ?? 0), 0);
const byLevel = {};
const byCefr = {};
const byMonth = {};
for (const s of situations) {
  byLevel[s.level] = (byLevel[s.level] ?? 0) + 1;
  byCefr[s.cefr] = (byCefr[s.cefr] ?? 0) + 1;
  byMonth[s.course.month] = (byMonth[s.course.month] ?? 0) + 1;
}

console.log('\n=== Mapping summary ===');
console.log(`situations:       ${situations.length}`);
console.log(`phrase patterns:  ${patternCount}`);
console.log(`vocabulary items: ${vocabCount}`);
console.log(`goals:            ${goalsCount}`);
console.log(`cultural notes:   ${notesCount}`);
console.log(`media refs:       ${mediaCount}`);
console.log(`tracks:           1 (${TRACK_ID}, ${track.situations.length} situations in day order)`);
console.log(`by month:         ${JSON.stringify(byMonth)}`);
console.log(`by level:         ${JSON.stringify(byLevel)}`);
console.log(`by cefr:          ${JSON.stringify(byCefr)}`);
console.log(`pack checksum:    ${pack.checksum}`);

// ---------------------------------------------------------------------------
// Publish to DB (direct pg connection, same pattern as apply-migrations.js)
// ---------------------------------------------------------------------------

if (SKIP_DB) {
  console.log('\n--skip-db: DB publish skipped');
  process.exit(0);
}

dotenv.config({ path: join(REPO_ROOT, '.env.local'), quiet: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const projectRef = supabaseUrl ? supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] : null;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!projectRef || !dbPassword) {
  console.error('FATAL: missing VITE_SUPABASE_URL / SUPABASE_DB_PASSWORD in .env.local — cannot publish');
  process.exit(1);
}

// Direct connection (IPv6-reachable; verified 2026-07-08 — see apply-migrations.js).
const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query('BEGIN');

  await client.query(
    `INSERT INTO public.content_packs (id, name, version, schema_version, status, checksum, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       version = EXCLUDED.version,
       schema_version = EXCLUDED.schema_version,
       status = EXCLUDED.status,
       checksum = EXCLUDED.checksum,
       payload = EXCLUDED.payload`,
    [pack.id, pack.name, pack.version, pack.schema_version, pack.status, pack.checksum, packJson]
  );

  for (const s of situations) {
    await client.query(
      `INSERT INTO public.situations (id, pack_id, payload, level, cefr, tracks, course_month, course_day, version)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         pack_id = EXCLUDED.pack_id,
         payload = EXCLUDED.payload,
         level = EXCLUDED.level,
         cefr = EXCLUDED.cefr,
         tracks = EXCLUDED.tracks,
         course_month = EXCLUDED.course_month,
         course_day = EXCLUDED.course_day,
         version = EXCLUDED.version`,
      [s.id, pack.id, JSON.stringify(s), s.level, s.cefr, s.tracks, s.course.month, s.course.day, 1]
    );
  }

  await client.query(
    `INSERT INTO public.tracks (id, pack_id, name, goal, situation_ids, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       pack_id = EXCLUDED.pack_id,
       name = EXCLUDED.name,
       goal = EXCLUDED.goal,
       situation_ids = EXCLUDED.situation_ids,
       payload = EXCLUDED.payload`,
    [track.id, pack.id, track.name, track.goal, track.situations, JSON.stringify(track)]
  );

  // Idempotency: drop projection rows of this pack no longer in the pack.
  const sitIds = situations.map((s) => s.id);
  await client.query(`DELETE FROM public.situations WHERE pack_id = $1 AND NOT (id = ANY($2))`, [pack.id, sitIds]);
  await client.query(`DELETE FROM public.tracks WHERE pack_id = $1 AND NOT (id = ANY($2))`, [pack.id, [track.id]]);

  await client.query('COMMIT');
  console.log('\nDB publish committed');

  // --- Live verification -----------------------------------------------------
  const sitCount = await client.query(`SELECT count(*)::int AS n FROM public.situations WHERE pack_id = $1`, [pack.id]);
  const trkCount = await client.query(`SELECT count(*)::int AS n FROM public.tracks WHERE pack_id = $1`, [pack.id]);
  const packRow = await client.query(`SELECT status, version, checksum FROM public.content_packs WHERE id = $1`, [pack.id]);

  console.log('\n=== Live verification ===');
  console.log(`situations rows:  ${sitCount.rows[0].n} (expected ${situations.length})`);
  console.log(`tracks rows:      ${trkCount.rows[0].n} (expected 1)`);
  console.log(`pack row:         status=${packRow.rows[0]?.status} version=${packRow.rows[0]?.version}`);
  console.log(`checksum match:   ${packRow.rows[0]?.checksum === pack.checksum}`);

  // Spot-check one situation payload byte-for-byte against its source lesson.
  const spotLesson = INITIAL_LESSONS[0];
  const spotSit = situations.find((s) => s.course.legacy_lesson_id === spotLesson.id);
  const spot = await client.query(`SELECT payload FROM public.situations WHERE id = $1`, [spotSit.id]);
  const p = spot.rows[0]?.payload;
  const spotOk =
    p &&
    p.title === spotLesson.title &&
    p.summary === spotLesson.description &&
    JSON.stringify(p.phrase_patterns.map((x) => x.base)) === JSON.stringify(spotLesson.patterns) &&
    JSON.stringify(p.vocabulary) === JSON.stringify(spotLesson.vocabulary);
  console.log(`spot-check ${spotSit.id} vs lesson ${spotLesson.id} (title+summary+patterns+vocab byte-for-byte): ${spotOk ? 'OK' : 'MISMATCH'}`);

  const allOk =
    sitCount.rows[0].n === situations.length &&
    trkCount.rows[0].n === 1 &&
    packRow.rows[0]?.status === 'published' &&
    packRow.rows[0]?.checksum === pack.checksum &&
    spotOk;
  if (!allOk) {
    console.error('FATAL: live verification failed');
    process.exit(1);
  }
  console.log('\nlive verification passed');
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // connection may already be gone; the outer error is the one that matters
  }
  console.error('\nFATAL: DB publish failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
