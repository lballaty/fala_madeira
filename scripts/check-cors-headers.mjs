// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-cors-headers.mjs
// Description: Static client↔edge CORS-header contract gate. Regression guard for the 2026-07-14
//   defect where the client began sending a `traceparent` request header on every
//   supabase.functions.invoke (obs-trace) but the edge `_shared/http.ts` CORS
//   Access-Control-Allow-Headers did not list it — so the browser preflight failed and EVERY edge
//   call was blocked (FunctionsFetchError), while node/curl (no CORS enforcement) and mocked e2e
//   (route.fulfill) all stayed green. This check couples the two sides at build time: every header
//   the CLIENT attaches to functions.invoke (plus the supabase-js baseline) MUST appear in the edge
//   allow-headers. HARD gate (exit 1 on any missing header) — a missing entry means a broken app.
//   No network; pure static analysis. Companion to check-schema-drift / check-observability.
// Author: CORS regression guard (with assistant)
// Created: 2026-07-14

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();

// supabase-js attaches these on every functions.invoke; they are always required in allow-headers.
const BASELINE = ['authorization', 'apikey', 'x-client-info', 'content-type'];

// --- 1. Edge allow-headers (source of truth: _shared/http.ts corsHeaders) ---
const httpPath = resolve(root, 'supabase/functions/_shared/http.ts');
const httpSrc = readFileSync(httpPath, 'utf8');
const allowMatch = /Access-Control-Allow-Headers"\s*:\s*"([^"]+)"/.exec(httpSrc);
if (!allowMatch) {
  console.error('CORS check: could not find Access-Control-Allow-Headers in supabase/functions/_shared/http.ts — failing loudly.');
  process.exit(1);
}
const allowed = new Set(allowMatch[1].split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));

// --- 2. Custom headers the client attaches to functions.invoke ---
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) out.push(p);
  }
  return out;
}
const clientHeaders = new Map(); // header -> "file:line"
const headerObjRe = /headers:\s*\{([^}]*)\}/g;
for (const file of walk(resolve(root, 'src'))) {
  const txt = readFileSync(file, 'utf8');
  if (!txt.includes('functions.invoke')) continue; // only files that actually invoke edge fns
  if (file.includes('__tests__') || file.endsWith('.test.ts')) continue;
  const rel = file.replace(root + '/', '');
  let m;
  while ((m = headerObjRe.exec(txt))) {
    for (const part of m[1].split(',')) {
      const raw = part.trim();
      if (!raw || raw.startsWith('...')) continue;
      // shorthand `traceparent` or `'x-foo': v` / `"x-foo": v` / `key: v`
      const key = raw.split(':')[0].trim().replace(/['"]/g, '').toLowerCase();
      if (key && /^[a-z0-9-]+$/.test(key)) {
        const line = txt.slice(0, m.index).split('\n').length;
        if (!clientHeaders.has(key)) clientHeaders.set(key, `${rel}:${line}`);
      }
    }
  }
}

// --- 3. Contract: baseline ∪ client-custom ⊆ allowed ---
const required = [...new Set([...BASELINE, ...clientHeaders.keys()])];
const missing = required.filter((h) => !allowed.has(h));

const report = {
  generated_for: 'client↔edge CORS Access-Control-Allow-Headers contract',
  edge_allow_headers: [...allowed],
  client_custom_headers: Object.fromEntries(clientHeaders),
  baseline_headers: BASELINE,
  missing_from_edge: missing,
};
const outDir = resolve(root, 'artifacts');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'cors-headers-report.json'), JSON.stringify(report, null, 2));

console.log(`CORS header check: edge allows [${[...allowed].join(', ')}].`);
console.log(`Client custom headers on functions.invoke: [${[...clientHeaders.keys()].join(', ') || 'none'}].`);
if (missing.length) {
  console.error(`\nFAIL: ${missing.length} header(s) the client sends are NOT in the edge Access-Control-Allow-Headers:`);
  for (const h of missing) console.error(`  - "${h}"  (client uses it at ${clientHeaders.get(h) ?? 'supabase-js baseline'}) → add it to supabase/functions/_shared/http.ts corsHeaders`);
  console.error('\nA missing allow-header makes the browser CORS preflight fail → every edge call is blocked. Fix before commit/deploy.');
  process.exit(1);
}
console.log('PASS: every client request header is present in the edge allow-headers.');
