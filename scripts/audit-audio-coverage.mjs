// File: scripts/audit-audio-coverage.mjs
// Description: EN-34 §5 A6 — READ-ONLY inventory audit of curated TTS audio coverage. Answers "what
//   is actually hosted vs what the corpus wants", and is the resume-state signal for the incremental
//   warm (so a stalled/forgotten warm is visible). Makes NO writes. Enumerates the desired corpus via
//   the SHARED pure core (src/lib/audit-utils.ts → clipsByLevel / clipsForOnboarding /
//   expectedNamesByLevel — the same walk the generator + warm fn use), then compares it against:
//     * the Supabase 'tts-audio' bucket object list (Management-API SQL, like verify-migration-00012),
//     * the hosted manifest public.tts_audio_hosted (coverage + per-key generation), and
//     * (optional) Verpex /audio, when --verpex-base <url> is passed (bounded HEAD probes).
//   Reuses the pure diffCoverage set-math (unit-tested in audit-utils.test.ts) for the per-level
//   report — no parallel diff logic here.
//
//   Run (operator; read-only, safe anytime):
//     node scripts/audit-audio-coverage.mjs [--verpex-base https://falamadeira.searchingfool.com/audio]
//   Requires in .env.local: VITE_SUPABASE_URL, SUPABASE_ACCESS_TOKEN (Management API — the direct
//   Postgres host is IPv6-only on some networks). Exit 0 always on a completed audit (it reports gaps,
//   it does not fail on them); exit 2 only on missing config / unreachable API.
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
dotenv.config({ path: join(REPO_ROOT, '.env.local'), quiet: true });

const argv = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const VERPEX_BASE = (argVal('--verpex-base', process.env.AUDIO_VERPEX_ABSOLUTE_BASE || '') || '').replace(/\/$/, '');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const projectRef = supabaseUrl ? supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] : null;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!projectRef || !token) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_ACCESS_TOKEN in .env.local');
  process.exit(2);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
async function runSql(query) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ---- desired corpus (SHARED pure core) -------------------------------------------------------
const { BUNDLED_PACKS } = await tsImport('../src/content/bundled.ts', import.meta.url);
const { expectedNamesByLevel, clipsForOnboarding, diffCoverage } = await tsImport('../src/lib/audit-utils.ts', import.meta.url);

const expectedByLevel = expectedNamesByLevel(BUNDLED_PACKS); // Map<level, Set<name>>
const onboardingNames = new Set(clipsForOnboarding().map((c) => c.name));

// ---- what is actually present ----------------------------------------------------------------
// Bucket object names (READ-ONLY SELECT).
let inBuffer = new Set();
try {
  const rows = await runSql("select name from storage.objects where bucket_id = 'tts-audio'");
  inBuffer = new Set((rows ?? []).map((r) => r.name));
} catch (e) {
  console.error(`⚠ could not list the tts-audio bucket: ${e.message}`);
  process.exit(2);
}

// Hosted manifest (coverage + generations). Best-effort — the table may not exist pre-apply.
let manifest = [];
try {
  manifest = await runSql('select build_key, generation, object_name, tiers from public.tts_audio_hosted');
} catch (e) {
  console.error(`ℹ hosted manifest not readable (migration 00016 not applied yet?): ${e.message}`);
}

// Verpex /audio (optional, bounded HEAD probes) -------------------------------------------------
const headOk = async (url) => {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch { return false; }
};
const onVerpex = new Set();
if (VERPEX_BASE) {
  const allExpected = [...new Set([...onboardingNames, ...[...expectedByLevel.values()].flatMap((s) => [...s])])];
  console.error(`probing Verpex for ${allExpected.length} expected clips (this can take a moment)…`);
  for (const name of allExpected) {
    if (await headOk(`${VERPEX_BASE}/${name}`)) onVerpex.add(name);
  }
}

// ---- report ----------------------------------------------------------------------------------
console.log('EN-34 audio-coverage audit — READ ONLY');
console.log('project:', projectRef, VERPEX_BASE ? `| verpex: ${VERPEX_BASE}` : '| verpex: (not probed — pass --verpex-base)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const report = {};
const levels = [...expectedByLevel.keys()].sort((a, b) => a - b);
for (const lvl of levels) {
  const expected = expectedByLevel.get(lvl);
  const cov = diffCoverage({ expected, onVerpex, inBuffer });
  report[`level:${lvl}`] = cov;
  const pct = cov.expected ? Math.round((cov.on_verpex / cov.expected) * 100) : 0;
  console.log(
    `level ${lvl}: ${cov.on_verpex}/${cov.expected} on verpex (${pct}%), ${cov.in_buffer} in buffer, ` +
      `${cov.buffer_lag} buffer-lag, ${cov.missing_everywhere} missing`,
  );
}
const onbCov = diffCoverage({ expected: onboardingNames, onVerpex, inBuffer });
report.onboarding = onbCov;
console.log(
  `onboarding: ${onbCov.on_verpex}/${onbCov.expected} on verpex, ${onbCov.in_buffer} in buffer, ` +
    `${onbCov.missing_everywhere} missing`,
);

// Manifest summary: how many hosted, and how many at generation >= 2 (regenerated).
const regenerated = manifest.filter((m) => Number(m.generation) >= 2);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`manifest (tts_audio_hosted): ${manifest.length} hosted keys; ${regenerated.length} at generation ≥ 2 (regenerated)`);
console.log(`bucket objects: ${inBuffer.size}${VERPEX_BASE ? ` | verpex hits: ${onVerpex.size}` : ''}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(JSON.stringify({
  bucket_objects: inBuffer.size,
  verpex_probed: Boolean(VERPEX_BASE),
  verpex_hits: onVerpex.size,
  manifest_keys: manifest.length,
  manifest_regenerated: regenerated.length,
  coverage: report,
}, null, 2));

process.exit(0);
