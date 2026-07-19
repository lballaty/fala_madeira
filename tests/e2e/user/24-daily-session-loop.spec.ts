// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/24-daily-session-loop.spec.ts
// Description: Adaptive-guided Daily Session shell coverage. Switches the learner onto the
//   adaptive-guided path, starts the daily session from Home, advances via Skip through every
//   segment, and asserts the recap and return-to-home path.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';
import { readKvByPrefix } from '../support/storage';

test.describe('daily session loop', () => {
  test('adaptive-guided path opens the daily session and reaches recap', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();

    const learningPathCard = page
      .locator('div')
      .filter({ has: page.getByText('Learning Path', { exact: true }) })
      .first();
    await learningPathCard.getByRole('button', { name: 'Adaptive guided' }).click();
    coverage.touch('settings.path.adaptive_guided', 'outcome-asserted');
    await expect
      .poll(async () => {
        const value = await readKvByPrefix(page, 'paths:selection:');
        return value && typeof value === 'object' && 'type' in value ? value.type : null;
      })
      .toBe('adaptive-guided');

    await page.getByRole('button', { name: 'Home' }).first().click();
    const startSessionButton = page.getByRole('button', { name: "Start today's session" }).first();
    const homeSessionSection = startSessionButton.locator('xpath=ancestor::section[1]');
    await expect(homeSessionSection.getByRole('heading', { name: "Today's Session", exact: true })).toBeVisible();
    await startSessionButton.click();
    coverage.touch('home.daily_session.start', 'outcome-asserted');

    const activeSkipButton = page.getByRole('button', { name: 'Skip' });
    await expect(activeSkipButton).toBeVisible();
    await expect(page.getByText(/Segment 1 of \d+/i)).toBeVisible();
    coverage.touch('session.segment.skip', 'rendered');

    for (let step = 0; step < 6; step += 1) {
      if (!(await activeSkipButton.isVisible().catch(() => false))) {
        break;
      }
      await activeSkipButton.click();
    }
    coverage.touch('session.segment.skip', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'Session done' })).toBeVisible({ timeout: 15_000 });
    // Assert the recap's unique segment-summary copy rather than the "Nicely done" label:
    // a skipped-through session grades nothing, so the DailySessionView recap card AND the
    // SessionRecap honest-empty-state BOTH render an identical "Nicely done" header (2 matches).
    // The segment-count line is unique and also proves the recap carries real session data.
    await expect(page.getByText(/You worked through \d+ of \d+ segments today/i)).toBeVisible();
    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();
    coverage.touch('session.recap.back_home', 'outcome-asserted');
  });
});
