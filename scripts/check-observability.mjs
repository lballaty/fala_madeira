// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-observability.mjs
// Description: Static enforcement of the OBSERVABILITY-CONTRACT §9 forbidden patterns. Scans
//   src/**/*.{ts,tsx} and supabase/functions/**/*.ts for error paths that bypass the centralized
//   logger. Three checks:
//     (1) BARE-CONSOLE     — console.error/console.warn not paired with a logger call and not a
//                            dev echo (logger.ts is exempt; lines annotated `dev echo` exempt).
//     (2) TOAST-NO-LOG     — showToast(..., 'error') for a system error with no nearby logger.*
//                            call (validation-gate toasts are the expected false positives).
//     (3) HARDCODED-FALLBACK— `?? "http://…"` / `|| "http://…"` config fallbacks that mask
//                            misconfiguration.
//   Advisory by default (WARN mode, exit 0) so it can roll out without breaking the gate; pass
//   --strict to exit 1 when any violation is found. Writes artifacts/observability-report.json.
// Author: Observability plan (obs-ci-gate)
// Created: 2026-07-14

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');

function walk(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p, exts));
    else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

const files = [
  ...walk(resolve(root, 'src'), ['.ts', '.tsx']),
  ...walk(resolve(root, 'supabase/functions'), ['.ts']),
];

// logger.ts owns the sanctioned dev-echo console calls; the edge persistLog/log-sink use console
// as the documented sink-of-last-resort (they cannot recurse into themselves to log a failure).
const EXEMPT_FILES = [
  'src/lib/logger.ts',
  'supabase/functions/_shared/persistLog.ts',
  'supabase/functions/log-sink/index.ts',
];

const rel = (f) => f.replace(root + '/', '');
const near = (lines, i, radius, re) => {
  for (let j = Math.max(0, i - radius); j <= Math.min(lines.length - 1, i + radius); j++) {
    if (re.exec(lines[j])) return true;
  }
  return false;
};

const violations = { bareConsole: [], toastNoLog: [], hardcodedFallback: [] };
const loggerRe = /\blogger\.(critical|error|warn|info|debug)\b|\bpersistLog\b/;
const consoleRe = /\bconsole\.(error|warn)\s*\(/;
const toastErrorRe = /showToast\([^;]*,\s*['"]error['"]\s*\)/;
const fallbackUrlRe = /(\?\?|\|\|)\s*['"]https?:\/\//;

for (const f of files) {
  const relf = rel(f);
  const txt = readFileSync(f, 'utf8');
  const lines = txt.split('\n');
  const exempt = EXEMPT_FILES.includes(relf);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!exempt && consoleRe.test(line)) {
      const devEcho = /dev echo|import\.meta\.env\.DEV/.test(line) || near(lines, i, 2, /import\.meta\.env\.DEV/);
      const paired = near(lines, i, 4, loggerRe);
      if (!devEcho && !paired) violations.bareConsole.push({ file: relf, line: i + 1, text: line.trim().slice(0, 120) });
    }

    if (toastErrorRe.test(line)) {
      const paired = near(lines, i, 5, loggerRe);
      if (!paired) violations.toastNoLog.push({ file: relf, line: i + 1, text: line.trim().slice(0, 120) });
    }

    if (fallbackUrlRe.test(line)) {
      violations.hardcodedFallback.push({ file: relf, line: i + 1, text: line.trim().slice(0, 120) });
    }
  }
}

const total =
  violations.bareConsole.length + violations.toastNoLog.length + violations.hardcodedFallback.length;

// EN-27: --strict hard-fails ONLY on the unambiguous forbidden patterns (bare console in an error
// path, hardcoded config fallbacks). TOAST-NO-LOG stays advisory even in strict mode — validation-
// gate toasts (input too long, empty field) legitimately need no server log and are the documented
// expected false positives, so gating on them would make --strict permanently red. They remain
// reported (and can be hardened case-by-case), just not gate-blocking.
const strictTotal = violations.bareConsole.length + violations.hardcodedFallback.length;

const outDir = resolve(root, 'artifacts');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, 'observability-report.json'),
  JSON.stringify({ generated_for: 'OBSERVABILITY-CONTRACT §9 static check', scanned_files: files.length, total, violations }, null, 2),
);

const label = strict ? 'STRICT' : 'WARN';
console.log(`Observability check (${label}): scanned ${files.length} files.`);
const report = (title, list, note) => {
  console.log(`\n${title} (${list.length})${note ? ` — ${note}` : ''}:`);
  for (const v of list.slice(0, 40)) console.log(`  - ${v.file}:${v.line}  ${v.text}`);
  if (list.length > 40) console.log(`  … +${list.length - 40} more (see artifacts/observability-report.json)`);
};
report('BARE-CONSOLE (error path console.* not paired with logger)', violations.bareConsole);
report('TOAST-NO-LOG (showToast error without nearby logger)', violations.toastNoLog, 'advisory even in --strict — validation-gate toasts are expected false positives');
report('HARDCODED-FALLBACK (?? / || "http…")', violations.hardcodedFallback);
console.log('\nReport: artifacts/observability-report.json');

if (strict && strictTotal > 0) {
  console.error(`\n--strict: ${strictTotal} gate-blocking observability violation(s) (bare-console + hardcoded-fallback) — failing. (${violations.toastNoLog.length} toast-no-log are advisory.)`);
  process.exit(1);
}
// WARN mode (and toast-no-log in strict mode): advisory only, exit 0.
