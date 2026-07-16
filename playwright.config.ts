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
  // Deletes the run's throwaway test user (via the delete-account edge fn) so accounts don't
  // accumulate in the live project. Best-effort; never fails the suite (see global-teardown.ts).
  globalTeardown: './tests/e2e/global-teardown.ts',

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
      // @mobile and @clean specs run only under their own projects below, so the functional
      // desktop lane stays green independent of those design/runtime-track lanes.
      grepInvert: /@mobile|@clean/,
    },
    {
      // CG-17: exercise the mobile bottom-bar layout (the product's primary form factor).
      // Chromium engine at iPhone-scale width (< Tailwind md) so the bottom bar renders and
      // the sidebar hides. Scoped via grep to @mobile-tagged specs to keep runtime bounded.
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
      grep: /@mobile/,
    },
    {
      // Error-guard lane: @clean specs assert the app emits no console/page/network errors
      // during core journeys. Kept in its own lane so a real runtime error (e.g. the gemini
      // 503) fails here without conflating with functional pass/fail — same pattern as @mobile.
      name: 'clean',
      use: { ...devices['Desktop Chrome'] },
      grep: /@clean/,
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
