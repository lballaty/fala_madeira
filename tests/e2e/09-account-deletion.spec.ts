// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/09-account-deletion.spec.ts
// Description: S7 account-deletion slice — SAFE assertion only. Confirms the Settings destructive
//   control exists ("Delete Account & Data") and that its confirmation modal opens with the
//   correct destructive copy ("Delete Account?" → "Delete Everything" / "Keep My Account"), then
//   CANCELS. It NEVER confirms deletion — the admin account (liborballaty@gmail.com) must survive
//   (docs/TEST-VERTICAL-SLICES.md S7 uses a throwaway user for the real destructive path; this
//   pre-ship gate only verifies the control + modal, per the task's explicit "DO NOT actually
//   confirm deletion").
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';

test.describe('account deletion control (S7 — non-destructive)', () => {
  test('delete control exists and confirmation modal opens, then cancel (no deletion)', async ({
    page,
    evidence,
    admin,
  }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    // The destructive control is present in Settings.
    const deleteControl = page.getByRole('button', { name: 'Delete Account & Data' });
    await deleteControl.scrollIntoViewIfNeeded();
    await expect(deleteControl).toBeVisible();

    // Opening it raises the confirmation modal with the destructive copy.
    await deleteControl.click();
    await expect(page.getByRole('heading', { name: 'Delete Account?' })).toBeVisible();
    await expect(
      page.getByText(/delete your account and all associated data/i),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Everything' })).toBeVisible();

    // CANCEL — never confirm. The admin account must survive this run.
    await page.getByRole('button', { name: 'Keep My Account' }).click();
    await expect(page.getByRole('heading', { name: 'Delete Account?' })).toHaveCount(0);

    // Backend evidence that nothing was deleted: the admin profile row still exists.
    const { data, error } = await evidence
      .from('profiles')
      .select('id')
      .eq('id', admin.userId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBe(admin.userId);
  });
});
