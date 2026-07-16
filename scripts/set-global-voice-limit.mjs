#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/set-global-voice-limit.mjs
// Description: Operator utility to set the authoritative daily voice limit in
//   public.global_settings.voice_limit on the LIVE (shared) Supabase backend. Mirrors the exact
//   write path the admin Settings UI uses (useSettings.ts): sign in as the admin account with the
//   anon key, then upsert the global_settings row (RLS policy "Admins can manage global settings").
//   Reads it back and verifies before exiting non-zero on mismatch. Backward-compatible: the value
//   only raises/sets a cap that both the client (useTutorSession) and the gemini edge fn honor.
//   Usage: node scripts/set-global-voice-limit.mjs [<limit>]   (default 50)
//   Creds: .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_ADMIN_EMAIL/PASSWORD) or
//          .admin-temp-credentials.txt (email/temp_password lines).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = String(parseInt(process.argv[2] ?? '50', 10));
if (!/^\d+$/.test(LIMIT) || Number(LIMIT) <= 0) {
  console.error(`FATAL: invalid limit "${process.argv[2]}" — expected a positive integer.`);
  process.exit(1);
}

/** Parse KEY=value / KEY="value" .env into a map (no dotenv dep — matches tests/e2e/support/env.ts). */
function parseEnvFile(path) {
  const out = {};
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return out; }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function readAdminCreds(env) {
  const email = env.E2E_ADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL;
  const password = env.E2E_ADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD;
  if (email && password) return { email, password };
  const path = resolve(REPO_ROOT, '.admin-temp-credentials.txt');
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8');
    const e = raw.match(/email:\s*(\S+)/)?.[1] ?? '';
    const p = raw.match(/temp_password:\s*(\S+)/)?.[1] ?? '';
    if (e && p) return { email: e, password: p };
  }
  throw new Error('Missing admin creds: set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD in .env.local or provide .admin-temp-credentials.txt.');
}

const env = parseEnvFile(resolve(REPO_ROOT, '.env.local'));
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('FATAL: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.local.');
  process.exit(1);
}

const { email, password } = readAdminCreds(env);
const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
if (authErr || !auth?.user) {
  console.error(`FATAL: admin sign-in failed for ${email}: ${authErr?.message ?? 'no session'}.`);
  process.exit(1);
}
console.log(`[set-voice-limit] signed in as ${email} (uid ${auth.user.id.slice(0, 8)}…)`);

const { error: upErr } = await supabase
  .from('global_settings')
  .upsert({ key: 'voice_limit', value: LIMIT }, { onConflict: 'key' });
if (upErr) {
  console.error(`FATAL: upsert global_settings.voice_limit failed: ${upErr.message}. ` +
    `(Is this account role=admin? RLS "Admins can manage global settings" gates the write.)`);
  process.exit(1);
}

const { data: readBack, error: readErr } = await supabase
  .from('global_settings').select('value').eq('key', 'voice_limit').maybeSingle();
if (readErr) {
  console.error(`FATAL: read-back failed: ${readErr.message}.`);
  process.exit(1);
}
if (readBack?.value !== LIMIT) {
  console.error(`FATAL: verification mismatch — global_settings.voice_limit reads "${readBack?.value}", expected "${LIMIT}".`);
  process.exit(1);
}
console.log(`[set-voice-limit] ✅ global_settings.voice_limit = "${LIMIT}" (verified live). ` +
  `Client (useTutorSession) + gemini edge both read this value.`);
process.exit(0);
