// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/01-app-shell.spec.ts
// Description: @smoke app-shell slice. Asserts: (1) the app boots with no console errors, the
//   authenticated shell renders (sidebar/tab nav) and lands on Home; (2) an UNauthenticated
//   context (storageState cleared) is gated to the AuthScreen. This is the boot-health gate
//   used by post-deploy smoke (docs/TEST-VERTICAL-SLICES.md §1 smoke subset).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';

test.describe('@smoke app-shell', () => {
  test('authenticated app boots on Home with no console errors and renders nav', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await landOnHome(page);

    // The five primary destinations render (desktop sidebar). Assert the tab labels exist.
    for (const label of ['Home', 'Learning', 'Practice', 'Tutor', 'Settings']) {
      await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
    }

    // No console errors on boot. Filter known-benign noise (favicon/network probes are not
    // app error paths); anything else is a real regression.
    const meaningful = consoleErrors.filter(
      (e) =>
        !/favicon/i.test(e) &&
        !/Failed to load resource/i.test(e) &&
        !/manifest/i.test(e),
    );
    expect(meaningful, `console errors on boot:\n${meaningful.join('\n')}`).toEqual([]);
  });

  test('unauthenticated context is gated to the AuthScreen', async ({ browser }) => {
    // Fresh context with NO stored session => App.tsx renders AuthScreen (!user).
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/');

    // AuthScreen welcome + the two primary CTAs prove the unauth gate.
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
    // And we are NOT on Home.
    await expect(page.getByRole('heading', { name: /Olá,/i })).toHaveCount(0);

    await context.close();
  });
});
