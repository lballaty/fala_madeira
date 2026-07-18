// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/release-readiness.mjs
// Description: Phase-1 release survey (canonical release protocol: docs/MULTI-AGENT-WORKFLOW.md §7). Surveys
//   EVERY git worktree that shares this repo and reports, per worktree: its branch, whether it is on
//   its allowed branch, whether it has uncommitted work (⇒ ongoing — hold back), unpushed commits,
//   and how many committed commits it is AHEAD of origin/develop (⇒ ready to merge into the next
//   release) and BEHIND (⇒ needs a develop sync). It classifies each worktree ONGOING / READY /
//   SYNCED / IDLE and prints the candidate merge set + the explicitly held-back set, so nothing is
//   silently dropped. Read-only: it never merges, pushes, or mutates anything (it does `git fetch`
//   unless --no-fetch). The release-performing agent uses this to answer "what is pending across the
//   worktrees, what is ready, what is still being worked" before merging + testing + releasing.
// Author: Lane B (with assistant)
// Created: 2026-07-15
// Usage: node scripts/release-readiness.mjs [--no-fetch] [--json]

import { execFileSync } from 'node:child_process';

const NO_FETCH = process.argv.includes('--no-fetch');
const AS_JSON = process.argv.includes('--json');

/** Run git and return trimmed stdout ('' on failure). */
const git = (args, cwd) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

/** Allowed branch (or matcher) per worktree, inferred from its folder suffix (Model B). */
const allowedBranch = (path) => {
  if (path.endsWith('-release')) return { kind: 'exact', value: 'main' };
  if (path.endsWith('-feat')) return { kind: 'prefix', value: 'feat/' };
  if (path.endsWith('-support')) return { kind: 'prefix', value: 'fix/' };
  if (path.endsWith('-content')) return { kind: 'prefix', value: 'content/' };
  return { kind: 'exact', value: 'develop' }; // the base checkout
};

const onAllowedBranch = (branch, rule) =>
  rule.kind === 'exact' ? branch === rule.value : branch.startsWith(rule.value);

// --- enumerate worktrees ------------------------------------------------------------------------
const porcelain = git(['worktree', 'list', '--porcelain'], process.cwd());
if (!porcelain) {
  console.error('release-readiness: not inside a git repository (or no worktrees).');
  process.exit(1);
}

const worktrees = [];
let cur = null;
for (const line of porcelain.split('\n')) {
  if (line.startsWith('worktree ')) { cur = { path: line.slice('worktree '.length) }; worktrees.push(cur); }
  else if (line.startsWith('branch ')) cur.branch = line.slice('branch '.length).replace('refs/heads/', '');
  else if (line === 'detached') cur.branch = '(detached)';
}

if (!NO_FETCH) {
  process.stderr.write('release-readiness: git fetch --all --quiet …\n');
  git(['fetch', '--all', '--quiet'], process.cwd());
}

// --- survey each worktree -----------------------------------------------------------------------
const rows = worktrees.map((wt) => {
  const { path, branch = '(unknown)' } = wt;
  const rule = allowedBranch(path);
  const allowed = onAllowedBranch(branch, rule);
  const dirty = git(['status', '--porcelain'], path).split('\n').filter((l) => l && !l.includes('.claude/')).length > 0;
  const head = git(['rev-parse', '--short', 'HEAD'], path);

  // Ahead/behind vs origin/develop (the integration branch). For the release/base worktree the
  // "ahead of develop" count is release-oriented; for feature worktrees it is the mergeable set.
  const vsDev = git(['rev-list', '--left-right', '--count', `origin/develop...${branch}`], path);
  let behindDev = 0, aheadDev = 0;
  const m = vsDev.match(/^(\d+)\s+(\d+)$/);
  if (m) { behindDev = Number(m[1]); aheadDev = Number(m[2]); }

  // Unpushed vs this branch's own upstream (if any).
  const vsUp = git(['rev-list', '--left-right', '--count', `@{u}...HEAD`], path);
  const um = vsUp.match(/^(\d+)\s+(\d+)$/);
  const unpushed = um ? Number(um[2]) : null; // null = no upstream

  const lastAge = git(['log', '-1', '--format=%cr'], path);

  // Classify (base/develop and -release are integration/target lanes, not "merge candidates").
  const isFeatureLane = /-feat|-support|-content$/.test(path);
  let status;
  if (dirty) status = 'ONGOING';                       // uncommitted work → hold back
  else if (isFeatureLane && aheadDev > 0) status = 'READY';   // clean + has commits not in develop
  else if (behindDev > 0) status = 'BEHIND';           // needs a develop sync
  else status = 'IDLE';

  return { path, branch, allowed, dirty, head, aheadDev, behindDev, unpushed, lastAge, status, isFeatureLane };
});

if (AS_JSON) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

// --- report -------------------------------------------------------------------------------------
const short = (p) => p.split('/').pop();
const pad = (s, n) => String(s).padEnd(n);
console.log('\n=== Release readiness — worktree survey ===\n');
console.log(pad('worktree', 24), pad('branch', 26), pad('ok?', 4), pad('dirty', 6), pad('unpushed', 9), pad('±develop', 12), pad('last', 14), 'status');
console.log('-'.repeat(120));
for (const r of rows) {
  const pm = `-${r.behindDev}/+${r.aheadDev}`;
  console.log(
    pad(short(r.path), 24), pad(r.branch, 26), pad(r.allowed ? 'yes' : 'NO!', 4),
    pad(r.dirty ? 'YES' : '-', 6), pad(r.unpushed === null ? 'n/a' : r.unpushed, 9),
    pad(pm, 12), pad(r.lastAge || '-', 14), r.status,
  );
}

const ready = rows.filter((r) => r.status === 'READY');
const ongoing = rows.filter((r) => r.status === 'ONGOING');
const behind = rows.filter((r) => r.status === 'BEHIND');
const wrongBranch = rows.filter((r) => !r.allowed);

console.log('\n--- Candidate merge set (READY → merge into develop, then test) ---');
console.log(ready.length ? ready.map((r) => `  • ${r.branch}  (${short(r.path)}, +${r.aheadDev} vs develop)`).join('\n') : '  (none)');
console.log('\n--- Held back (ONGOING — uncommitted work; do NOT merge) ---');
console.log(ongoing.length ? ongoing.map((r) => `  • ${short(r.path)} on ${r.branch}`).join('\n') : '  (none)');
if (behind.length) {
  console.log('\n--- Needs a develop sync (BEHIND origin/develop) ---');
  console.log(behind.map((r) => `  • ${short(r.path)} on ${r.branch} (behind ${r.behindDev})`).join('\n'));
}
if (wrongBranch.length) {
  console.log('\n⚠️  ON THE WRONG BRANCH (branch-discipline violation):');
  console.log(wrongBranch.map((r) => `  • ${short(r.path)} is on ${r.branch}`).join('\n'));
}
console.log('\nNext: review the merge set, then follow docs/MULTI-AGENT-WORKFLOW.md §7 (merge → full regression → staging→approve→production release cut).\n');
