// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-schema-drift.mjs
// Description: Schema-drift gate. Statically extracts every column the client CODE writes
//   (supabase .insert/.update/.upsert payloads, resolving simple `const x = {...}` references)
//   and diffs them against the LIVE Postgres schema (information_schema.columns). Fails when the
//   code writes a column the live DB does not have — the exact failure mode behind the
//   profiles.total_time_spent PGRST204/400 (migration defined it, live prod lacked it). Runs
//   against the project's direct DB connection using SUPABASE_DB_PASSWORD from .env.local.
//   Two-pass friendly: point SUPABASE_DB_HOST at prod (source of truth) then cloud-dev to
//   reconcile. If the DB is unreachable it FAILS LOUDLY (never silently "passes") per the
//   repo's two-pass verification rule.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-14

import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gxlrmdfqcqimwwplrdgd';
const DB_HOST = process.env.SUPABASE_DB_HOST || `db.${PROJECT_REF}.supabase.co`;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const WRITE_METHODS = ['insert', 'update', 'upsert'];

// --- 1. Static extraction: table -> Set(columns the code writes) --------------------
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) out.push(p);
  }
  return out;
}

// Collect top-level keys of the object literal that begins at/after `from` in `txt`.
function objectKeysAt(txt, from) {
  let i = txt.indexOf('{', from);
  if (i < 0) return null;
  const pre = txt.slice(from, i);
  if (/[);]/.test(pre)) return null; // arg is not an object literal (e.g. a variable)
  const keys = [];
  let depth = 0;
  let strCh = null;
  let expectKey = true; // key/value state machine: only capture identifiers in key position
  for (; i < txt.length; i++) {
    const c = txt[i];
    if (strCh) { if (c === strCh && txt[i - 1] !== '\\') strCh = null; continue; }
    if (c === '"' || c === "'" || c === '`') { strCh = c; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (c === ',') { expectKey = true; continue; }
    if (c === ':') { expectKey = false; continue; }   // now in value position until next comma
    if (!expectKey || /\s/.test(c)) continue;
    const rest = txt.slice(i);
    if (rest.startsWith('...')) { i += 2; expectKey = false; continue; } // spread → treat as value
    const qm = /^['"]([^'"]+)['"]/.exec(rest);
    if (qm) { keys.push(qm[1]); i += qm[0].length - 1; expectKey = false; continue; }
    const km = /^([A-Za-z_$][\w$]*)/.exec(rest);
    if (km) { keys.push(km[1]); i += km[0].length - 1; expectKey = false; continue; }
    // any other char in key position (e.g. computed `[`) — leave state, skip
  }
  return keys;
}

const codeWrites = {};      // table -> Set(columns)
const unresolved = [];      // {file, table, method} where payload was a non-literal we couldn't read
const files = walk(resolve(process.cwd(), 'src'));
const callRe = /\.from\(\s*['"]([a-z_]+)['"]\s*\)\s*\.\s*(insert|update|upsert)\s*\(/g;

for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const rel = f.replace(process.cwd() + '/', '');
  // simple const-object resolution within the file: `const NAME = { ... }`
  const constObjs = {};
  const constRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  let cm;
  while ((cm = constRe.exec(txt))) {
    const keys = objectKeysAt(txt, cm.index + cm[0].length - 1);
    if (keys) constObjs[cm[1]] = keys;
  }
  let m;
  while ((m = callRe.exec(txt))) {
    const table = m[1];
    const method = m[2];
    const argStart = m.index + m[0].length;
    let keys = objectKeysAt(txt, argStart);
    if (!keys) {
      // try to resolve a variable arg: .insert(NAME) / .upsert(NAME, ...)
      const vm = /^\s*([A-Za-z_$][\w$]*)\s*[,)]/.exec(txt.slice(argStart));
      if (vm && constObjs[vm[1]]) keys = constObjs[vm[1]];
    }
    if (!keys) { unresolved.push({ file: rel, table, method }); continue; }
    (codeWrites[table] ||= new Set());
    for (const k of keys) codeWrites[table].add(k);
  }
}

// --- 2. Live schema ----------------------------------------------------------------
if (!DB_PASSWORD) {
  console.error('SCHEMA-DRIFT: SUPABASE_DB_PASSWORD not set in .env.local — cannot verify against the live DB. Failing loudly (no silent skip).');
  process.exit(2);
}

const client = new pg.Client({
  host: DB_HOST,
  port: 5432,
  user: 'postgres',
  password: DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const tables = Object.keys(codeWrites).sort();
let liveCols;
try {
  await client.connect();
  const { rows } = await client.query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and table_name = any($1::text[])`,
    [tables],
  );
  liveCols = {};
  for (const r of rows) (liveCols[r.table_name] ||= new Set()).add(r.column_name);
} catch (err) {
  console.error(`SCHEMA-DRIFT: could not reach the live DB at ${DB_HOST} — ${err.message}. Failing loudly.`);
  process.exit(2);
} finally {
  await client.end().catch(() => {});
}

// --- 3. Diff -----------------------------------------------------------------------
const drift = [];
const missingTables = [];
for (const table of tables) {
  if (!liveCols[table]) { missingTables.push(table); continue; }
  for (const col of [...codeWrites[table]].sort()) {
    if (!liveCols[table].has(col)) drift.push({ table, col });
  }
}

console.log(`Schema-drift check against ${DB_HOST} — ${tables.length} written tables, ${tables.reduce((n, t) => n + codeWrites[t].size, 0)} code-written columns.`);
if (missingTables.length) {
  console.error(`\nMISSING TABLES (code writes them, live DB has no such table):`);
  for (const t of missingTables) console.error(`  - ${t}`);
}
if (drift.length) {
  console.error(`\nSCHEMA DRIFT (code writes a column the live DB lacks — will 400/PGRST204):`);
  for (const d of drift) console.error(`  - ${d.table}.${d.col}`);
}
if (unresolved.length) {
  console.log(`\nUNRESOLVED payloads (non-literal write args — verify manually): ${unresolved.length}`);
  for (const u of unresolved) console.log(`  - ${u.table}.${u.method} (${u.file})`);
}
if (!drift.length && !missingTables.length) {
  console.log('\nNo schema drift: every code-written column exists in the live DB.');
  process.exit(0);
}
console.error(`\nFAIL: ${drift.length} drifted column(s), ${missingTables.length} missing table(s).`);
process.exit(1);
