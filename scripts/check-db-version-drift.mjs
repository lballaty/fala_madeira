// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-db-version-drift.mjs
// Description: HARD guard against IndexedDB DB_VERSION drift between the app and the e2e test
//   helpers. The app's web StorageAdapter opens `FalaMadeiraAudioCache` at DB_VERSION (currently
//   bumped by EN-8 v2->v3 for the pinned store). Test helpers that open the SAME database at a
//   DIFFERENT hardcoded version DEADLOCK the app's upgrade (the older connection blocks it, openDB
//   never resolves, every content/audio consumer hangs) or throw VersionError and silently no-op —
//   this was the root cause of ~40 e2e failures on the v2->v3 bump (fixture at v2 vs app at v3) plus
//   the writeKv/deleteKv v2 stragglers. This check reads the app's DB_VERSION and asserts every
//   test-side open of that database (an `indexedDB.open('FalaMadeiraAudioCache', N)` or a
//   `DB_VERSION = N` literal under tests/e2e) uses the SAME version. Exits non-zero on any mismatch.
// Author: claude-en26 (with assistant)
// Created: 2026-07-18

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const DB_NAME = 'FalaMadeiraAudioCache';
const APP_STORAGE = resolve(root, 'src/platform/web/storage.web.ts');
const TEST_DIR = resolve(root, 'tests/e2e');

// --- app's canonical DB_VERSION --------------------------------------------------
const appSrc = readFileSync(APP_STORAGE, 'utf8');
const appMatch = appSrc.match(/const\s+DB_VERSION\s*=\s*(\d+)\s*;/);
if (!appMatch) {
  console.error(`✗ db-version-drift: could not find DB_VERSION in ${APP_STORAGE}`);
  process.exit(2);
}
const APP_VERSION = Number(appMatch[1]);

// --- collect every test-side version referencing the app DB ----------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

// Matches: indexedDB.open('FalaMadeiraAudioCache', N)  and  DB_VERSION = N  (in a file that also
// references the DB by name — so an unrelated DB_VERSION elsewhere never false-positives).
const OPEN_RE = new RegExp(`${DB_NAME}['"]\\s*,\\s*(\\d+)\\s*\\)`, 'g');
const CONST_RE = /DB_VERSION\s*=\s*(\d+)/g;

const mismatches = [];
let checked = 0;
for (const file of walk(TEST_DIR)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes(DB_NAME)) continue;
  const rel = file.replace(root + '/', '');
  const versions = [];
  for (const m of src.matchAll(OPEN_RE)) versions.push({ v: Number(m[1]), kind: `open('${DB_NAME}', …)` });
  for (const m of src.matchAll(CONST_RE)) versions.push({ v: Number(m[1]), kind: 'DB_VERSION literal' });
  for (const { v, kind } of versions) {
    checked += 1;
    if (v !== APP_VERSION) mismatches.push(`${rel}: ${kind} opens ${DB_NAME} at v${v} — app is at v${APP_VERSION}`);
  }
}

if (mismatches.length) {
  console.error(`\n✗ db-version-drift: ${mismatches.length} test helper(s) open ${DB_NAME} at a version that differs from the app (v${APP_VERSION}):`);
  for (const m of mismatches) console.error(`    • ${m}`);
  console.error(`\n  A version mismatch deadlocks the app's IndexedDB upgrade (content/audio hang) or silently no-ops the seed.`);
  console.error(`  Fix: set every test-side ${DB_NAME} open to v${APP_VERSION} (match src/platform/web/storage.web.ts DB_VERSION).`);
  process.exit(1);
}

console.log(`✓ db-version-drift: ${checked} test-side ${DB_NAME} version reference(s) all match the app (v${APP_VERSION}).`);
