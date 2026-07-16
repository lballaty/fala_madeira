// File: scripts/check-help-drift.mjs
// Description: Help-drift gate (EN-17a anti-rot guard, mirrors the check-*-drift family). Regenerates
//   the edge chat-help artifact from the single App Capability Registry (src/content/appCapabilities.ts)
//   in memory and diffs it against the committed supabase/functions/_shared/appHelp.generated.ts.
//   Exits non-zero with a clear message on drift so a registry edit that was not regenerated cannot
//   ship a stale chat-help prompt. Deterministic, no network, no DB. Wired into scripts/preflight.sh.
//   Fix on failure: `node scripts/gen-app-help.mjs` then commit the regenerated artifact.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './gen-app-help.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'supabase/functions/_shared/appHelp.generated.ts');
const REL = OUT.replace(ROOT + '/', '');

if (!existsSync(OUT)) {
  console.error(`check-help-drift: ${REL} is missing. Run: node scripts/gen-app-help.mjs`);
  process.exit(1);
}

const committed = readFileSync(OUT, 'utf8');
const expected = generate();

if (committed !== expected) {
  // Show the first differing line for a quick diagnosis.
  const a = committed.split('\n');
  const b = expected.split('\n');
  let firstDiff = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { firstDiff = i; break; }
  }
  console.error(`check-help-drift: DRIFT — ${REL} is out of date with src/content/appCapabilities.ts.`);
  if (firstDiff >= 0) {
    console.error(`  first difference at line ${firstDiff + 1}:`);
    console.error(`    committed: ${JSON.stringify(a[firstDiff] ?? '<eof>')}`);
    console.error(`    expected:  ${JSON.stringify(b[firstDiff] ?? '<eof>')}`);
  }
  console.error(`  Fix: node scripts/gen-app-help.mjs && git add ${REL}`);
  process.exit(1);
}

console.log(`check-help-drift: OK — ${REL} matches src/content/appCapabilities.ts.`);
