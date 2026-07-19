// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/60-settings-audio-storage-controls.spec.ts
// Description: Coverage-backlog spec (2026-07-16 audit) for Settings offline-audio controls that
//   had no e2e coverage: the "Storage limit" cache-size selector and the "Download for offline"
//   track selector. Both are disabled until "Save audio on device" is switched on, so the spec
//   flips the switch, drives both selects, and restores the switch afterwards. The actual
//   download action is deliberately NOT triggered (it pre-generates multi-voice TTS audio against
//   the live provider — expensive and quota-bound); the download button stays out of scope here.
// Author: Coverage audit (with assistant)
// Created: 2026-07-16

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings offline-audio storage controls', () => {
  test('Storage limit and Download-for-offline selects enable with the save-audio switch and accept values', async ({
    page,
    coverage,
  }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    const saveSwitch = page.getByRole('switch', { name: 'Save audio on device' });
    await saveSwitch.scrollIntoViewIfNeeded();
    await expect(saveSwitch).toBeVisible();
    const initiallyOn = (await saveSwitch.getAttribute('aria-checked')) === 'true';

    const storageLimit = page.getByLabel('Storage limit');
    const downloadSelect = page.getByLabel('Download for offline');

    try {
      if (!initiallyOn) {
        // Both selects are disabled while saving is off — assert the gate, then open it.
        await expect(storageLimit).toBeDisabled();
        await expect(downloadSelect).toBeDisabled();
        await saveSwitch.click();
        await expect(saveSwitch).toHaveAttribute('aria-checked', 'true');
      }

      await expect(storageLimit).toBeEnabled();
      const originalLimit = await storageLimit.inputValue();
      const options = await storageLimit.locator('option').all();
      expect(options.length).toBeGreaterThan(1);
      const otherValue = (await Promise.all(options.map((o) => o.getAttribute('value')))).find(
        (v) => v && v !== originalLimit,
      );
      expect(otherValue).toBeTruthy();
      await storageLimit.selectOption(otherValue as string);
      await expect(storageLimit).toHaveValue(otherValue as string);
      coverage.touch('settings.offline.storage_limit', 'value-changed');
      // Restore the original limit so the shared account keeps its baseline.
      await storageLimit.selectOption(originalLimit);

      await expect(downloadSelect).toBeEnabled();
      const downloadOptions = downloadSelect.locator('option');
      await expect(downloadOptions.first()).toHaveText(/All levels/i);
      const trackValue = await downloadOptions.nth(1).getAttribute('value');
      if (trackValue) {
        await downloadSelect.selectOption(trackValue);
        await expect(downloadSelect).toHaveValue(trackValue);
      }
      coverage.touch('settings.offline.download_track_select', 'value-changed');
    } finally {
      // Leave the switch as we found it.
      const nowOn = (await saveSwitch.getAttribute('aria-checked')) === 'true';
      if (nowOn !== initiallyOn) {
        await saveSwitch.click();
      }
    }
  });
});
