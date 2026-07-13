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
    await page.getByRole('button', { name: 'Profile' }).first().click();

    const slider = page.locator('input[type="range"]').first();
    await expect(slider).toBeVisible();

    const target = '1.3';
    await slider.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, target);

    await expect(page.getByText('1.3x')).toBeVisible();

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
