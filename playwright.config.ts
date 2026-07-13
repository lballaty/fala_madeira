// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/playwright.config.ts
// Description: Playwright config for the FalaMadeira vertical-slice UI e2e suite (plan step
//   `vertical-slice-e2e`, docs/TEST-VERTICAL-SLICES.md). Drives the real UI against a local
//   `vite preview` of dist/ and the LIVE Supabase project (gxlrmdfqcqimwwplrdgd). A
//   global-setup creates two reusable sessions: the real admin account and a throwaway
//   fake-email test user. The default storageState is the throwaway user; admin specs create
//   their own admin context via fixtures. Per-spec init scripts seed the IndexedDB onboarding
//   record so either role lands on Home (onboarding lives in IndexedDB, not storageState).
//   chromium-only for speed; trace on first retry; `@smoke` grep support via `--grep @smoke`.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  // Ignore scratch spec files (ad-hoc debugging), never part of the gate.
  testIgnore: ['**/_*.spec.ts', '**/zz*.spec.ts'],
  // Live backend + a single preview server => run serially to keep backend evidence
  // deterministic and avoid cross-test row contention on the shared throwaway account.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  timeout: 60_000,
  expect: { timeout: 15_000 },

  globalSetup: './tests/e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    storageState: 'tests/e2e/.auth/test-user.json',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Deterministic viewport (desktop => the sidebar nav renders; mobile bottom bar hidden).
    viewport: { width: 1280, height: 900 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Build dist/ then serve it with `vite preview`. Reuse an already-running server locally.
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
