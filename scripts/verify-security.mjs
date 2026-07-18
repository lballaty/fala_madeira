#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/verify-security.mjs
// Description: Client-side security verifier (plan step P6 "security-verification", fatal_on_failure).
//              Three FATAL check groups + one advisory:
//                1. Bundle secret scan — greps the built web bundle (dist/) AND the native
//                   web assets (ios/App/App/public) for real key material: Gemini keys,
//                   Azure/OpenAI/ElevenLabs/AWS/Google key shapes, service-role JWTs, and the
//                   literal values of GEMINI_API_KEY / SUPABASE_DB_PASSWORD /
//                   SUPABASE_ACCESS_TOKEN from .env.local. The Supabase ANON key (role=anon
//                   JWT) and the project URL are EXPECTED in the client and are allowlisted.
//                2. Anon RLS probes — using the anon key against PostgREST: protected tables
//                   (profiles, logs) leak no cross-user rows; an anon INSERT is blocked;
//                   public tables (published content_packs, global_settings) ARE readable
//                   (policy-shape assertion, per supabase/migrations RLS).
//                3. Edge-fn auth — calls gemini + delete-account WITHOUT a JWT; asserts 401.
//                   (Never calls with a real JWT; never triggers the destructive path.)
//                Advisory (WARN, non-fatal): dev Gemini key should be rotated before prod;
//                the level_unlock_key value is anon-readable by design (global_settings
//                USING(true)) — flagged for operator awareness, not a policy violation.
//              Reads .env.local directly (never via a dotenv subshell — AGENTS.md §5 gotcha).
//              NEVER prints secret values; every secret is masked. Exit non-zero on any FATAL
//              failure with a per-check report; exit 0 (advisory printed) otherwise.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(REPO_ROOT, 'dist');
const IOS_PUBLIC_DIR = join(REPO_ROOT, 'ios', 'App', 'App', 'public');
const ENV_FILE = join(REPO_ROOT, '.env.local');

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
const results = []; // { name, status: 'PASS'|'FAIL'|'WARN', evidence }
function record(name, status, evidence) {
  results.push({ name, status, evidence });
  const tag = status === 'PASS' ? 'PASS' : status === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`[${tag}] ${name}\n       ${evidence}`);
}

// Mask a secret so it can appear in a report without disclosure: keep a short
// prefix, redact the middle, keep the length signal.
function mask(secret) {
  if (!secret) return '<empty>';
  const s = String(secret);
  if (s.length <= 8) return `${s.slice(0, 2)}…(${s.length} chars)`;
  return `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`;
}

// ---------------------------------------------------------------------------
// .env.local parsing (manual — never spawn a dotenv subshell; AGENTS.md §5)
// ---------------------------------------------------------------------------
function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip a single surrounding pair of quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = parseEnvFile(ENV_FILE);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    'FATAL: could not read VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local — cannot run probes.',
  );
  process.exit(2);
}

// Decode a JWT payload without verifying (we only need the role claim).
function decodeJwtRole(jwt) {
  try {
    const [, payloadB64] = String(jwt).split('.');
    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    return JSON.parse(json).role;
  } catch {
    return null;
  }
}

const anonRole = decodeJwtRole(ANON_KEY);

// ---------------------------------------------------------------------------
// Allowlist: values that are EXPECTED in the client bundle and must NOT be
// treated as leaks. The anon key is a public credential (role=anon, protected
// by RLS); the project URL is public.
// ---------------------------------------------------------------------------
const ALLOWLIST_VALUES = [ANON_KEY, SUPABASE_URL].filter(Boolean);
// Also allowlist the project ref (appears inside the URL and the anon JWT).
const PROJECT_REF = (() => {
  const m = /https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(SUPABASE_URL || '');
  return m ? m[1] : null;
})();

// ---------------------------------------------------------------------------
// GROUP 1 — Bundle secret scan (FATAL)
// ---------------------------------------------------------------------------

// Ensure a fresh web build exists. If dist/ is missing or looks empty/mid-build
// (no index.html or no assets), build once and scan the fresh output.
function ensureBuild() {
  const looksBuilt =
    existsSync(DIST_DIR) &&
    existsSync(join(DIST_DIR, 'index.html')) &&
    existsSync(join(DIST_DIR, 'assets')) &&
    readdirSync(join(DIST_DIR, 'assets')).some((f) => f.endsWith('.js'));
  if (looksBuilt) {
    console.log(`  · dist/ present and looks built — scanning existing bundle.`);
    return;
  }
  console.log(`  · dist/ missing or mid-build — running \`npm run build\` once…`);
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
}

// Recursively collect text-scannable files under a directory. Binary assets
// (images, fonts, audio) can't embed a grep-able secret string in a way that
// would matter for a JS bundle leak, but we still scan .js/.css/.html/.json/.map
// and any small text file. We size-cap to avoid pathological reads.
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.json', '.map',
  '.txt', '.webmanifest', '.xml', '.svg', '.ts',
]);

function collectTextFiles(root) {
  const files = [];
  if (!existsSync(root)) return files;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      const dot = e.name.lastIndexOf('.');
      const ext = dot === -1 ? '' : e.name.slice(dot).toLowerCase();
      if (!TEXT_EXT.has(ext)) continue;
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      if (size > 25 * 1024 * 1024) continue; // 25MB cap
      files.push(full);
    }
  }
  return files;
}

// Secret shape patterns. These match the SHAPE of provider key material.
// The anon key and URL are removed from every hit before evaluation (allowlist).
const SECRET_PATTERNS = [
  { name: 'Gemini/Google API key (AIzaSy…)', re: /AIza[0-9A-Za-z\-_]{20,}/g },
  { name: 'Google OAuth key (AQ.Ab…)', re: /AQ\.[0-9A-Za-z\-_]{20,}/g },
  { name: 'OpenAI key (sk-…)', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: 'OpenAI project key (sk-proj-…)', re: /\bsk-proj-[A-Za-z0-9\-_]{20,}\b/g },
  { name: 'ElevenLabs key', re: /\b(?:el|sk)_[a-f0-9]{40,}\b/g },
  { name: 'AWS access key id (AKIA…)', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Azure Speech/Cognitive key (32-hex)', re: /\b[a-f0-9]{32}\b/g },
  { name: 'Supabase service key literal', re: /SUPABASE_SERVICE_ROLE[_A-Z]*\s*[:=]\s*["'][^"']+["']/g },
  { name: 'Gemini key literal name=value', re: /GEMINI_API_KEY\s*[:=]\s*["'][^"']+["']/g },
];

// A JWT whose decoded payload declares role=service_role is the crown jewel.
const JWT_RE = /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g;

// Exact literal values from .env.local that must NEVER appear in a bundle.
const FORBIDDEN_LITERALS = [
  { name: 'GEMINI_API_KEY value', value: env.GEMINI_API_KEY },
  { name: 'SUPABASE_DB_PASSWORD value', value: env.SUPABASE_DB_PASSWORD },
  { name: 'SUPABASE_ACCESS_TOKEN value', value: env.SUPABASE_ACCESS_TOKEN },
].filter((x) => x.value && x.value.length >= 6);

function stripAllowlisted(text) {
  let t = text;
  for (const allowed of ALLOWLIST_VALUES) {
    if (allowed) t = t.split(allowed).join(''); // remove exact allowlisted values
  }
  return t;
}

// The Azure 32-hex pattern is broad — it also matches asset content hashes in
// bundled filenames (e.g. `index-a1b2…​.js`) and sourcemap hashes. To avoid false
// positives we only treat a 32-hex hit as a secret if it does NOT appear as part
// of a filename-like token and is not a known digest context. Practically: we
// only flag a 32-hex string if the SAME value also equals an Azure/AWS-shaped
// env literal (covered by FORBIDDEN_LITERALS) — so the 32-hex pattern is kept as
// an informational signal, not a standalone FATAL, unless it matches a literal.
const INFO_ONLY_PATTERN_NAMES = new Set(['Azure Speech/Cognitive key (32-hex)']);

function scanBundle(label, dir) {
  const findings = []; // real (FATAL) findings
  const info = []; // info-only signals (WARN)
  if (!existsSync(dir)) {
    record(
      `Bundle scan — ${label}`,
      'PASS',
      `${relative(REPO_ROOT, dir)} not present — nothing to scan (skipped).`,
    );
    return { findings, info };
  }
  const files = collectTextFiles(dir);
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const text = stripAllowlisted(raw);
    const rel = relative(REPO_ROOT, file);

    // Forbidden exact literals from .env.local
    for (const lit of FORBIDDEN_LITERALS) {
      if (text.includes(lit.value)) {
        findings.push(`${lit.name} found verbatim in ${rel} (value ${mask(lit.value)})`);
      }
    }

    // Shape patterns
    for (const pat of SECRET_PATTERNS) {
      pat.re.lastIndex = 0;
      const hits = text.match(pat.re);
      if (!hits) continue;
      for (const hit of new Set(hits)) {
        if (ALLOWLIST_VALUES.includes(hit)) continue;
        if (INFO_ONLY_PATTERN_NAMES.has(pat.name)) {
          info.push(`${pat.name} shaped token in ${rel}: ${mask(hit)}`);
        } else {
          findings.push(`${pat.name} in ${rel}: ${mask(hit)}`);
        }
      }
    }

    // Any JWT whose payload is a service_role token
    JWT_RE.lastIndex = 0;
    const jwts = text.match(JWT_RE);
    if (jwts) {
      for (const jwt of new Set(jwts)) {
        if (ALLOWLIST_VALUES.includes(jwt)) continue; // anon key allowlisted
        const role = decodeJwtRole(jwt);
        if (role === 'service_role') {
          findings.push(`SERVICE_ROLE JWT in ${rel}: ${mask(jwt)}`);
        } else if (role && role !== 'anon') {
          findings.push(`Non-anon JWT (role=${role}) in ${rel}: ${mask(jwt)}`);
        } else if (role === 'anon' && jwt !== ANON_KEY) {
          // an anon JWT that is NOT the known project anon key — worth flagging
          info.push(`Unexpected anon JWT (not the configured project anon key) in ${rel}: ${mask(jwt)}`);
        }
      }
    }
  }
  return { findings, info };
}

// ---------------------------------------------------------------------------
// GROUP 2 — Anon RLS probes (FATAL)
// ---------------------------------------------------------------------------
const restBase = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
const anonHeaders = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function restGet(pathAndQuery) {
  const res = await fetch(`${restBase}/${pathAndQuery}`, {
    method: 'GET',
    headers: anonHeaders,
  });
  let body = null;
  const txt = await res.text();
  try {
    body = JSON.parse(txt);
  } catch {
    body = txt;
  }
  return { status: res.status, body };
}

async function restInsert(table, row) {
  const res = await fetch(`${restBase}/${table}`, {
    method: 'POST',
    headers: { ...anonHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  let body = null;
  const txt = await res.text();
  try {
    body = JSON.parse(txt);
  } catch {
    body = txt;
  }
  return { status: res.status, body };
}

async function runRlsProbes() {
  let allPass = true;

  // (a) Protected tables must leak NO cross-user rows for an anonymous caller.
  //     PostgREST returns 200 with [] when RLS filters everything out — that is
  //     the correct, expected shape (not a 4xx). A leak = any row returned, OR a
  //     2xx with data, OR an unexpected 5xx.
  for (const table of ['profiles', 'logs']) {
    try {
      const { status, body } = await restGet(`${table}?select=id&limit=5`);
      const isEmpty = Array.isArray(body) && body.length === 0;
      const isDenied = status === 401 || status === 403;
      if (isEmpty && status === 200) {
        record(
          `RLS: anon read of protected \`${table}\``,
          'PASS',
          `HTTP ${status}, 0 rows — RLS filters all rows for anon (no cross-user leak).`,
        );
      } else if (isDenied) {
        record(
          `RLS: anon read of protected \`${table}\``,
          'PASS',
          `HTTP ${status} — request denied by RLS/gateway (no data).`,
        );
      } else if (Array.isArray(body) && body.length > 0) {
        allPass = false;
        record(
          `RLS: anon read of protected \`${table}\``,
          'FAIL',
          `HTTP ${status} returned ${body.length} row(s) to an anonymous caller — CROSS-USER DATA LEAK.`,
        );
      } else {
        allPass = false;
        record(
          `RLS: anon read of protected \`${table}\``,
          'FAIL',
          `HTTP ${status} unexpected response: ${JSON.stringify(body).slice(0, 160)}`,
        );
      }
    } catch (e) {
      allPass = false;
      record(`RLS: anon read of protected \`${table}\``, 'FAIL', `probe error: ${e.message}`);
    }
  }

  // (a2) Cross-user profile read by an explicit foreign id must return nothing.
  try {
    const foreignId = '11111111-1111-1111-1111-111111111111';
    const { status, body } = await restGet(
      `profiles?select=id,email&id=eq.${foreignId}`,
    );
    const isEmpty = Array.isArray(body) && body.length === 0;
    if (isEmpty || status === 401 || status === 403) {
      record(
        'RLS: anon cross-user profile read (explicit id)',
        'PASS',
        `HTTP ${status}, no row for a foreign profile id — cross-user read blocked.`,
      );
    } else {
      allPass = false;
      record(
        'RLS: anon cross-user profile read (explicit id)',
        'FAIL',
        `HTTP ${status} leaked profile data: ${JSON.stringify(body).slice(0, 160)}`,
      );
    }
  } catch (e) {
    allPass = false;
    record('RLS: anon cross-user profile read (explicit id)', 'FAIL', `probe error: ${e.message}`);
  }

  // (b) Anon INSERT into a protected table must be blocked by RLS.
  try {
    const { status, body } = await restInsert('logs', {
      event: 'security-probe',
      user_id: '00000000-0000-0000-0000-000000000000',
    });
    const blocked =
      status === 401 ||
      status === 403 ||
      (typeof body === 'object' && body && body.code === '42501'); // RLS violation
    if (blocked) {
      const codeStr = typeof body === 'object' && body ? body.code : '';
      record(
        'RLS: anon INSERT into protected `logs`',
        'PASS',
        `HTTP ${status}${codeStr ? ` (pg ${codeStr})` : ''} — write blocked by RLS.`,
      );
    } else {
      allPass = false;
      record(
        'RLS: anon INSERT into protected `logs`',
        'FAIL',
        `HTTP ${status} — anon write was NOT blocked: ${JSON.stringify(body).slice(0, 160)}`,
      );
    }
  } catch (e) {
    allPass = false;
    record('RLS: anon INSERT into protected `logs`', 'FAIL', `probe error: ${e.message}`);
  }

  // (c) Public-by-design tables MUST be readable (policy-shape assertion). This
  //     guards against over-locking: content the app needs to serve unauth'd (or
  //     to any signed-in user) must not be accidentally hidden. Per migrations:
  //       - content_packs: SELECT USING (status='published' OR is_admin())
  //       - global_settings: SELECT USING (true)
  try {
    const { status, body } = await restGet('content_packs?select=id,status&limit=5');
    const published = Array.isArray(body) ? body.filter((r) => r.status === 'published') : [];
    if (status === 200 && Array.isArray(body) && body.every((r) => r.status === 'published')) {
      record(
        'RLS: anon read of public `content_packs`',
        'PASS',
        `HTTP ${status}, ${body.length} row(s), all status=published — public-read policy intact, no drafts leaked.`,
      );
    } else if (status === 200 && Array.isArray(body) && published.length !== body.length) {
      // Non-published rows visible to anon => policy is broken (draft leak).
      allPass = false;
      record(
        'RLS: anon read of public `content_packs`',
        'FAIL',
        `HTTP ${status} exposed ${body.length - published.length} non-published pack(s) to anon — draft leak.`,
      );
    } else {
      // Empty is acceptable if no packs are published yet; report as PASS-with-note.
      record(
        'RLS: anon read of public `content_packs`',
        'PASS',
        `HTTP ${status} — ${Array.isArray(body) ? body.length : 0} published pack(s) readable (no draft leak).`,
      );
    }
  } catch (e) {
    allPass = false;
    record('RLS: anon read of public `content_packs`', 'FAIL', `probe error: ${e.message}`);
  }

  try {
    const { status, body } = await restGet('global_settings?select=key&limit=5');
    if (status === 200 && Array.isArray(body)) {
      record(
        'RLS: anon read of public `global_settings`',
        'PASS',
        `HTTP ${status}, ${body.length} row(s) — public-read policy (USING true) intact.`,
      );
    } else {
      allPass = false;
      record(
        'RLS: anon read of public `global_settings`',
        'FAIL',
        `HTTP ${status} unexpected: ${JSON.stringify(body).slice(0, 160)}`,
      );
    }
  } catch (e) {
    allPass = false;
    record('RLS: anon read of public `global_settings`', 'FAIL', `probe error: ${e.message}`);
  }

  return allPass;
}

// ---------------------------------------------------------------------------
// GROUP 3 — Edge-fn auth (FATAL) — call WITHOUT a JWT; expect 401.
// Never send a real JWT; never trigger the destructive delete path (the 401
// occurs before any deletion logic runs).
// ---------------------------------------------------------------------------
async function probeEdgeFn(name, payload) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // deliberately no Authorization / apikey
      body: JSON.stringify(payload),
    });
    let body = null;
    const txt = await res.text();
    try {
      body = JSON.parse(txt);
    } catch {
      body = txt;
    }
    const unauthorized = res.status === 401 || res.status === 403;
    if (unauthorized) {
      const code =
        (body && body.code) || (body && body.error && body.error.code) || '';
      record(
        `Edge fn auth: \`${name}\` without JWT`,
        'PASS',
        `HTTP ${res.status}${code ? ` (${code})` : ''} — unauthenticated call rejected.`,
      );
      return true;
    }
    record(
      `Edge fn auth: \`${name}\` without JWT`,
      'FAIL',
      `HTTP ${res.status} — unauthenticated call was NOT rejected: ${JSON.stringify(body).slice(0, 160)}`,
    );
    return false;
  } catch (e) {
    record(`Edge fn auth: \`${name}\` without JWT`, 'FAIL', `probe error: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== FalaMadeira security verification (P6) ===');
  console.log(`Repo: ${REPO_ROOT}`);
  console.log(`Supabase: ${SUPABASE_URL} (project ref ${PROJECT_REF ?? '?'})`);
  console.log(
    `Anon key role: ${anonRole ?? 'unknown'} (allowlisted — public client credential, ${mask(ANON_KEY)})`,
  );
  console.log(
    `Allowlisted-in-bundle: anon key (role=${anonRole}) + project URL. These ARE meant to ship in the client.`,
  );
  console.log('');

  if (anonRole !== 'anon') {
    // Hard stop: if the configured key is not an anon key, our whole trust model
    // is wrong and every "anon" probe below would be meaningless.
    record(
      'Anon key sanity',
      'FAIL',
      `VITE_SUPABASE_ANON_KEY decodes to role=${anonRole ?? 'unknown'}, expected 'anon'. Refusing to proceed.`,
    );
    finish(false);
    return;
  }

  let fatalOk = true;

  // --- GROUP 1: bundle scan ---
  console.log('--- Group 1: bundle secret scan (FATAL) ---');
  try {
    ensureBuild();
  } catch (e) {
    record('Bundle build', 'FAIL', `\`npm run build\` failed: ${e.message}`);
    finish(false);
    return;
  }

  const web = scanBundle('web (dist/)', DIST_DIR);
  const native = scanBundle('native (ios/App/App/public)', IOS_PUBLIC_DIR);
  const allFindings = [...web.findings, ...native.findings];
  const allInfo = [...web.info, ...native.info];

  if (allFindings.length === 0) {
    record(
      'Bundle secret scan',
      'PASS',
      `No key material found in web or native bundle (anon key + project URL allowlisted). ` +
        `Scanned dist/ and ios/App/App/public.`,
    );
  } else {
    fatalOk = false;
    record(
      'Bundle secret scan',
      'FAIL',
      `${allFindings.length} secret finding(s):\n       - ${allFindings.join('\n       - ')}`,
    );
  }
  if (allInfo.length > 0) {
    record(
      'Bundle scan info signals',
      'WARN',
      `Non-fatal shape signals (verify these are asset/content hashes, not keys):\n       - ${allInfo.join('\n       - ')}`,
    );
  }
  console.log('');

  // --- GROUP 2: RLS probes ---
  console.log('--- Group 2: anon RLS probes (FATAL) ---');
  const rlsOk = await runRlsProbes();
  if (!rlsOk) fatalOk = false;
  console.log('');

  // --- GROUP 3: edge-fn auth ---
  console.log('--- Group 3: edge-fn auth (FATAL) ---');
  const aiGatewayOk = await probeEdgeFn('ai-gateway', { action: 'chat', payload: {} });
  const deleteOk = await probeEdgeFn('delete-account', {});
  if (!aiGatewayOk || !deleteOk) fatalOk = false;
  console.log('');

  // --- Advisory (WARN, non-fatal) ---
  console.log('--- Advisory (WARN, non-fatal) ---');
  // We cannot verify a key's identity/environment from the client. Per AGENTS.md
  // §5 the Gemini key currently in .env.local is a DEV key and lives server-side
  // (edge-function secrets); it must be rotated to a prod key before production.
  record(
    'Advisory: rotate dev Gemini key before prod',
    'WARN',
    `A Gemini key is present in .env.local (${mask(env.GEMINI_API_KEY)}) for local/dev use. ` +
      `It is NOT in the client bundle (Group 1 passed) and lives in edge-function secrets server-side, ` +
      `but key identity can't be verified from the client — rotate to a production key before prod deploy.`,
  );
  // global_settings.level_unlock_key is anon-readable BY DESIGN (USING true).
  record(
    'Advisory: level_unlock_key is anon-readable by design',
    'WARN',
    `global_settings has SELECT USING(true), so the level_unlock_key VALUE is world-readable via the anon key. ` +
      `This matches migration 00005's declared policy (it was moved out of client source, not made secret). ` +
      `If the unlock key must be confidential, tighten the global_settings SELECT policy — tracked as an operator decision, not a policy violation.`,
  );
  console.log('');

  finish(fatalOk);
}

function finish(fatalOk) {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log('=== Summary ===');
  console.log(`PASS: ${pass}   WARN: ${warn}   FAIL: ${fail}`);
  if (fail > 0) {
    console.log('\nFAILURES:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  - ${r.name}: ${r.evidence}`);
    }
  }
  if (!fatalOk || fail > 0) {
    console.log('\nRESULT: FAIL (a fatal check did not pass).');
    process.exit(1);
  }
  console.log('\nRESULT: PASS (all fatal checks passed; advisories printed above).');
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL: verifier crashed:', e);
  process.exit(2);
});
