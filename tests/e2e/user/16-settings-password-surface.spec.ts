// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/16-settings-password-surface.spec.ts
// Description: Non-destructive Change Password coverage from Settings. Opens the password-update
//   auth surface for an already signed-in user and verifies cancel returns to the Settings shell
//   without mutating the session.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings change-password surface', () => {
  test('Change Password opens the update-password auth surface and Cancel returns to Settings', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByRole('button', { name: 'Change Password' }).click();

    await expect(page.getByRole('heading', { name: 'New Password' })).toBeVisible();
    await expect(page.getByPlaceholder('New Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Password' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Olá,/i })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign Out' })).toBeVisible();
  });
});
