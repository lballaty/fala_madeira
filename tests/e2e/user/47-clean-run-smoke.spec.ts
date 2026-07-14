// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/47-clean-run-smoke.spec.ts
// Description: @clean error-guard smoke. Walks the core authenticated journeys (Home, Learning +
//   lesson audio, Practice, Tutor, Profile) with a console/network error guard attached, then
//   asserts the app emitted NO console.error, NO uncaught page error, and NO app-origin HTTP
//   response >= 400. This is the guard that would have caught the gemini TTS 503 and the profiles
//   400s that reached production — the functional suite only asserts positive outcomes, never the
//   absence of errors. Tagged @clean so it can run in its own lane (like @a11y): a failure here is
//   a real runtime error to fix, not a functional regression.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-14

import { test, expect, landOnHome } from '../support/fixtures';
import { installErrorGuard } from '../support/consoleGuard';

test.describe('@clean error-guard smoke', () => {
  test('core journeys emit no console/page/network errors', async ({ page }) => {
    const guard = installErrorGuard(page);

    // Home
    await landOnHome(page);
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();

    // Learning — open a lesson and trigger TTS audio (the gemini edge-function path).
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
    const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
    if (await firstLesson.isVisible().catch(() => false)) {
      await firstLesson.click();
      await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
      const play = page.getByRole('button', { name: 'Play pronunciation' }).first();
      if (await play.isVisible().catch(() => false)) {
        await play.click();
        // Give the TTS request time to resolve so a 5xx/4xx is captured before we assert.
        await page.waitForTimeout(2500);
      }
      await page.getByRole('button', { name: 'Close' }).first().click().catch(() => {});
    }

    // Practice
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();

    // Tutor
    await page.getByRole('button', { name: 'Tutor' }).first().click();
    await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible();

    // Profile / settings
    await page.getByRole('button', { name: 'Profile' }).first().click();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();

    guard.assertClean('Home → Learning(+audio) → Practice → Tutor → Profile');
  });
});
