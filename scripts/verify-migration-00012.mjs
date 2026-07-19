// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/verify-migration-00012.mjs
// Description: READ-ONLY verification of EN-8 migration 00012 (audio buffer bucket) against the live
//   Supabase DB. Confirms the four objects the migration creates actually exist: the public
//   'tts-audio' bucket, the 'tts_audio_public_read' RLS policy on storage.objects, the pg_cron
//   extension, and the 'tts-audio-orphan-backstop' cron job. Makes NO writes (SELECT-only). Uses the
//   Supabase Management API (HTTPS) with SUPABASE_ACCESS_TOKEN, because the direct Postgres host is
//   IPv6-only and unreachable from some networks. Exit 0 = all present, 1 = one or more missing.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-19

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

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

const checks = [];
async function check(name, query, predicate) {
  try {
    const rows = await runSql(query);
    const { ok, detail } = predicate(rows);
    checks.push({ name, ok, detail });
  } catch (e) {
    checks.push({ name, ok: false, detail: `query error: ${e.message}` });
  }
}

await check(
  "bucket 'tts-audio' (public)",
  "select id, public from storage.buckets where id = 'tts-audio'",
  (rows) => ({ ok: rows.length === 1 && rows[0].public === true, detail: rows.length ? `public=${rows[0].public}` : 'NOT FOUND' }),
);
await check(
  "policy 'tts_audio_public_read' on storage.objects",
  "select cmd, roles from pg_policies where schemaname='storage' and tablename='objects' and policyname='tts_audio_public_read'",
  (rows) => ({ ok: rows.length === 1 && rows[0].cmd === 'SELECT', detail: rows.length ? `cmd=${rows[0].cmd} roles=${JSON.stringify(rows[0].roles)}` : 'NOT FOUND' }),
);
await check(
  'extension pg_cron',
  "select extname from pg_extension where extname='pg_cron'",
  (rows) => ({ ok: rows.length === 1, detail: rows.length ? 'installed' : 'NOT INSTALLED' }),
);
await check(
  "cron job 'tts-audio-orphan-backstop'",
  "select jobname, schedule, active from cron.job where jobname='tts-audio-orphan-backstop'",
  (rows) => ({ ok: rows.length === 1, detail: rows.length ? `schedule='${rows[0].schedule}' active=${rows[0].active}` : 'NOT FOUND' }),
);

console.log('EN-8 migration 00012 — live DB verification (Management API)');
console.log('project:', projectRef);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name} — ${c.detail}`);
const allOk = checks.every((c) => c.ok);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(allOk ? '✅ 00012 fully applied' : '❌ 00012 NOT fully applied (see above)');
process.exit(allOk ? 0 : 1);
