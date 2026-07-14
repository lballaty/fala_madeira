// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/consoleGuard.ts
// Description: Console + network error guard for E2E. Attaches to a Playwright Page and records
//   console.error messages, uncaught page errors, and HTTP responses >= 400. assertClean() then
//   fails the test if any app-origin/Supabase error was seen. This closes the "green but broken"
//   gap that let profiles 400s and the gemini 503 reach production: the functional suite asserts
//   positive outcomes but never the ABSENCE of errors. External tracking/ad noise (doubleclick,
//   youtube, analytics — blocked by the browser, not our bug) is allowlisted by default.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-14

import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export interface ErrorGuardOptions {
  /** Console.error texts matching any of these are ignored. */
  ignoreConsole?: RegExp[];
  /** Response URLs matching any of these are ignored (external, not our backend). */
  ignoreUrls?: RegExp[];
}

const DEFAULT_IGNORE_URLS: RegExp[] = [
  /doubleclick\.net/i,
  /googleads\.g\.doubleclick/i,
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /\byoutube\.com\//i,
  /\byoutube-nocookie\.com\//i,
  /\bytimg\.com\//i,
  /fonts\.g(oogle)?(static|apis)?\.com/i,
];

// Console noise that is not an app error (browser tracking-prevention notices, PWA install hints).
const DEFAULT_IGNORE_CONSOLE: RegExp[] = [
  /Tracking Prevention blocked/i,
  /beforeinstallprompt/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /Download the React DevTools/i,
];

export interface ErrorGuard {
  consoleErrors: string[];
  pageErrors: string[];
  badResponses: string[];
  /** Throw (fail the test) if any app-origin error was captured. */
  assertClean: (context?: string) => void;
}

export function installErrorGuard(page: Page, opts: ErrorGuardOptions = {}): ErrorGuard {
  const ignoreConsole = [...DEFAULT_IGNORE_CONSOLE, ...(opts.ignoreConsole ?? [])];
  const ignoreUrls = [...DEFAULT_IGNORE_URLS, ...(opts.ignoreUrls ?? [])];

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (ignoreConsole.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (ignoreUrls.some((re) => re.test(url))) return;
    badResponses.push(`${status} ${res.request().method()} ${url}`);
  });

  return {
    consoleErrors,
    pageErrors,
    badResponses,
    assertClean(context = '') {
      const lines = [
        ...pageErrors.map((e) => `  [pageerror] ${e}`),
        ...consoleErrors.map((e) => `  [console.error] ${e}`),
        ...badResponses.map((r) => `  [http>=400] ${r}`),
      ];
      const label = context ? ` after "${context}"` : '';
      expect(lines, `App emitted ${lines.length} error(s)${label}:\n${lines.join('\n')}`).toEqual([]);
    },
  };
}
