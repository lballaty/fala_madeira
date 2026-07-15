// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/23-account-delete-cancel.spec.ts
// Description: Non-destructive account-delete coverage. Verifies the confirmation modal can be
//   opened and canceled without logging the user out or destroying the active session.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('account deletion cancel path', () => {
  test('Delete Account & Data can be canceled with the session preserved', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    const deleteControl = page.getByRole('button', { name: 'Delete Account & Data' });
    await deleteControl.scrollIntoViewIfNeeded();
    await deleteControl.click();

    await expect(page.getByRole('heading', { name: 'Delete Account?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep My Account' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep My Account' }).click();

    await expect(page.getByRole('heading', { name: 'Delete Account?' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign Out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toHaveCount(0);
  });
});
