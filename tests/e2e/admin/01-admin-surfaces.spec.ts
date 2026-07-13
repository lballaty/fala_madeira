// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/01-admin-surfaces.spec.ts
// Description: Admin visibility regression coverage. Proves the real admin account sees the
//   Admin navigation and Settings admin controls, and that a normal user does not. Also opens
//   the full admin overlay and its two tabs so "admin exists" means "admin is actually reachable."
// Author: Codex
// Created: 2026-07-11

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('admin surfaces', () => {
  test('admin account sees Admin nav, Admin Mode, Review Queues, and Content Studio', async ({ adminPage }) => {
    await landOnHome(adminPage);

    await expect(adminPage.getByRole('button', { name: 'Admin' }).first()).toBeVisible();

    await adminPage.getByRole('button', { name: 'Profile' }).first().click();
    await expect(adminPage.getByRole('switch', { name: 'Admin Mode' })).toBeVisible();

    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Content Studio/i })).toBeVisible();

    await adminPage.getByRole('button', { name: /Content Studio/i }).click();
    await expect(adminPage.getByText(/Select a pack to author or edit its situations/i)).toBeVisible();
  });

  test('throwaway test user does not see admin nav or Admin Mode', async ({ page }) => {
    await landOnHome(page);

    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Profile' }).first().click();
    await expect(page.getByRole('switch', { name: 'Admin Mode' })).toHaveCount(0);
  });
});
