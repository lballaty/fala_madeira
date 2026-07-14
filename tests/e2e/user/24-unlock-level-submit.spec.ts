// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/24-unlock-level-submit.spec.ts
// Description: Unlock-level submission coverage. Reads the live unlock key via the admin
//   evidence client, submits it through the real Home modal, and asserts both the UI success
//   path and the persisted `profiles.unlocked_level` write for the throwaway user.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('unlock level submission', () => {
  test('submitting the current unlock key increments unlocked_level and closes the modal', async ({
    page,
    userEvidence,
    adminEvidence,
    testUser,
  }) => {
    const { data: beforeProfile, error: beforeProfileError } = await userEvidence
      .from('profiles')
      .select('unlocked_level')
      .eq('id', testUser.userId)
      .single();
    if (beforeProfileError) throw beforeProfileError;

    const originalLevel = beforeProfile?.unlocked_level ?? 1;
    const resetLevel = Math.max(1, originalLevel);
    const { error: resetError } = await userEvidence
      .from('profiles')
      .update({ unlocked_level: 1 })
      .eq('id', testUser.userId);
    if (resetError) throw resetError;

    try {
      const { data: keySetting, error: keyError } = await adminEvidence
        .from('global_settings')
        .select('value')
        .eq('key', 'level_unlock_key')
        .single();
      if (keyError) throw keyError;
      const unlockKey = String(keySetting?.value ?? '').trim();
      if (!unlockKey) {
        throw new Error('global_settings.level_unlock_key is empty; unlock submission cannot be exercised');
      }

      await landOnHome(page);
      await page.getByRole('button', { name: 'Unlock Next Level' }).click();
      await expect(page.getByRole('heading', { name: 'Unlock Level' })).toBeVisible();

      await page.getByPlaceholder('Enter Key...').fill(unlockKey);
      await page.getByRole('button', { name: 'Unlock Level' }).click();

      await expect(page.getByText('Level 2 unlocked!')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Unlock Level' })).toHaveCount(0);
      await expect
        .poll(
          async () => {
            const { data } = await userEvidence
              .from('profiles')
              .select('unlocked_level')
              .eq('id', testUser.userId)
              .single();
            return data?.unlocked_level ?? null;
          },
          { timeout: 12_000, message: 'profiles.unlocked_level did not increment after unlock-key submit' },
        )
        .toBe(2);
    } finally {
      await userEvidence.from('profiles').update({ unlocked_level: resetLevel }).eq('id', testUser.userId);
    }
  });
});
