// File: scripts/check-changelog-completeness.mjs
// Description: Release-notes completeness + voice gate. Enforces the "Release notes (CHANGELOG)
//   authoring" standard in AGENTS.md 4. Compares the TOP CHANGELOG entry (the release being
//   prepared) against the user-facing commits shipped since the last release, and reports:
//     (1) COMPLETENESS - every shipped ticket ID (from feat(/fix( commits touching src/ or
//         supabase/functions/) must appear in the top entry's bullets. Missing -> reported.
//     (2) TERSENESS heuristic - WARN if the top entry has fewer bullets than the number of
//         distinct shipped ticket-scopes (a rough "too collapsed" signal, e.g. a ticket with
//         4 user-facing fixes collapsed into 1 bullet - the EN-23b failure this gate exists for).
//     (3) VOICE heuristic - WARN if a bullet's prose carries obvious technical tokens (file
//         extensions, call syntax, config paths, camelCase identifiers in backticks) outside
//         the trailing ticket tag. Release notes are user-facing; jargon should not leak in.
//   MODE: WARN-ONLY for now (always exit 0) - this is a rollout, and a production deploy of
//   2026.07.19.1 runs preflight; the gate must NOT fail the build today. Promoting to enforce
//   (exit 1 on missing-ticket) is the target once the heuristics are tuned, gated behind
//   CHANGELOG_GATE_ENFORCE=1 (see ENFORCE below). Deterministic aside from git log; no network.
//   Wired into scripts/preflight.sh.
// Author: changelog-gate (with assistant)
// Created: 2026-07-19

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHANGELOG = resolve(ROOT, 'CHANGELOG.md');

// Enforce mode is the TARGET once the heuristics are tuned. Until then this stays off so the
// gate can roll out without failing a build. When CHANGELOG_GATE_ENFORCE=1, a COMPLETENESS
// failure (a shipped ticket missing from the top entry) exits 1. The two heuristics
// (terseness, voice) stay advisory (WARN) even under enforce - they are intentionally fuzzy.
const ENFORCE = process.env.CHANGELOG_GATE_ENFORCE === '1';

// Ticket-ID grammar shared with the CHANGELOG tags: TB-1, EN-23b, EF-38, SEC-3, DF-4, PF-2, INFRA-5.
const TICKET_RE = /\b(TB|EN|EF|SEC|DF|PF|INFRA)-\d+[a-z]?\b/g;

// Commit subjects that ship a user-facing change: conventional feat(/fix( prefixes. We read the
// ticket ID from the conventional-commit SCOPE - the text inside `feat(...)` / `fix(...)` - NOT
// the whole subject. This matters: `fix(EN-23b W1): wire ... to real EN-8 config` SHIPS EN-23b
// and only *references* EN-8 (an existing config) in prose. Scanning the whole subject would
// wrongly count EN-8 as shipped; scanning the scope correctly attributes it to EN-23b.
const SCOPE_RE = /^(feat|fix)\(([^)]*)\)/;

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// --- Determine the commit range (last release .. HEAD) --------------------------------------
//
// The "last released version" is, by CHANGELOG convention, the SECOND `## <version>` header:
// the top header is the release currently being prepared. We prefer the matching git tag
// (`v<version>`) as the range base because tags mark what actually shipped. Fallbacks, in order:
//   1. env/arg override (CHANGELOG_GATE_SINCE=<ref> or `--since <ref>`)
//   2. tag `v<secondVersion>` if it exists
//   3. `origin/main` (what production last saw) if it exists
//   4. the repo root (whole history) - degenerate but safe; over-reports rather than under-reports.

function parseVersionHeaders(md) {
  // Matches lines like `## 2026.07.19.1`. Captures the version token.
  const re = /^##\s+(\d{4}\.\d{2}\.\d{2}\.\d+)\s*$/gm;
  const out = [];
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function refExists(ref) {
  if (!ref) return false;
  try {
    execSync(`git rev-parse --verify --quiet ${ref}^{commit}`, { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(CHANGELOG)) {
  console.error('check-changelog-completeness: CHANGELOG.md is missing - nothing to check.');
  process.exit(0); // WARN-only posture: never block on our own absence.
}

const md = readFileSync(CHANGELOG, 'utf8');
const versions = parseVersionHeaders(md);
const topVersion = versions[0];
const lastReleased = versions[1];

// Resolve the range base.
const overrideSince = process.env.CHANGELOG_GATE_SINCE || argValue('--since');
let base = null;
let baseSource = null;
if (overrideSince && refExists(overrideSince)) {
  base = overrideSince;
  baseSource = 'override';
} else if (lastReleased && refExists(`v${lastReleased}`)) {
  base = `v${lastReleased}`;
  baseSource = 'tag';
} else if (refExists('origin/main')) {
  base = 'origin/main';
  baseSource = 'origin/main (no matching tag)';
} else {
  base = null; // whole history
  baseSource = 'whole history (no tag, no origin/main)';
}

const range = base ? `${base}..HEAD` : 'HEAD';

// --- Collect shipped user-facing tickets in range -------------------------------------------
//
// Only commits that TOUCH product surface (src/ or supabase/functions/) with a feat(/fix(
// subject count. Pure docs/tracker/test/plan/chore commits do not represent a user-facing change
// and are excluded, so the completeness check tracks real shipped behavior, not paperwork.
// One commit subject per line (%s never contains a newline), scoped to product-surface paths.
const logRaw = git(`log ${range} --format=%s -- src/ supabase/functions/`);
const shippedTickets = new Map(); // ticketId -> count of commits referencing it
if (logRaw) {
  for (const subject of logRaw.split('\n')) {
    if (!subject) continue;
    const scopeMatch = SCOPE_RE.exec(subject);
    if (!scopeMatch) continue; // not a feat(/fix( user-facing commit
    // Ticket IDs come from the scope only (e.g. "EN-23b W1" -> EN-23b), never the description.
    const ids = (scopeMatch[2] || '').match(TICKET_RE) || [];
    for (const id of ids) shippedTickets.set(id, (shippedTickets.get(id) || 0) + 1);
  }
}

// A "ticket-scope" is a distinct shipped ticket ID. Used for the terseness heuristic.
const shippedTicketIds = [...shippedTickets.keys()].sort();

// --- Parse the TOP CHANGELOG entry -----------------------------------------------------------
//
// Extract the block from the first `## <version>` up to the next `## ` header, then pull the
// bullet lines (`- ...`) and the ticket tags contained in them.

function topEntryBlock(text) {
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+\d{4}\.\d{2}\.\d{2}\.\d+\s*$/.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

const blockLines = topEntryBlock(md);
const bullets = blockLines.filter((l) => /^\s*-\s+/.test(l));
const entryTickets = new Set();
for (const b of bullets) {
  const ids = b.match(TICKET_RE) || [];
  for (const id of ids) entryTickets.add(id);
}

// --- (1) Completeness: every shipped ticket must appear in the top entry --------------------
const missing = shippedTicketIds.filter((id) => !entryTickets.has(id));

// --- (2) Terseness heuristic: fewer bullets than distinct shipped ticket-scopes -------------
const tooCollapsed = bullets.length < shippedTicketIds.length;

// --- (3) Voice heuristic: technical tokens in bullet prose (excluding trailing ticket tag) --
// Strip a trailing `(TB-1)` / `(EN-23b)` style tag before scanning, so the tag itself never trips.
function proseOf(bullet) {
  return bullet
    .replace(/\s*\((?:[A-Z]+-\d+[a-z]?)(?:\s*\/\s*[A-Z]+-\d+[a-z]?)*\)\s*$/, '')
    .replace(/^\s*-\s+/, '');
}
const VOICE_PATTERNS = [
  { name: 'file extension', re: /\.(tsx?|jsx?|mjs|css|sh|sql|json|ya?ml)\b/ },
  { name: 'call syntax ()', re: /\b[A-Za-z_$][\w$]*\(\)/ },
  { name: 'config.path', re: /\bconfig\.[A-Za-z_$]/ },
  { name: 'import.meta', re: /import\.meta/ },
  { name: 'path segment', re: /(?:^|\s)(?:src|supabase)\/[\w./-]+/ },
  { name: 'backticked camelCase id', re: /`[a-z]+[A-Z][A-Za-z0-9]*`/ },
];
const voiceHits = [];
for (const b of bullets) {
  const prose = proseOf(b);
  const matched = VOICE_PATTERNS.filter((p) => p.re.test(prose)).map((p) => p.name);
  if (matched.length) voiceHits.push({ bullet: b.trim().slice(0, 140), patterns: matched });
}

// --- Report ---------------------------------------------------------------------------------
const label = ENFORCE ? 'ENFORCE' : 'WARN';
console.log(`check-changelog-completeness (${label}):`);
console.log(`  top entry:      ${topVersion ?? '<none>'}  (${bullets.length} bullet(s))`);
console.log(`  last released:  ${lastReleased ?? '<none>'}`);
console.log(`  commit range:   ${range}  [base: ${baseSource}]`);
console.log(`  shipped tickets:${shippedTicketIds.length ? ' ' + shippedTicketIds.join(', ') : ' (none)'}`);
console.log(`  entry tickets:  ${entryTickets.size ? [...entryTickets].sort().join(', ') : '(none)'}`);

let sawFinding = false;

if (missing.length) {
  sawFinding = true;
  console.log('');
  console.log(`  COMPLETENESS: ${missing.length} shipped ticket(s) missing from the top entry:`);
  for (const id of missing) console.log(`    - ${id} (referenced by ${shippedTickets.get(id)} shipped commit(s), no bullet)`);
} else if (shippedTicketIds.length) {
  console.log('');
  console.log('  COMPLETENESS: OK - every shipped ticket has a bullet.');
}

if (tooCollapsed) {
  sawFinding = true;
  console.log('');
  console.log(`  TERSENESS (WARN): ${bullets.length} bullet(s) for ${shippedTicketIds.length} shipped ticket-scope(s) -`);
  console.log('    entry may be too collapsed. The standard is ONE bullet per distinct user-visible change,');
  console.log('    NOT one per ticket (a ticket with N user-facing improvements should have N bullets).');
}

if (voiceHits.length) {
  sawFinding = true;
  console.log('');
  console.log(`  VOICE (WARN): ${voiceHits.length} bullet(s) contain technical token(s) - release notes are user-facing:`);
  for (const h of voiceHits) console.log(`    - [${h.patterns.join(', ')}] ${h.bullet}`);
}

if (!sawFinding) {
  console.log('');
  console.log(`  RESULT: COMPLETE - ${topVersion ?? 'top entry'} covers all shipped user-facing changes with no voice/terseness flags.`);
}

// MODE gate. WARN-only today: always exit 0 so a pending production deploy's preflight is not
// blocked. Under CHANGELOG_GATE_ENFORCE=1, a completeness failure (missing shipped ticket) is
// the ONLY exit-1 condition; terseness/voice remain advisory.
if (ENFORCE && missing.length) {
  console.error(`\nCHANGELOG_GATE_ENFORCE=1: ${missing.length} shipped ticket(s) missing from ${topVersion ?? 'top entry'} - failing.`);
  process.exit(1);
}
process.exit(0);
