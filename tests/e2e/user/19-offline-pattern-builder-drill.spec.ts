// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/19-offline-pattern-builder-drill.spec.ts
// Description: Offline-capable Pattern Builder regression coverage. Warms the content while
//   online, disconnects, then proves Pattern Builder can still enter a drill and accept a
//   real self-grade interaction offline.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('offline pattern builder drill', () => {
  test('Pattern Builder still supports a real drill interaction after going offline', async ({ page, context }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    const backButton = page.locator('button', { has: page.locator('svg.lucide-chevron-left') }).first();

    await page.getByText('Pattern Builder', { exact: true }).click();
    await expect(page.getByText(/Pick a situation to drill/i)).toBeVisible({ timeout: 20_000 });
    await backButton.click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    await context.setOffline(true);

    await page.getByText('Pattern Builder', { exact: true }).click();
    await expect(page.getByText(/Pick a situation to drill/i)).toBeVisible({ timeout: 20_000 });

    const firstChoice = page.locator('button').filter({ hasText: /^L\d/ }).first();
    await expect(firstChoice).toBeVisible();
    await firstChoice.click();

    const reveal = page.getByRole('button', { name: /Reveal the Portuguese/i });
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
    }

    for (let step = 0; step < 3; step += 1) {
      const maybeReveal = page.getByRole('button', { name: /Reveal the Portuguese/i });
      if (await maybeReveal.isVisible().catch(() => false)) {
        await maybeReveal.click();
      }

      const gradeButton = page.getByRole('button', { name: /^(Got it|Almost|Missed)$/ }).first();
      if (!(await gradeButton.isVisible().catch(() => false))) {
        break;
      }
      await gradeButton.click();

      const completeHeading = page.getByRole('heading', { name: 'Drill complete' });
      if (await completeHeading.isVisible().catch(() => false)) {
        break;
      }
    }

    await expect(
      page.getByRole('heading', { name: 'Drill complete' }).or(page.getByRole('button', { name: /Reveal the Portuguese/i })),
    ).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
  });
});
