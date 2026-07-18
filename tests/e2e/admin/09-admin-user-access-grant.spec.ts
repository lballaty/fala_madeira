// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/09-admin-user-access-grant.spec.ts
// Description: EN-15 admin User Access control coverage + EN-26 partial-email search. As the real
//   admin, opens the Admin surface, switches to the User Access tab, finds the throwaway test user
//   by a PARTIAL email (local-part only — proves EN-26 substring search; a single match auto-selects
//   into the grant form), sets their subscription_tier to 'unlimited' through the confirm dialog, and
//   asserts the profiles row updated in the database (adminEvidence). Restores the original tier at
//   the end so the shared suite user is left untouched for later specs.
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

      // EN-26: find the user by a PARTIAL email (local-part only — no @domain) to prove substring
      // search. It uniquely matches the throwaway user, so the single match auto-selects into the form.
      const partial = testUser.email.split('@')[0];
      await adminPage.getByLabel('Find a user').fill(partial);
      await adminPage.getByRole('button', { name: 'Search users' }).click();

      // The resolved target card shows the user's full email (auto-selected single match).
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
