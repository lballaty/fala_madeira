// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/55-voice-limit-reflects-server.spec.ts
// Description: TB-8 regression. The daily voice limit must reflect the configured SERVER value
//   (global_settings.voice_limit), not the client-side default (5), and it must be visible to every
//   user (previously only behind admin mode). Reads the authoritative value via the test-user
//   evidence client (global_settings is readable by all per RLS) and asserts the Settings read-only
//   "Daily voice limit" display matches it. toHaveText retries, so the provisional-default flash
//   before the mount fetch resolves does not make the test flaky.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('TB-8 voice limit reflects the configured server value', () => {
  test('Settings shows the server global voice limit to a non-admin user', async ({ page, userEvidence }) => {
    // Authoritative server value.
    const { data } = await userEvidence
      .from('global_settings')
      .select('value')
      .eq('key', 'voice_limit')
      .single();
    const serverLimit = data?.value ?? null;
    expect(serverLimit, 'global_settings.voice_limit must exist').not.toBeNull();

    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    const shown = page.getByTestId('voice-limit-value');
    await expect(shown).toBeVisible();
    // Reflects the server value (e.g. 20) — not the client default that caused the "shows 5" bug.
    await expect(shown).toHaveText(String(serverLimit));
  });
});
