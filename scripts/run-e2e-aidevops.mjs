// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/run-e2e-aidevops.mjs
// Description: Thin AIDevOps-facing wrapper around the canonical e2e runner. It normalizes suite
//   aliases to concrete Playwright invocations and preserves the summary artifacts expected by the
//   platform's Test Management surfaces.
// Author: Codex
// Created: 2026-07-11

import { spawn } from 'node:child_process';

function parseArgs(argv) {
  const opts = { suite: 'regression', passthrough: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--suite') opts.suite = argv[++i] ?? opts.suite;
    else opts.passthrough.push(arg);
  }
  return opts;
}

function buildRunnerArgs(opts) {
  if (opts.suite === 'smoke') {
    return ['scripts/run-e2e-regression.mjs', '--suite', 'smoke', '--grep', '@smoke', ...opts.passthrough];
  }
  return ['scripts/run-e2e-regression.mjs', '--suite', 'regression', ...opts.passthrough];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const args = buildRunnerArgs(opts);
  const proc = spawn('node', args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  const exitCode = await new Promise((resolveCode) => {
    proc.on('close', (code) => resolveCode(code ?? 1));
    proc.on('error', () => resolveCode(1));
  });
  process.exit(exitCode);
}

await main();
