// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/01-admin-surfaces.spec.ts
// Description: Admin visibility regression coverage. Proves the real admin account sees the single
//   Admin navigation entry and that opening it reveals ALL four consolidated tabs (Review Queues,
//   Content Studio, User Access, Config), and that a normal user sees no Admin nav. EN-25 deleted
//   the legacy Settings "Admin Mode" toggle, so this spec also asserts that toggle is gone.
// Author: Codex
// Created: 2026-07-11
// Updated: 2026-07-16 (EN-25) — rerouted off the deleted Settings "Admin Mode" toggle; the admin
//   surface is now reached only from the single sidebar "Admin" nav link (AdminView overlay).

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('admin surfaces', () => {
  test('admin account sees the single Admin nav and all four consolidated tabs', async ({ adminPage }) => {
    await landOnHome(adminPage);

    await expect(adminPage.getByRole('button', { name: 'Admin' }).first()).toBeVisible();

    // EN-25: the legacy Settings "Admin Mode" toggle was deleted — it must not exist.
    await adminPage.getByRole('button', { name: 'Profile' }).first().click();
    await expect(adminPage.getByRole('switch', { name: 'Admin Mode' })).toHaveCount(0);

    // The single sidebar Admin link opens the consolidated overlay.
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

    // All four functions are reachable from this one surface as tabs.
    await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Content Studio/i })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /User Access/i })).toBeVisible();
    await expect(adminPage.getByTestId('admin-tab-config')).toBeVisible();

    await adminPage.getByRole('button', { name: /Content Studio/i }).click();
    await expect(adminPage.getByText(/Select a pack to author or edit its situations/i)).toBeVisible();
  });

  test('throwaway test user does not see the Admin nav or the (removed) Admin Mode toggle', async ({ page }) => {
    await landOnHome(page);

    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Profile' }).first().click();
    await expect(page.getByRole('switch', { name: 'Admin Mode' })).toHaveCount(0);
  });
});
