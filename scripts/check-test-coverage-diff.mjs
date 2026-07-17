#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-test-coverage-diff.mjs
// Description: Coverage-diff gate (AGENTS.md §3 "test every change" — owner reinforced 2026-07-16:
//   tests are NOT optional). Fails when a range of commits adds/modifies FUNCTIONAL code under
//   `src/**` or `supabase/functions/**` WITHOUT also adding/modifying at least one test file in the
//   same range. Granularity is the whole pushed/PR range (not per-commit) so an incremental
//   fix-then-test commit sequence is fine. Escape hatch: include `[skip-coverage: <reason>]` in any
//   commit message in the range (the reason is printed, so the skip is auditable). Read-only.
//   Modes:
//     --pre-push        read the git pre-push protocol on stdin and check each pushed ref's new range
//     --range A..B      check an explicit commit range (used by CI)
//     --staged          check currently-staged changes (optional pre-commit use)
//   Exit non-zero on any violation. Wired into .githooks/pre-push and .github/workflows/coverage-gate.yml.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const ZERO = '0000000000000000000000000000000000000000';

// A path is FUNCTIONAL if it is code under src/ or supabase/functions/ and is NOT itself a test.
const FUNCTIONAL_RE = /^(src|supabase\/functions)\/.*\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_RE = /(^tests\/|(^|\/)__tests__\/|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$)/;
// Not "functional" even though they match the extension: type-only declarations and story files.
const NON_FUNCTIONAL_EXTRA = /(\.d\.ts$|\.stories\.[jt]sx?$)/;

const isFunctional = (p) => FUNCTIONAL_RE.test(p) && !TEST_RE.test(p) && !NON_FUNCTIONAL_EXTRA.test(p);
const isTest = (p) => TEST_RE.test(p);

/** Aggregate Added/Modified/Renamed paths across an explicit range or a set of commits. */
function changedFiles({ range, commits }) {
  const files = new Set();
  const collect = (nameStatus) => {
    for (const line of nameStatus.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const status = parts[0];
      if (status.startsWith('D')) continue; // a deletion never REQUIRES a new test
      // For renames/copies (R100/C100) the destination is the last field.
      files.add(parts[parts.length - 1]);
    }
  };
  if (range) {
    collect(sh(`git diff --name-status ${range}`));
  } else if (commits) {
    for (const c of commits) collect(sh(`git show --name-status --format= ${c}`));
  }
  return [...files];
}

function commitMessages({ range, commits }) {
  if (range) return sh(`git log --format=%B ${range}`);
  if (commits && commits.length) return commits.map((c) => sh(`git log -1 --format=%B ${c}`)).join('\n');
  return '';
}

/** Evaluate one unit of work (a range or a commit list). Returns { ok, reason }. */
function evaluate({ label, range, commits }) {
  const files = changedFiles({ range, commits });
  const functional = files.filter(isFunctional);
  const tests = files.filter(isTest);
  const msgs = commitMessages({ range, commits });
  // Line-anchored so a documentation MENTION of the syntax mid-prose (e.g. this very gate's own
  // commit message describing the escape hatch) does NOT trigger a skip — the directive must be on
  // its own line, and the reason must be real (not the literal "<reason>" placeholder).
  const skipMatch = msgs.match(/^\s*\[skip-coverage:\s*([^\]]+)\]\s*$/im);
  const skipReason = skipMatch ? skipMatch[1].trim() : '';
  const hasSkip = skipReason && skipReason.toLowerCase() !== '<reason>';

  // Order matters: recognize genuine paired coverage BEFORE honoring any skip, so a real test never
  // gets reported as a skip, and a skip only ever applies when functional code shipped with NO test.
  if (functional.length === 0) return { ok: true, note: `${label}: no functional code changed — OK` };
  if (tests.length > 0) return { ok: true, note: `${label}: ${functional.length} functional file(s) + ${tests.length} test file(s) — OK` };
  if (hasSkip) return { ok: true, note: `${label}: coverage skip honored — reason: "${skipReason}"` };

  return {
    ok: false,
    label,
    functional,
  };
}

function report(results) {
  let failed = false;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.note}`);
      continue;
    }
    failed = true;
    console.error(`\n  ✗ ${r.label}: functional code changed with NO paired test (AGENTS.md §3).`);
    for (const f of r.functional) console.error(`      • ${f}`);
  }
  if (failed) {
    console.error('\ncoverage-gate FAILED — every change under src/** or supabase/functions/** must ship an');
    console.error('added/updated test in the same range. Add the test, or (rarely, and audibly) tag a commit');
    console.error('message in the range with:  [skip-coverage: <reason>]');
    process.exit(1);
  }
  console.log('\ncoverage-gate PASSED');
}

// --------------------------------------------------------------------------- modes
const args = process.argv.slice(2);

if (args.includes('--pre-push')) {
  const stdin = (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();
  const results = [];
  for (const line of stdin.split('\n')) {
    const [localRef, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || localSha === ZERO) continue; // branch deletion — nothing to check
    let commits;
    if (!remoteSha || remoteSha === ZERO) {
      // New remote branch: commits not already on any remote.
      commits = sh(`git rev-list ${localSha} --not --remotes`).split('\n').filter(Boolean);
    } else {
      commits = sh(`git rev-list ${remoteSha}..${localSha}`).split('\n').filter(Boolean);
    }
    if (commits.length === 0) continue;
    results.push(evaluate({ label: `push ${localRef || localSha.slice(0, 8)} (${commits.length} commit[s])`, commits }));
  }
  if (results.length === 0) { console.log('coverage-gate: nothing to check'); process.exit(0); }
  report(results);
} else if (args.some((a) => a.startsWith('--range'))) {
  const idx = args.findIndex((a) => a.startsWith('--range'));
  const range = args[idx].includes('=') ? args[idx].split('=')[1] : args[idx + 1];
  if (!range || !range.includes('..')) { console.error('usage: --range <base>..<head>'); process.exit(2); }
  report([evaluate({ label: `range ${range}`, range })]);
} else if (args.includes('--staged')) {
  const files = sh('git diff --cached --name-status').split('\n')
    .filter(Boolean).filter((l) => !l.startsWith('D')).map((l) => l.split('\t').pop());
  const functional = files.filter(isFunctional);
  const tests = files.filter(isTest);
  if (functional.length && !tests.length) {
    console.error('coverage-gate (staged): functional code staged with no paired test:');
    for (const f of functional) console.error(`   • ${f}`);
    process.exit(1);
  }
  console.log('coverage-gate (staged) PASSED');
} else {
  console.error('usage: check-test-coverage-diff.mjs [--pre-push | --range A..B | --staged]');
  process.exit(2);
}
