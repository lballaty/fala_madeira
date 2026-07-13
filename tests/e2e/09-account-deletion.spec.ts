// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/09-account-deletion.spec.ts
// Description: S7 account-deletion slice. Because the suite now runs on a throwaway fake-email
//   user, this spec can execute the REAL destructive flow at the end of the serial run: open the
//   destructive control, confirm deletion, assert the app returns to AuthScreen, then assert a
//   fresh sign-in with the deleted credentials fails.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome, captureEdgeRequestId } from './support/fixtures';

test.describe('account deletion (S7)', () => {
  test('throwaway test user can delete the account and can no longer sign in', async ({
    page,
    browser,
    testUser,
  }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    // The destructive control is present in Settings.
    const deleteControl = page.getByRole('button', { name: 'Delete Account & Data' });
    await deleteControl.scrollIntoViewIfNeeded();
    await expect(deleteControl).toBeVisible();

    // Opening it raises the confirmation modal with the destructive copy.
    await deleteControl.click();
    await expect(page.getByRole('heading', { name: 'Delete Account?' })).toBeVisible();
    await expect(
      page.getByText(/delete your account and all associated data/i),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Everything' })).toBeVisible();

    const requestIdPromise = captureEdgeRequestId(page, 'delete-account', 30_000);
    await page.getByRole('button', { name: 'Delete Everything' }).click();

    const requestId = await requestIdPromise;
    expect(requestId, 'delete-account did not echo a requestId').toBeTruthy();

    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Olá,/i })).toHaveCount(0);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const loginPage = await context.newPage();
    await loginPage.goto('/');
    await loginPage.getByRole('button', { name: 'Log In' }).click();
    await loginPage.getByPlaceholder('Email').fill(testUser.email);
    await loginPage.getByPlaceholder('Password', { exact: true }).fill(testUser.password);
    await loginPage.getByRole('button', { name: 'Log In' }).click();

    await expect(loginPage.getByPlaceholder('Email')).toBeVisible({ timeout: 15_000 });
    await expect(loginPage.getByRole('heading', { name: /Olá,/i })).toHaveCount(0);
    await context.close();
  });
});
