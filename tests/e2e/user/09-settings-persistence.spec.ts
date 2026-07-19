// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/09-settings-persistence.spec.ts
// Description: User-settings persistence regression coverage. Verifies that changing playback
//   speed through the real Settings UI persists to the user's profile row. This directly covers
//   the A2 "writes may not persist" audit concern for a live user preference path.
// Author: Codex
// Created: 2026-07-11

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings persistence', () => {
  test('playback speed change persists to the profile row', async ({ page, userEvidence, testUser }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();

    const audioSpeedCard = page.locator('div').filter({ has: page.getByText('Audio Speed', { exact: true }) }).first();
    const slider = audioSpeedCard.locator('input[type="range"]');
    await expect(slider).toBeVisible();

    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    await expect(audioSpeedCard.getByText('1.3x')).toBeVisible();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('profiles')
            .select('playback_speed')
            .eq('id', testUser.userId)
            .single();
          return data?.playback_speed ? Number(data.playback_speed).toFixed(1) : null;
        },
        { timeout: 12_000, message: 'profiles.playback_speed did not persist after UI change' },
      )
      .toBe('1.3');
  });
});
