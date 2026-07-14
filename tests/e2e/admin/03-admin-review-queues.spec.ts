// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/03-admin-review-queues.spec.ts
// Description: Admin moderation coverage. Seeds one pending row into each user feedback table
//   via the throwaway user, verifies the admin queue renders them, and resolves a correction plus
//   a ticket through the real admin UI with database assertions on the resulting status updates.
// Author: Codex
// Created: 2026-07-13

import type { Locator } from '@playwright/test';
import { test, expect, landOnHome } from '../support/fixtures';

function queueCard(pageTextLocator: Locator) {
  return pageTextLocator.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
}

test.describe('admin review queues', () => {
  test('admin can read seeded pending items and resolve queue actions', async ({
    adminPage,
    adminEvidence,
    userEvidence,
    testUser,
  }) => {
    const nonce = Date.now().toString();
    const lessonId = `admin-queue-lesson-${nonce}`;
    const correctionText = `Admin queue correction ${nonce}`;
    const requestTheme = `Admin queue request ${nonce}`;
    const ticketSubject = `Admin queue ticket ${nonce}`;
    const videoUrl = `https://youtube.com/watch?v=adminqueue${nonce}`;

    try {
      const correctionInsert = await userEvidence.from('lesson_corrections').insert({
        lesson_id: lessonId,
        user_id: testUser.userId,
        correction_text: correctionText,
        status: 'pending',
      });
      expect(correctionInsert.error?.message ?? null).toBeNull();

      const requestInsert = await userEvidence.from('lesson_requests').insert({
        user_id: testUser.userId,
        theme: requestTheme,
        description: `Admin queue request description ${nonce}`,
        status: 'pending',
      });
      expect(requestInsert.error?.message ?? null).toBeNull();

      const ticketInsert = await userEvidence.from('tickets').insert({
        user_id: testUser.userId,
        subject: ticketSubject,
        description: `Admin queue ticket description ${nonce}`,
        status: 'open',
        priority: 'medium',
      });
      expect(ticketInsert.error?.message ?? null).toBeNull();

      const videoInsert = await userEvidence.from('video_suggestions').insert({
        lesson_id: lessonId,
        user_id: testUser.userId,
        video_url: videoUrl,
        note: `Admin queue video note ${nonce}`,
        status: 'pending',
      });
      expect(videoInsert.error?.message ?? null).toBeNull();

      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();

      await expect(adminPage.getByText(correctionText)).toBeVisible();
      await expect(adminPage.getByText(requestTheme)).toBeVisible();
      await expect(adminPage.getByText(ticketSubject)).toBeVisible();
      await expect(adminPage.getByText(videoUrl)).toBeVisible();

      const correctionCard = queueCard(adminPage.getByText(correctionText));
      await correctionCard.getByRole('button', { name: 'Approve correction' }).click();

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
          { timeout: 12_000, message: 'lesson_corrections status did not update after admin approval' },
        )
        .toBe('approved');

      const ticketCard = queueCard(adminPage.getByText(ticketSubject));
      await ticketCard.getByRole('button', { name: 'Close ticket' }).click();

      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('tickets')
              .select('status')
              .eq('subject', ticketSubject)
              .maybeSingle();
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'tickets status did not update after admin close action' },
        )
        .toBe('closed');
    } finally {
      await adminEvidence.from('lesson_corrections').delete().eq('correction_text', correctionText);
      await adminEvidence.from('lesson_requests').delete().eq('theme', requestTheme);
      await adminEvidence.from('tickets').delete().eq('subject', ticketSubject);
      await adminEvidence.from('video_suggestions').delete().eq('video_url', videoUrl);
    }
  });
});
