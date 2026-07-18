// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/12-admin-single-entry.spec.ts
// Description: EN-25 consolidated-admin coverage. Proves the single sidebar "Admin" nav link is the
//   one entry point that reaches every admin function as a tab (Review Queues / Content Studio /
//   User Access / Config), and exercises the NEW per-user voice_limit control on the User Access
//   tab — sets profiles.voice_limit for the throwaway test user and asserts it persisted to the DB
//   (adminEvidence source of truth), then restores the original value. The global voice-limit
//   (Config tab) and the removed admin-mode toggle are covered by 01/02; this spec owns the
//   per-user voice_limit path (EN-11, delivered inside EN-25).
// Author: Claude (with owner)
// Created: 2026-07-16

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('admin single entry + per-user voice limit (EN-25/EN-11)', () => {
  test('one Admin nav opens all four tabs; User Access sets a per-user voice_limit that persists', async ({
    adminPage,
    adminEvidence,
    testUser,
  }) => {
    // Capture the original tier + voice_limit so we can restore both (grantAccess writes tier too).
    const { data: before } = await adminEvidence
      .from('profiles')
      .select('subscription_tier, voice_limit')
      .eq('id', testUser.userId)
      .maybeSingle();
    const originalTier = (before?.subscription_tier as string | null) ?? 'free';
    const originalVoiceLimit = (before?.voice_limit as number | null) ?? null;

    try {
      await landOnHome(adminPage);

      // Single entry: the sidebar "Admin" link opens the consolidated overlay with all four tabs.
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Content Studio/i })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /User Access/i })).toBeVisible();
      await expect(adminPage.getByTestId('admin-tab-config')).toBeVisible();

      // User Access tab → look up the throwaway test user.
      await adminPage.getByRole('button', { name: /User Access/i }).click();
      await expect(adminPage.getByRole('heading', { name: /Grant content access/i })).toBeVisible();
      await adminPage.getByLabel('Find a user').fill(testUser.email);
      await adminPage.getByRole('button', { name: 'Search users' }).click();
      await expect(adminPage.getByText(testUser.email, { exact: false })).toBeVisible();

      // Keep the tier unchanged (select the current one) and set a per-user voice limit.
      await adminPage.getByLabel('Subscription tier').selectOption(originalTier);
      await adminPage.getByTestId('user-access-voice-limit').fill('4242');
      await adminPage.getByRole('button', { name: 'Update access' }).click();
      // Confirm dialog action.
      await adminPage.getByRole('button', { name: 'Update access' }).last().click();

      // DB is the source of truth: profiles.voice_limit persisted per-user.
      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('profiles')
              .select('voice_limit')
              .eq('id', testUser.userId)
              .maybeSingle();
            return (data?.voice_limit as number | null) ?? null;
          },
          { timeout: 12_000, message: 'profiles.voice_limit did not persist after the per-user grant' },
        )
        .toBe(4242);
    } finally {
      // Restore the original tier + voice_limit so later specs see the user unchanged.
      await adminEvidence
        .from('profiles')
        .update({ subscription_tier: originalTier, voice_limit: originalVoiceLimit })
        .eq('id', testUser.userId);
    }
  });
});
