// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/05-practice-browse-and-quiz.spec.ts
// Description: Practice-hub navigation coverage beyond the Pattern Builder slice. Verifies the
//   free situation browser expands a real situation and routes into a chosen mode, and that the
//   Lesson Quiz CTA surfaces the honest guidance message when no lesson is selected.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('practice browse and quiz entry', () => {
  test('Browse situations expands a real situation and routes into Culture mode', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();

    await page.getByRole('button', { name: 'Browse situations' }).click();
    await expect(page.getByRole('heading', { name: 'Situations' })).toBeVisible();
    await expect(page.getByText(/Any track, any level, any situation/i)).toBeVisible();

    const firstSituation = page.locator('button[aria-expanded]').first();
    await expect(firstSituation).toBeVisible({ timeout: 20_000 });
    await firstSituation.click();

    await expect(page.getByText('Practice this with…')).toBeVisible();
    await page.getByRole('button', { name: 'Culture', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Culture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Practice' }).first()).toBeVisible();
  });

  test('Lesson Quiz CTA gives guidance when no lesson is selected', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();

    await page.getByRole('button', { name: 'Lesson Quiz' }).click();
    await expect(page.getByText('Open a lesson in the Learning tab first, then quiz it here.')).toBeVisible();
  });
});
