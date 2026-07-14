// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/01-home-navigation.spec.ts
// Description: Home-surface navigation coverage. Exercises the Home header settings shortcut,
//   the unlock-level modal, and the Continue Learning card's jump into the Learning tab with a
//   real lesson detail modal open.
// Author: Codex
// Created: 2026-07-12

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('home navigation surfaces', () => {
  test('Home opens settings, unlock modal, and Continue Learning routes into a lesson detail', async ({ page, coverage }) => {
    await landOnHome(page);

    await page.getByRole('button', { name: 'Unlock Next Level' }).click();
    await expect(page.getByRole('heading', { name: 'Unlock Level' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter Key...')).toBeVisible();
    coverage.touch('home.unlock.open', 'outcome-asserted');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Unlock Level' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    coverage.touch('home.settings.open', 'outcome-asserted');

    await page.getByRole('button', { name: 'Home' }).first().click();
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();

    await page.getByRole('button', { name: 'See All' }).click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
    coverage.touch('home.continue_learning.see_all', 'outcome-asserted');

    await page.getByRole('button', { name: 'Home' }).first().click();
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();

    const continueLearningSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Continue Learning' }),
    });
    await continueLearningSection.getByRole('button', { name: /Month \d+/ }).click();
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
    await expect(page.getByText('Common Patterns').or(page.getByText('Vocabulary')).first()).toBeVisible();
    coverage.touch('home.continue_learning.card', 'outcome-asserted');
  });
});
