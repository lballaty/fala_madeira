// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/09-admin-user-access-grant.spec.ts
// Description: EN-15 admin User Access control coverage. As the real admin, opens the Admin
//   surface, switches to the User Access tab, looks up the throwaway test user by email, sets
//   their subscription_tier to 'unlimited' through the confirm dialog, and asserts the profiles
//   row updated in the database (adminEvidence). Restores the original tier at the end so the
//   shared suite user is left untouched for later specs.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('admin user access grant (EN-15)', () => {
  test('admin grants unlimited tier to a user by email; profiles row updates', async ({
    adminPage,
    adminEvidence,
    testUser,
  }) => {
    // Capture the user's original tier so we can restore it in finally.
    const { data: before } = await adminEvidence
      .from('profiles')
      .select('subscription_tier')
      .eq('id', testUser.userId)
      .maybeSingle();
    const originalTier = (before?.subscription_tier as string | null) ?? 'free';

    try {
      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

      // Switch to the EN-15 User Access tab.
      await adminPage.getByRole('button', { name: /User Access/i }).click();
      await expect(adminPage.getByRole('heading', { name: /Grant content access/i })).toBeVisible();

      // Look up the throwaway test user by email.
      await adminPage.getByLabel('User email').fill(testUser.email);
      await adminPage.getByRole('button', { name: 'Look up user' }).click();

      // The resolved target card shows the user's email.
      await expect(adminPage.getByText(testUser.email, { exact: false })).toBeVisible();

      // Set tier to unlimited and submit → confirm dialog.
      await adminPage.getByLabel('Subscription tier').selectOption('unlimited');
      await adminPage.getByRole('button', { name: 'Update access' }).click();

      // Confirm dialog action.
      await adminPage.getByRole('button', { name: 'Update access' }).last().click();

      // Assert the profiles row now reads unlimited (DB source of truth).
      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('profiles')
              .select('subscription_tier')
              .eq('id', testUser.userId)
              .maybeSingle();
            return (data?.subscription_tier as string | null) ?? null;
          },
          { timeout: 12_000, message: 'profiles.subscription_tier did not update to unlimited after admin grant' },
        )
        .toBe('unlimited');
    } finally {
      // Restore the original tier so later specs see the user unchanged.
      await adminEvidence
        .from('profiles')
        .update({ subscription_tier: originalTier })
        .eq('id', testUser.userId);
    }
  });
});
