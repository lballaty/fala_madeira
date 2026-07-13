// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/11-settings-static-surfaces.spec.ts
// Description: Non-destructive settings surface coverage. Exercises the user manual, tutorial,
//   and legal-document modal flows and asserts their real content renders and navigates.
// Author: Codex
// Created: 2026-07-12

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings static surfaces', () => {
  test('User Manual, App Tutorial, and legal documents open and navigate', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    await page.getByRole('button', { name: 'User Manual' }).click();
    await expect(page.getByRole('heading', { name: 'User Manual' })).toBeVisible();
    await expect(page.getByText('Voice Practice Limits')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'User Manual' })).toHaveCount(0);

    await page.getByRole('button', { name: 'App Tutorial' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.getByRole('button', { name: 'Go Back' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('button', { name: 'Start Learning' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Learning' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByRole('button', { name: 'Terms of Service' }).click();
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText(/Version/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Privacy Policy' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'AI Disclosure' }).click();
    await expect(page.getByRole('heading', { name: 'AI Disclosure' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
  });
});
