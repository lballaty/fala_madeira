// File: scripts/pregen-audio.mjs
// Description: EN-8 level-0 audio pre-generation (trial warm). Signs in the E2E admin (bypasses the
//   daily voice cap), enumerates every speakable line in the bundled level-0 situations via the
//   SHARED linesForSituation (dialogues + phrase patterns + vocabulary + roleplay NPC/options),
//   calls the edge `gemini` tts action once per (voiceType,text) to get base64 PCM, and uploads it
//   DIRECTLY to the public tts-audio bucket with the service role. Direct upload decouples the trial
//   warm from the runtime TTS_BUFFER_WRITEBACK flag. The Verpex pull cron then copies each clip to
//   /audio and copy-confirms deletion. Keying is identical to the client (buildKey('default',
//   resolveVoice, text) -> keyToServerPath) so pre-gen, live playback, offline downloads, and the
//   server tiers all agree on ONE object per (voice,text). Idempotent: skips keys already present on
//   Verpex (--verpex-base HEAD 200) or already staged in the Supabase buffer. Read/observable: prints
//   a per-run summary and exits non-zero on any synthesis/upload error.
//
//   Run (operator, after edge deploy — run-pregen-level0 is operator-gated):
//     node scripts/pregen-audio.mjs --level 0 [--verpex-base https://testfalamadeira.searchingfool.com/audio] [--dry-run]
//   Requires in .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD.
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
const argVal = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const LEVEL = Number(argVal('--level', '0'));
const DRY_RUN = argv.includes('--dry-run');
const VERPEX_BASE = (argVal('--verpex-base', process.env.AUDIO_VERPEX_ABSOLUTE_BASE || '') || '').replace(/\/$/, '');
const BUCKET = process.env.AUDIO_BUCKET || 'tts-audio';

// ---- config (fail loud — no hardcoded fallbacks) ---------------------------------------------
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const missing = Object.entries({
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  E2E_ADMIN_EMAIL: ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD: ADMIN_PASSWORD,
}).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`FATAL: missing required env in .env.local: ${missing.join(', ')}`);
  process.exit(2);
}

// ---- shared pure modules (TypeScript via tsx — one key space with the app) -------------------
const { BUNDLED_PACKS } = await tsImport('../src/content/bundled.ts', import.meta.url);
const { clipsByLevel } = await tsImport('../src/lib/audit-utils.ts', import.meta.url);

// ---- enumerate the work list (deduped across situations by object name) ----------------------
// SHARED with the auditor: clipsByLevel (src/lib/audit-utils.ts) is the single source of truth for
// what level-N hosting covers — same walk (linesForSituation → resolveVoice → buildKey →
// keyToServerPath), deduped per level by object name — so the generator's targets and the auditor's
// expected set are the same set by construction (round-trip invariant locked in audit-utils.test.ts).
/** @type {{text:string, voiceType?:string, key:string, name:string}[]} */
const work = clipsByLevel(BUNDLED_PACKS).get(LEVEL) ?? [];

console.log(`EN-8 pre-gen: level ${LEVEL} — ${work.length} unique (voice,text) clips${DRY_RUN ? ' [DRY RUN]' : ''}`);
if (work.length === 0) { console.log('nothing to do'); process.exit(0); }

// ---- idempotency probes ----------------------------------------------------------------------
const headOk = async (url) => {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch { return false; }
};

// ---- clients ---------------------------------------------------------------------------------
const authed = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { error: signInErr } = await authed.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (signInErr) { console.error(`FATAL: admin sign-in failed: ${signInErr.message}`); process.exit(2); }

// ---- throttle + retry (avoid provider rate-limiting under rapid sequential load — the exact
//      503-class failures EN-8 exists to eliminate; mirrors the EN-7 per-clip retry/backoff) ----
// Provider TTS has a low SUSTAINED rate limit (verified live 2026-07-16: a 350ms burst tripped
// frequent non-2xx — the very 503-class failure EN-8 eliminates). Warm gently to stay under it;
// this is a one-off pre-gen, so throughput is secondary to a clean 0-failure pass. Override the
// gap with --throttle <ms>.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = Number(argVal('--throttle', '1500')); // gap between clips
const MAX_ATTEMPTS = 5;         // per-clip attempts
const BACKOFF_MS = [2000, 5000, 12000, 25000]; // waits before retries 2..5

/** Invoke the edge tts action with bounded retry/backoff. Returns base64 audio or throws. */
const synthWithRetry = async (item) => {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await authed.functions.invoke('gemini', {
      body: { action: 'tts', text: item.text, voiceType: item.voiceType, provider: 'default' },
    });
    if (!error && data?.audio) return data.audio;
    lastErr = error?.message || 'no audio payload';
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1]);
  }
  throw new Error(lastErr);
};

// ---- run -------------------------------------------------------------------------------------
let synthesized = 0, skipped = 0, uploaded = 0;
const errors = [];

for (const [i, item] of work.entries()) {
  const tag = `[${i + 1}/${work.length}] ${item.name}`;

  // Idempotent: already on Verpex (durable home) or staged in the buffer → skip.
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${item.name}`;
  const onVerpex = VERPEX_BASE ? await headOk(`${VERPEX_BASE}/${item.name}`) : false;
  const onBuffer = await headOk(publicUrl);
  if (onVerpex || onBuffer) { skipped++; console.log(`${tag} — skip (${onVerpex ? 'verpex' : 'buffer'})`); continue; }

  if (DRY_RUN) { console.log(`${tag} — would synthesize + upload`); continue; }

  // Synthesize via the edge tts action (high voice_limit bypasses the cap). Throttled + retried
  // so a burst of calls doesn't trip provider rate-limiting. Same body the client sends; hostable
  // is irrelevant here (we upload directly, not via the runtime write-back).
  await sleep(THROTTLE_MS);
  let audioB64;
  try {
    audioB64 = await synthWithRetry(item);
  } catch (e) {
    errors.push({ name: item.name, reason: e.message });
    console.error(`${tag} — SYNTH FAILED (after ${MAX_ATTEMPTS} attempts): ${e.message}`);
    continue;
  }
  synthesized++;
  const bytes = Buffer.from(audioB64, 'base64');

  const { error: upErr } = await admin.storage.from(BUCKET).upload(item.name, bytes, {
    contentType: 'application/octet-stream',
    upsert: true,
  });
  if (upErr) {
    errors.push({ name: item.name, reason: `upload: ${upErr.message}` });
    console.error(`${tag} — UPLOAD FAILED: ${upErr.message}`);
    continue;
  }
  uploaded++;
  console.log(`${tag} — ok (${bytes.length} bytes)`);
}

console.log(JSON.stringify({
  level: LEVEL, total: work.length, synthesized, uploaded, skipped, errors: errors.length, error_detail: errors,
}, null, 2));

process.exit(errors.length === 0 ? 0 : 1);
