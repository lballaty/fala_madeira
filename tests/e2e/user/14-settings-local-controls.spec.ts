// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/14-settings-local-controls.spec.ts
// Description: Deterministic settings controls backed by local document state or local storage.
// Covers appearance theme switching, learning-path selection persistence to the local mirror, and
// offline-audio toggle/cache actions without depending on external services.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';
import { readKvByPrefix } from '../support/storage';

test.describe('settings local controls', () => {
  test('theme, path type, and offline-audio controls respond and persist locally', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();

    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe('dark');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('fm_theme')))
      .toBe('dark');
    coverage.touch('settings.theme.dark', 'outcome-asserted');

    const learningPathCard = page
      .locator('div')
      .filter({ has: page.getByText('Learning Path', { exact: true }) })
      .first();
    await learningPathCard.getByRole('button', { name: 'Goal track' }).click();
    await expect(page.getByText('active').first()).toBeVisible();
    await expect
      .poll(async () => {
        const value = await readKvByPrefix(page, 'paths:selection:');
        return value && typeof value === 'object' && 'type' in value ? value.type : null;
      })
      .toBe('goal-track');
    coverage.touch('settings.path.goal_track', 'outcome-asserted');

    const saveAudioSwitch = page.getByRole('switch', { name: 'Save audio on device' });
    await expect(saveAudioSwitch).toHaveAttribute('aria-checked', 'true');
    await saveAudioSwitch.click();
    await expect(saveAudioSwitch).toHaveAttribute('aria-checked', 'false');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('offline_save_audio')))
      .toBe('false');
    coverage.touch('settings.offline.save_audio_switch', 'outcome-asserted');

    await page.getByRole('button', { name: 'Clear cache' }).click();
    await expect(page.getByText('Offline audio cleared')).toBeVisible();
    coverage.touch('settings.offline.clear_cache', 'outcome-asserted');
  });
});
