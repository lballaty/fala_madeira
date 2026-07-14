#!/usr/bin/env node
// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-branch-discipline.mjs
// Description: Guard for the FalaMadeira multi-agent worktree/branch model (Model B — AGENTS.md §7 +
//   docs/MULTI-AGENT-WORKFLOW.md). Verifies each git worktree is on a branch allowed for its role so
//   an agent can't accidentally commit to the wrong branch:
//     - BASE checkout (git's main working tree)  → must be `develop`
//     - `*-release` worktree                     → must be `main`
//     - `*-hotfix*` worktree                      → must be `main` or `hotfix/*`
//     - any other (feature) worktree             → must be a TOPIC branch (NOT develop, NOT main;
//                                                   e.g. feat/*, fix/*)
//   Run with no args for a full report (session start / periodic). Run with `--current` (used by the
//   pre-commit hook) to check only the current worktree and BLOCK a wrong-branch commit. Read-only;
//   exits non-zero on any violation.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { execSync } from 'node:child_process';
import { basename } from 'node:path';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const parseWorktrees = () => {
  const list = [];
  let cur = {};
  for (const line of sh('git worktree list --porcelain').split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice('worktree '.length) };
    else if (line.startsWith('branch ')) cur.branch = line.slice('branch '.length).replace('refs/heads/', '');
    else if (line === 'detached') cur.branch = '(detached)';
    else if (line.trim() === '') {
      if (cur.path) list.push(cur);
      cur = {};
    }
  }
  if (cur.path) list.push(cur);
  return list;
};

// git lists the MAIN working tree (the base checkout) first.
const worktrees = parseWorktrees();
const basePath = worktrees[0]?.path;

/** Role + allowed branches for a worktree, by whether it's the base and by its folder name. */
const evaluate = (path, branchRaw) => {
  const name = basename(path);
  const branch = branchRaw || '(detached)';
  const isBase = path === basePath;

  let label, ok, expected;
  if (isBase) {
    label = 'base checkout';
    expected = 'develop';
    ok = branch === 'develop';
  } else if (name.endsWith('-release')) {
    label = 'release worktree';
    expected = 'main';
    ok = branch === 'main';
  } else if (name.includes('-hotfix')) {
    label = 'hotfix worktree';
    expected = "main or hotfix/*";
    ok = branch === 'main' || branch.startsWith('hotfix/');
  } else {
    label = 'feature worktree';
    expected = 'a topic branch (feat/* or fix/*, never develop/main)';
    ok = branch !== 'develop' && branch !== 'main' && branch !== '(detached)';
  }
  return { path, name, branch, label, expected, ok };
};

const HINT =
  'See docs/MULTI-AGENT-WORKFLOW.md + AGENTS.md §7. Base checkout = develop; feature worktrees = ' +
  'their own feat/*/fix/* branch; *-release = main (deploy there only). Never commit develop/main from a feature folder.';

if (process.argv.includes('--current')) {
  const r = evaluate(sh('git rev-parse --show-toplevel'), sh('git branch --show-current'));
  if (!r.ok) {
    console.error(
      `\n✗ Branch-discipline violation: '${r.name}' is a ${r.label} — expected ${r.expected}, ` +
        `but it is on '${r.branch}'. Commit blocked.\n  ${HINT}\n` +
        '  (If genuinely intentional, re-run with git commit --no-verify.)',
    );
    process.exit(1);
  }
  process.exit(0);
}

const results = worktrees.map((w) => evaluate(w.path, w.branch));
console.log('FalaMadeira worktrees vs allowed branch (Model B — AGENTS.md §7):');
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name} [${r.label}] → '${r.branch}' (expected ${r.expected})`);
}
const bad = results.filter((r) => !r.ok);
if (bad.length) {
  console.error(`\n✗ ${bad.length} worktree(s) on the wrong branch — fix before committing/deploying.\n  ${HINT}`);
  process.exit(1);
}
console.log('\n✓ Branch discipline OK.');
process.exit(0);
