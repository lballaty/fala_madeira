// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/22-settings-support-validation.spec.ts
// Description: Non-destructive Support & Feedback coverage. Exercises blank-field validation,
//   modal close, and Send Logs confirmation cancel without writing backend rows.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings support validation', () => {
  test('Support modal validates blank fields, closes cleanly, and allows Send Logs cancel', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    await page.getByRole('button', { name: 'Support & Feedback' }).click();
    const supportDialog = page.getByRole('dialog', { name: 'Support & Feedback' });
    await expect(supportDialog).toBeVisible();

    await supportDialog.getByRole('button', { name: 'Submit Ticket' }).click();
    await expect(page.getByText('Subject cannot be empty.')).toBeVisible();

    await supportDialog.getByPlaceholder('e.g., Audio not playing').fill('Validation subject');
    await supportDialog.getByRole('button', { name: 'Submit Ticket' }).click();
    await expect(page.getByText('Description cannot be empty.')).toBeVisible();

    await supportDialog.getByRole('button', { name: 'Send Logs' }).click();
    await expect(page.getByRole('heading', { name: 'Collect Logs?' })).toBeVisible();
    await page.getByRole('button', { name: 'No, Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Collect Logs?' })).toHaveCount(0);
    await expect(supportDialog).toBeVisible();

    await supportDialog.getByRole('button', { name: 'Close' }).click();
    await expect(supportDialog).toHaveCount(0);
  });
});
