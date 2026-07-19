// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/28-mobile-home-profile-smoke.spec.ts
// Description: Mobile viewport smoke coverage for the primary form factor. Renders the app at
//   iPhone-scale dimensions and asserts core bottom-bar navigation between Home, Tutor, and
//   Profile still reaches the expected screens.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('mobile viewport smoke', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('home, tutor, and profile remain reachable on mobile layout', async ({ page, coverage }) => {
    await landOnHome(page);
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();
    coverage.touch('nav.home', 'outcome-asserted');

    await page.getByRole('button', { name: 'Tutor' }).first().click();
    await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible();
    coverage.touch('nav.tutor', 'outcome-asserted');

    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    coverage.touch('nav.profile', 'outcome-asserted');

    await page.getByRole('button', { name: 'Home' }).first().click();
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();
    coverage.touch('nav.home', 'outcome-asserted');
  });
});
