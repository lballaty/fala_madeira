// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/02-admin-global-settings.spec.ts
// Description: Admin settings persistence coverage. Verifies the real admin can change the
//   global daily voice limit from the live Profile admin controls and that the change persists
//   to public.global_settings. Restores the original value at the end to keep the environment
//   stable for later runs.
// Author: Codex
// Created: 2026-07-11

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
    await adminPage.getByRole('button', { name: 'Profile' }).first().click();
    await adminPage.getByRole('switch', { name: 'Admin Mode' }).click();

    const panel = adminPage
      .getByText('Global Voice Limit', { exact: true })
      .locator('xpath=ancestor::div[2]');
    const value = panel.locator('span.w-6');
    await expect(panel.getByText('Global Voice Limit', { exact: true })).toBeVisible();

    await expect
      .poll(async () => extractFirstInteger(await value.textContent()))
      .toBe(initialValue);

    await panel.getByRole('button', { name: '+' }).click();

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

    await panel.getByRole('button', { name: '-' }).click();

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
