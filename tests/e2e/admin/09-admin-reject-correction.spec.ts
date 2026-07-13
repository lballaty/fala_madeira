// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/09-admin-reject-correction.spec.ts
// Description: Admin moderation coverage for the "Reject correction" control (the negative
//   decision path, previously untested — only Approve was covered by admin/03). Seeds a single
//   unique pending lesson_correction row via the throwaway user, navigates the real admin UI to
//   Review Queues, clicks "Reject correction" on THAT row, and polls the DB to prove the status
//   persists as 'rejected'. Deterministic: keyed on a per-run nonce so it never depends on any
//   other seeded row. Cleans up the row in finally.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import type { Locator } from '@playwright/test';
import { test, expect, landOnHome } from '../support/fixtures';

function queueCard(pageTextLocator: Locator) {
  return pageTextLocator.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
}

test.describe('admin reject correction', () => {
  test('admin can reject a pending correction and the rejection persists', async ({
    adminPage,
    adminEvidence,
    userEvidence,
    testUser,
    coverage,
  }) => {
    const nonce = Date.now().toString();
    const lessonId = `admin-reject-lesson-${nonce}`;
    const correctionText = `Admin reject correction ${nonce}`;

    try {
      const correctionInsert = await userEvidence.from('lesson_corrections').insert({
        lesson_id: lessonId,
        user_id: testUser.userId,
        correction_text: correctionText,
        status: 'pending',
      });
      expect(correctionInsert.error?.message ?? null).toBeNull();

      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();

      // Only THIS seeded row is asserted — the nonce keeps it unique among any other pending rows.
      await expect(adminPage.getByText(correctionText)).toBeVisible();

      const correctionCard = queueCard(adminPage.getByText(correctionText));
      await correctionCard.getByRole('button', { name: 'Reject correction' }).click();
      coverage.touch('admin.queues.correction.reject', 'outcome-asserted');

      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('lesson_corrections')
              .select('status')
              .eq('correction_text', correctionText)
              .maybeSingle();
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'lesson_corrections status did not update after admin rejection' },
        )
        .toBe('rejected');
    } finally {
      await adminEvidence.from('lesson_corrections').delete().eq('correction_text', correctionText);
    }
  });
});
