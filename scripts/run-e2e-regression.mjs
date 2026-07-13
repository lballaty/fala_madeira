// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/run-e2e-regression.mjs
// Description: Canonical local runner for the live Playwright regression suite. Spawns the repo's
//   Playwright suite, captures a JSON report, and writes a compact machine-readable summary under
//   artifacts/e2e so AIDevOps or other tooling can consume stable outputs.
// Author: Codex
// Created: 2026-07-11

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const REPO_ROOT = process.cwd();
const ARTIFACT_DIR = resolve(REPO_ROOT, 'artifacts/e2e');
const REPORT_JSON = resolve(ARTIFACT_DIR, 'results.json');
const SUMMARY_JSON = resolve(ARTIFACT_DIR, 'summary.json');
const FAILURES_JSON = resolve(ARTIFACT_DIR, 'failures.json');

function parseArgs(argv) {
  const opts = {
    grep: null,
    spec: null,
    headed: false,
    workers: null,
    suite: 'regression',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--grep') opts.grep = argv[++i] ?? null;
    else if (arg === '--spec') opts.spec = argv[++i] ?? null;
    else if (arg === '--workers') opts.workers = argv[++i] ?? null;
    else if (arg === '--headed') opts.headed = true;
    else if (arg === '--suite') opts.suite = argv[++i] ?? opts.suite;
  }
  return opts;
}

function buildArgs(opts) {
  const args = ['playwright', 'test', '--reporter=json'];
  if (opts.headed) args.push('--headed');
  if (opts.workers) args.push('--workers', String(opts.workers));
  if (opts.grep) args.push('--grep', opts.grep);
  if (opts.spec) args.push(opts.spec);
  return args;
}

function extractResults(report) {
  const tests = [];
  function walkSuite(suite, parentTitles = []) {
    const nextTitles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const result = test.results?.[0] ?? {};
        const title = [...nextTitles, spec.title, test.title].filter(Boolean).join(' > ');
        const status = test.status === 'expected'
          ? 'passed'
          : test.status === 'skipped'
            ? 'skipped'
            : 'failed';
        tests.push({
          title,
          status,
          duration_ms: result.duration ?? null,
          message: result.error?.message ?? null,
        });
      }
    }
    for (const child of suite.suites ?? []) walkSuite(child, nextTitles);
  }
  for (const suite of report.suites ?? []) walkSuite(suite);
  return tests;
}

function summarize(report, tests, command, startedAt, finishedAt, exitCode, suite) {
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  return {
    suite,
    command,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: report?.stats?.duration ?? null,
    exit_code: exitCode,
    total: tests.length,
    passed,
    failed,
    skipped,
    status: exitCode === 0 ? 'passed' : 'failed',
    report_json: REPORT_JSON,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const args = buildArgs(opts);
  const startedAt = new Date().toISOString();
  const proc = spawn('npx', args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_FILE: REPORT_JSON,
    },
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolveCode) => {
    proc.on('close', (code) => resolveCode(code ?? 1));
    proc.on('error', () => resolveCode(1));
  });
  const finishedAt = new Date().toISOString();

  const report = existsSync(REPORT_JSON) ? JSON.parse(readFileSync(REPORT_JSON, 'utf8')) : null;
  const tests = extractResults(report ?? {});
  const failures = tests.filter((t) => t.status === 'failed');
  const summary = summarize(report, tests, `npx ${args.join(' ')}`, startedAt, finishedAt, exitCode, opts.suite);

  writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  writeFileSync(FAILURES_JSON, JSON.stringify(failures, null, 2));

  if (exitCode !== 0) process.exit(exitCode);
}

await main();
