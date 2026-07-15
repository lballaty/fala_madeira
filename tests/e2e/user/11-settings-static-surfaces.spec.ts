// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/11-settings-static-surfaces.spec.ts
// Description: Non-destructive settings surface coverage. Exercises the user manual, tutorial,
//   and legal-document modal flows and asserts their real content renders and navigates.
// Author: Codex
// Created: 2026-07-12

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings static surfaces', () => {
  test('User Manual, App Tutorial, and legal documents open and navigate', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    await page.getByRole('button', { name: 'User Manual' }).click();
    await expect(page.getByRole('heading', { name: 'User Manual' })).toBeVisible();
    // EN-17a: the manual is now rendered from the App Capability Registry. Assert a registry-driven
    // capability + the access/limits section (replaces the old hand-written "Voice Practice Limits").
    await expect(page.getByTestId('manual-cap-situation-simulator')).toBeVisible();
    await expect(page.getByText('Access & voice limits')).toBeVisible();
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
    const termsDialog = page.getByRole('dialog', { name: 'Terms of Service' });
    await expect(termsDialog).toBeVisible();
    await expect(termsDialog.getByText(/Version \d/)).toBeVisible();
    await termsDialog.getByRole('button', { name: 'Close' }).click();
    coverage.touch('settings.legal.terms', 'outcome-asserted');

    await page.getByRole('button', { name: 'Privacy Policy' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    coverage.touch('settings.legal.privacy', 'outcome-asserted');

    await page.getByRole('button', { name: 'AI Disclosure' }).click();
    await expect(page.getByRole('heading', { name: 'AI Disclosure' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    coverage.touch('settings.legal.ai_disclosure', 'outcome-asserted');
  });
});
