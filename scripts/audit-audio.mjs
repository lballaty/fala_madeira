// File: scripts/audit-audio.mjs
// Description: EN-8 read-only "what is where" audio COVERAGE report (admin/agent surface — ties EN-12).
//   For each practical level it enumerates the EXPECTED (voice,text) object names via the SHARED
//   linesForSituation over the bundled packs, then compares against what is actually ON VERPEX
//   (durable home; HEAD 200) and IN the Supabase buffer (public list). It reports, per level:
//   expected / on-verpex / in-buffer / missing (nowhere) / lag (in buffer, not yet copied to Verpex)
//   and, globally, orphans (present but not expected — retention visibility). Read-only: no writes,
//   no synthesis. Prints a per-level table and a machine-readable JSON block.
//
//   --verify-l0 (COORD-2 ROBUSTNESS-2 gating proof): asserts every level-0 expected clip is 200 on
//   Verpex AND that public.logs has NO provider-tier tts synthesis event for those keys (i.e. they
//   were served from a host tier, not re-generated). Prints VERIFY_WIN_OK on success, else fails loud.
//
//   Run:
//     node scripts/audit-audio.mjs [--level N] [--verpex-base https://host/audio] [--json]
//     node scripts/audit-audio.mjs --verify-l0 --verpex-base https://testfalamadeira.searchingfool.com/audio
//   Requires in .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (list buffer);
//   SUPABASE_SERVICE_ROLE_KEY only for --verify-l0 (reads public.logs).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
dotenv.config({ path: join(REPO_ROOT, '.env.local'), quiet: true });

// ---- args ------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const argVal = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const VERIFY_L0 = argv.includes('--verify-l0');
const JSON_ONLY = argv.includes('--json');
const ONLY_LEVEL = argv.includes('--level') ? Number(argVal('--level', '0')) : null;
const VERPEX_BASE = (argVal('--verpex-base', process.env.AUDIO_VERPEX_ABSOLUTE_BASE || '') || '').replace(/\/$/, '');
const BUCKET = process.env.AUDIO_BUCKET || 'tts-audio';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('FATAL: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(2);
}

// ---- shared pure modules ---------------------------------------------------------------------
const { BUNDLED_PACKS } = await tsImport('../src/content/bundled.ts', import.meta.url);
const { linesForSituation } = await tsImport('../src/content/lines.ts', import.meta.url);
const { buildKey, keyToServerPath } = await tsImport('../src/lib/audioKey.ts', import.meta.url);
const { resolveVoice } = await tsImport('../src/lib/voiceType.ts', import.meta.url);

// ---- expected object names per level ---------------------------------------------------------
/** @type {Map<number, Set<string>>} */
const expectedByLevel = new Map();
const nameToText = new Map(); // for reporting
for (const pack of BUNDLED_PACKS) {
  for (const situation of pack.situations) {
    const lvl = situation.level;
    if (ONLY_LEVEL !== null && lvl !== ONLY_LEVEL) continue;
    if (!expectedByLevel.has(lvl)) expectedByLevel.set(lvl, new Set());
    for (const line of linesForSituation(situation)) {
      const voice = resolveVoice({ voiceType: line.voiceType });
      const name = keyToServerPath(buildKey('default', voice, line.text));
      expectedByLevel.get(lvl).add(name);
      nameToText.set(name, line.text);
    }
  }
}
const allExpected = new Set([...expectedByLevel.values()].flatMap((s) => [...s]));

// ---- what is in the Supabase buffer (public list via anon key) -------------------------------
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const inBuffer = new Set();
{
  let offset = 0; const page = 100;
  for (;;) {
    const { data, error } = await anon.storage.from(BUCKET).list('', { limit: page, offset });
    if (error) { console.error(`FATAL: could not list buffer bucket '${BUCKET}': ${error.message}`); process.exit(1); }
    for (const o of data ?? []) if (/^[a-z0-9_]+\.pcm$/i.test(o.name)) inBuffer.add(o.name);
    if (!data || data.length < page) break;
    offset += page;
  }
}

// ---- what is on Verpex (HEAD) — only when an absolute base is provided -----------------------
const headOk = async (url) => {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch { return false; }
};
const onVerpex = new Set();
if (VERPEX_BASE) {
  const names = [...allExpected, ...inBuffer];
  await Promise.all(names.map(async (name) => { if (await headOk(`${VERPEX_BASE}/${name}`)) onVerpex.add(name); }));
} else if (!JSON_ONLY) {
  console.log('(no --verpex-base given — Verpex column omitted; run with --verpex-base https://host/audio for full coverage)');
}

// ---- per-level report ------------------------------------------------------------------------
const report = [];
for (const [lvl, expected] of [...expectedByLevel.entries()].sort((a, b) => a[0] - b[0])) {
  let verpex = 0, buffer = 0, missing = 0, lag = 0;
  for (const name of expected) {
    const v = onVerpex.has(name), b = inBuffer.has(name);
    if (v) verpex++;
    if (b) buffer++;
    if (!v && !b) missing++;
    if (b && !v) lag++;
  }
  report.push({ level: lvl, expected: expected.size, on_verpex: VERPEX_BASE ? verpex : null, in_buffer: buffer, missing_everywhere: missing, buffer_lag: lag });
}
const orphans = [...new Set([...inBuffer, ...onVerpex])].filter((n) => !allExpected.has(n));

if (!JSON_ONLY && !VERIFY_L0) {
  console.log('\nEN-8 audio coverage — expected vs on-Verpex vs in-buffer\n');
  console.log('level | expected | on-verpex | in-buffer | missing | buffer-lag');
  console.log('------|----------|-----------|-----------|---------|-----------');
  for (const r of report) {
    console.log(`  ${String(r.level).padEnd(3)} | ${String(r.expected).padStart(8)} | ${String(r.on_verpex ?? '—').padStart(9)} | ${String(r.in_buffer).padStart(9)} | ${String(r.missing_everywhere).padStart(7)} | ${String(r.buffer_lag).padStart(10)}`);
  }
  console.log(`\norphans (present but not expected): ${orphans.length}`);
}

// ---- --verify-l0 gating proof ----------------------------------------------------------------
if (VERIFY_L0) {
  const problems = [];
  if (!VERPEX_BASE) problems.push('missing --verpex-base (cannot verify Verpex hosting)');
  const l0 = expectedByLevel.get(0) ?? new Set();
  if (l0.size === 0) problems.push('no level-0 expected clips enumerated');

  // 1) every L0 clip must be 200 on Verpex.
  let notOnVerpex = 0;
  if (VERPEX_BASE) for (const name of l0) if (!onVerpex.has(name)) notOnVerpex++;
  if (notOnVerpex > 0) problems.push(`${notOnVerpex}/${l0.size} level-0 clips NOT served (200) on Verpex`);

  // 2) public.logs must have NO provider-tier synthesis event for L0 keys (they served from a host).
  if (!SERVICE_KEY) {
    problems.push('missing SUPABASE_SERVICE_ROLE_KEY (cannot read public.logs for the no-provider assertion)');
  } else {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from('logs')
      .select('details')
      .eq('event_type', 'tts_source')
      .order('timestamp', { ascending: false })
      .limit(5000);
    if (error) {
      problems.push(`could not query public.logs: ${error.message}`);
    } else {
      const providerHits = (data ?? []).filter((row) => {
        let d = row.details;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
        return d?.tier === 'provider' && l0.has(keyToServerPath(String(d?.key ?? '')));
      });
      if (providerHits.length > 0) problems.push(`${providerHits.length} provider-tier synthesis event(s) found for level-0 keys (503-avoidance NOT demonstrated)`);
    }
  }

  if (problems.length === 0) {
    console.log(`VERIFY_WIN_OK — all ${l0.size} level-0 clips served from a host tier (no provider synthesis).`);
    process.exit(0);
  }
  console.error('VERIFY_WIN_FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (JSON_ONLY) console.log(JSON.stringify({ report, orphans, verpex_checked: !!VERPEX_BASE }, null, 2));
process.exit(0);
