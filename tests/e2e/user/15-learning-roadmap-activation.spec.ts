// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/15-learning-roadmap-activation.spec.ts
// Description: Deterministic roadmap activation coverage. Switches to a different month in the
//   Learning roadmap, verifies the visible Activate -> Active transition, and confirms the
//   selected month still reads back as Active after switching away and back before restoring.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('learning roadmap activation', () => {
  test('switching months activates the selected roadmap month and reads back as active', async ({ page, userEvidence, testUser }) => {
    const { data: initialProfile } = await userEvidence
      .from('profiles')
      .select('active_month')
      .eq('id', testUser.userId)
      .single();

    const originalMonth = initialProfile?.active_month ?? 1;
    const targetMonth = originalMonth === 2 ? 3 : 2;

    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`Month\\s*${targetMonth}`, 'i') }).click();
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();
    await expect(page.getByText('Active')).toHaveCount(0);

    await page.getByRole('button', { name: 'Activate' }).click();

    await expect(page.getByText('Active')).toBeVisible();

    const detourMonth = 6;
    await page.getByRole('button', { name: new RegExp(`Month\\s*${detourMonth}`, 'i') }).click();
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`Month\\s*${targetMonth}`, 'i') }).click();
    await expect(page.getByText('Active')).toBeVisible();

    if (originalMonth !== targetMonth) {
      await page.getByRole('button', { name: new RegExp(`Month\\s*${originalMonth}`, 'i') }).click();
      await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();
      await page.getByRole('button', { name: 'Activate' }).click();
      await expect(page.getByText('Active')).toBeVisible();
    }
  });
});
