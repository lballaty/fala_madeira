// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/04-admin-content-studio.spec.ts
// Description: Admin content-studio coverage. Verifies an admin can enter the studio, load a
//   real pack, start a new situation draft, and invoke schema validation that surfaces errors for
//   an incomplete draft rather than failing silently.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('admin content studio', () => {
  test('admin can select a pack, start a new draft, and surface validation errors', async ({ adminPage }) => {
    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

    await adminPage.getByRole('button', { name: /Content Studio/i }).click();
    await expect(adminPage.getByText(/Select a pack to author or edit its situations/i)).toBeVisible();

    const packSelect = adminPage.locator('select').first();
    await expect(packSelect).toBeVisible();
    const options = await packSelect.locator('option').allTextContents();
    const firstRealOption = options.find((text) => !/Select a pack/i.test(text));
    expect(firstRealOption ?? null).not.toBeNull();
    await packSelect.selectOption({ label: firstRealOption! });

    await adminPage.getByRole('button', { name: 'New' }).click();
    await expect(adminPage.getByText('Situation id')).toBeVisible();
    await expect(adminPage.getByPlaceholder('e.g. cafe-order-coffee')).toBeVisible();

    await adminPage.getByRole('button', { name: 'Validate' }).click();
    await expect(adminPage.getByText(/error\(s\)/i)).toBeVisible();
    await expect(adminPage.getByText(/situation\./i).first()).toBeVisible();
  });
});
