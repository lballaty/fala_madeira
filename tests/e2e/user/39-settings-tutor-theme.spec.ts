// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/39-settings-tutor-theme.spec.ts
// Description: Functional coverage for two previously-untested settings controls: (a) selecting a
//   DIFFERENT AI tutor than the already-covered "João" (here Maria, t1) with persistence asserted
//   against profiles.selected_tutor_id, and (b) the Appearance Light/System theme toggles (only
//   "Dark" was covered before). Theme is applied to <html data-theme> and persisted to
//   localStorage 'fm_theme' by useTheme (NOT to profiles). Both tests restore original state so the
//   shared test account and page-local theme stay stable across runs.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings tutor + theme coverage', () => {
  test('Switch AI Tutor to Maria persists selected_tutor_id and restores', async ({
    page,
    userEvidence,
    testUser,
    coverage,
  }) => {
    const readTutorId = async (): Promise<string | null> => {
      const { data } = await userEvidence
        .from('profiles')
        .select('selected_tutor_id')
        .eq('id', testUser.userId)
        .single();
      return data?.selected_tutor_id ?? null;
    };

    const originalTutorId = (await readTutorId()) ?? 't1';

    // Target Maria (t1) — a DIFFERENT tutor than the already-covered João (t2). If the account is
    // already on Maria, first switch to João so the subsequent switch-to-Maria is a real change.
    const tutorLabels: Record<string, RegExp> = {
      t1: /Maria, 28/,
      t2: /João, 45/,
      t3: /Ana, 62/,
    };
    const targetId = 't1';
    const targetLabel = tutorLabels[targetId];

    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();

    if (originalTutorId === targetId) {
      // Move off Maria first (to João) so switching to Maria below is a genuine value change.
      await page.getByRole('button', { name: 'Switch AI Tutor' }).click();
      await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toBeVisible();
      await page.getByRole('button', { name: /João, 45/ }).click();
      await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toHaveCount(0);
      await expect.poll(readTutorId, { timeout: 12_000 }).toBe('t2');
    }

    // Switch to Maria (t1) and assert persistence to profiles.selected_tutor_id.
    await page.getByRole('button', { name: 'Switch AI Tutor' }).click();
    await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toBeVisible();
    await page.getByRole('button', { name: targetLabel }).click();
    await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toHaveCount(0);

    await expect
      .poll(readTutorId, {
        timeout: 12_000,
        message: 'profiles.selected_tutor_id did not persist after switching to Maria',
      })
      .toBe(targetId);

    // The Switch AI Tutor row reflects the newly selected tutor name.
    await expect(page.getByText('Maria', { exact: true }).first()).toBeVisible();
    coverage.touch('settings.tutor.select_alt', 'outcome-asserted');

    // Restore the original tutor so the shared test account stays stable across runs.
    if (originalTutorId !== targetId) {
      const restoreLabel = tutorLabels[originalTutorId] ?? tutorLabels.t1;
      await page.getByRole('button', { name: 'Switch AI Tutor' }).click();
      await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toBeVisible();
      await page.getByRole('button', { name: restoreLabel }).click();
      await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toHaveCount(0);
      await expect
        .poll(readTutorId, {
          timeout: 12_000,
          message: 'profiles.selected_tutor_id did not restore after tutor reset',
        })
        .toBe(originalTutorId);
    }
  });

  test('Appearance Light and System toggles apply and persist locally', async ({ page, coverage }) => {
    const readDataTheme = () =>
      page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const readStoredPreference = () =>
      page.evaluate(() => localStorage.getItem('fm_theme'));
    const systemPrefersDark = () =>
      page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();

    // Capture the starting preference so we can restore it and avoid cross-test pollution.
    const originalPreference = await readStoredPreference();

    // --- Light: forces the concrete light theme regardless of OS. useTheme sets
    // <html data-theme="light"> (there is no 'dark' class in this codebase — the Tailwind dark
    // variant + semantic tokens key off data-theme) and persists 'fm_theme' = 'light'.
    const lightButton = page.getByRole('button', { name: 'Light' });
    await lightButton.click();
    await expect(lightButton).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(readDataTheme).toBe('light');
    await expect.poll(readStoredPreference).toBe('light');
    coverage.touch('settings.theme.light', 'value-changed');

    // --- System: resolves against the OS prefers-color-scheme. Assert the applied data-theme
    // matches the live OS resolution (deterministic for a given runner) and that the preference
    // persisted as 'system'.
    const systemButton = page.getByRole('button', { name: 'System' });
    await systemButton.click();
    await expect(systemButton).toHaveAttribute('aria-pressed', 'true');
    const expectedResolved = (await systemPrefersDark()) ? 'dark' : 'light';
    await expect.poll(readDataTheme).toBe(expectedResolved);
    await expect.poll(readStoredPreference).toBe('system');
    coverage.touch('settings.theme.system', 'value-changed');

    // Restore the original preference (defaulting to 'system') to avoid polluting reused profiles.
    const restore = (originalPreference ?? 'system') as 'system' | 'light' | 'dark';
    await page.getByRole('button', { name: restore === 'system' ? 'System' : restore === 'light' ? 'Light' : 'Dark' }).click();
    await expect.poll(readStoredPreference).toBe(restore);
  });
});
