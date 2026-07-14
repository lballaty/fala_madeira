// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/33-pwa-service-worker-registration.spec.ts
// Description: PWA registration coverage that intentionally DOES NOT use the shared fixtures, so
//   the service worker is not unregistered by the onboarding init script. Verifies the browser
//   installs the generated SW and that a reload leaves the page under SW control.
// Author: Codex
// Created: 2026-07-13

import { test, expect } from '../support/fixtures';

test.describe('pwa service worker registration', () => {
  test('fresh unauthenticated browser context registers the service worker and is controlled after reload', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 'unsupported';
          const registration = await navigator.serviceWorker.getRegistration();
          const scriptUrl = registration?.active?.scriptURL ?? registration?.waiting?.scriptURL ?? registration?.installing?.scriptURL ?? null;
          return scriptUrl ?? null;
        });
      }, { timeout: 30_000, message: 'service worker never registered on first load' })
      .toContain('/sw.js');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(async () => {
        return page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
      }, { timeout: 30_000, message: 'reloaded page was not placed under service-worker control' })
      .toContain('/sw.js');

    await context.close();
  });
});
