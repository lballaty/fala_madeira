// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/02-admin-global-settings.spec.ts
// Description: Admin settings persistence coverage. Verifies the real admin can change the
//   global daily voice limit and that the change persists to public.global_settings. Restores the
//   original value at the end to keep the environment stable for later runs.
// Author: Codex
// Created: 2026-07-11
// Updated: 2026-07-16 (EN-25) — the global voice-limit stepper moved OUT of the Settings
//   "Admin Mode" panel (deleted) INTO the new Admin → Config tab. Rerouted the flow accordingly:
//   open the single sidebar Admin link → Config tab (data-testid="admin-tab-config") → read the
//   value span (data-testid="admin-voice-limit-global") and its +/- buttons. DB assertions kept.

import { test, expect, landOnHome } from '../support/fixtures';
import { config } from '../../../src/config';

function extractFirstInteger(value: string | null): number {
  const match = value?.match(/\b\d+\b/);
  if (!match) {
    throw new Error(`Could not extract integer from text: ${value ?? '<null>'}`);
  }
  return Number(match[0]);
}

test.describe('admin global settings', () => {
  test('Global Voice Limit writes to global_settings and can be restored', async ({ adminPage, adminEvidence }) => {
    const { data: initialRow } = await adminEvidence
      .from('global_settings')
      .select('value')
      .eq('key', config.globalSettingsKeys.voiceLimit)
      .single();

    const initialValue = Number(initialRow?.value ?? '0');
    const targetValue = initialValue + 1;

    await landOnHome(adminPage);

    // EN-25: reach the global voice-limit stepper via the single Admin nav → Config tab.
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await adminPage.getByTestId('admin-tab-config').click();

    const value = adminPage.getByTestId('admin-voice-limit-global');
    await expect(value).toBeVisible();
    // The +/- steppers flank the value span within the same stepper control.
    const stepper = value.locator('xpath=ancestor::div[1]');

    await expect
      .poll(async () => extractFirstInteger(await value.textContent()))
      .toBe(initialValue);

    await stepper.getByRole('button', { name: '+' }).click();

    await expect
      .poll(async () => extractFirstInteger(await value.textContent()), {
        timeout: 12_000,
        message: 'UI did not reflect the incremented Global Voice Limit value',
      })
      .toBe(targetValue);

    await expect
      .poll(
        async () => {
          const { data } = await adminEvidence
            .from('global_settings')
            .select('value')
            .eq('key', config.globalSettingsKeys.voiceLimit)
            .single();
          return Number(data?.value ?? '0');
        },
        { timeout: 12_000, message: 'global_settings.voice_limit did not persist after increment' },
      )
      .toBe(targetValue);

    await stepper.getByRole('button', { name: '-' }).click();

    await expect
      .poll(async () => extractFirstInteger(await value.textContent()), {
        timeout: 12_000,
        message: 'UI did not restore the original Global Voice Limit value',
      })
      .toBe(initialValue);

    await expect
      .poll(
        async () => {
          const { data } = await adminEvidence
            .from('global_settings')
            .select('value')
            .eq('key', config.globalSettingsKeys.voiceLimit)
            .single();
          return Number(data?.value ?? '0');
        },
        { timeout: 12_000, message: 'global_settings.voice_limit did not restore after decrement' },
      )
      .toBe(initialValue);
  });
});
