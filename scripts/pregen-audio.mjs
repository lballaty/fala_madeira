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
const { linesForSituation } = await tsImport('../src/content/lines.ts', import.meta.url);
const { buildKey, keyToServerPath } = await tsImport('../src/lib/audioKey.ts', import.meta.url);
const { resolveVoice } = await tsImport('../src/lib/voiceType.ts', import.meta.url);

// ---- enumerate the work list (deduped across situations by object name) ----------------------
/** @type {{text:string, voiceType?:string, key:string, name:string}[]} */
const work = [];
const seenNames = new Set();
for (const pack of BUNDLED_PACKS) {
  for (const situation of pack.situations) {
    if (situation.level !== LEVEL) continue;
    for (const line of linesForSituation(situation)) {
      const voice = resolveVoice({ voiceType: line.voiceType });
      const key = buildKey('default', voice, line.text);
      const name = keyToServerPath(key);
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      work.push({ text: line.text, voiceType: line.voiceType, key, name });
    }
  }
}

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

  // Synthesize via the edge tts action (admin session bypasses the voice cap). Same body the
  // client sends; hostable is irrelevant here (we upload directly, not via the runtime write-back).
  const { data, error } = await authed.functions.invoke('gemini', {
    body: { action: 'tts', text: item.text, voiceType: item.voiceType, provider: 'default' },
  });
  if (error || !data?.audio) {
    errors.push({ name: item.name, reason: error?.message || 'no audio payload' });
    console.error(`${tag} — SYNTH FAILED: ${error?.message || 'no audio'}`);
    continue;
  }
  synthesized++;
  const bytes = Buffer.from(data.audio, 'base64');

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
