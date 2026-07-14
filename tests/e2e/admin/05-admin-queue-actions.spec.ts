// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/05-admin-queue-actions.spec.ts
// Description: Admin moderation regression coverage for alternate queue actions. Seeds request,
//   ticket, and video rows through the throwaway user, resolves them through the real admin UI,
//   and asserts each resulting database status via the admin evidence client.
// Author: Codex
// Created: 2026-07-13

import type { Locator } from '@playwright/test';
import { test, expect, landOnHome } from '../support/fixtures';

async function expectRowStatus(
  readStatus: () => Promise<string | null>,
  expectedStatus: string,
  message: string,
): Promise<void> {
  await expect
    .poll(readStatus, { timeout: 12_000, message })
    .toBe(expectedStatus);
}

function queueCard(pageTextLocator: Locator) {
  return pageTextLocator.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
}

test.describe('admin review queue alternate actions', () => {
  test('admin can resolve request, ticket, and video actions beyond the default happy path', async ({
    adminPage,
    adminEvidence,
    userEvidence,
    testUser,
    coverage,
  }) => {
    const nonce = Date.now().toString();

    const implementedTheme = `Admin implemented request ${nonce}`;
    const reviewedTheme = `Admin reviewed request ${nonce}`;
    const ticketSubject = `Admin in-progress ticket ${nonce}`;
    const approvedVideoUrl = `https://youtube.com/watch?v=adminapproved${nonce}`;
    const rejectedVideoUrl = `https://youtube.com/watch?v=adminrejected${nonce}`;

    try {
      const implementedRequestInsert = await userEvidence.from('lesson_requests').insert({
        user_id: testUser.userId,
        theme: implementedTheme,
        description: `Lesson request that should become implemented ${nonce}`,
        status: 'pending',
      });
      expect(implementedRequestInsert.error?.message ?? null).toBeNull();

      const reviewedRequestInsert = await userEvidence.from('lesson_requests').insert({
        user_id: testUser.userId,
        theme: reviewedTheme,
        description: `Lesson request that should become reviewed ${nonce}`,
        status: 'pending',
      });
      expect(reviewedRequestInsert.error?.message ?? null).toBeNull();

      const ticketInsert = await userEvidence.from('tickets').insert({
        user_id: testUser.userId,
        subject: ticketSubject,
        description: `Support ticket that should become in-progress ${nonce}`,
        status: 'open',
        priority: 'medium',
      });
      expect(ticketInsert.error?.message ?? null).toBeNull();

      const approvedVideoInsert = await userEvidence.from('video_suggestions').insert({
        lesson_id: `admin-video-approved-${nonce}`,
        user_id: testUser.userId,
        video_url: approvedVideoUrl,
        note: `Video suggestion to approve ${nonce}`,
        status: 'pending',
      });
      expect(approvedVideoInsert.error?.message ?? null).toBeNull();

      const rejectedVideoInsert = await userEvidence.from('video_suggestions').insert({
        lesson_id: `admin-video-rejected-${nonce}`,
        user_id: testUser.userId,
        video_url: rejectedVideoUrl,
        note: `Video suggestion to reject ${nonce}`,
        status: 'pending',
      });
      expect(rejectedVideoInsert.error?.message ?? null).toBeNull();

      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();

      await expect(adminPage.getByText(implementedTheme)).toBeVisible();
      await expect(adminPage.getByText(reviewedTheme)).toBeVisible();
      await expect(adminPage.getByText(ticketSubject)).toBeVisible();
      await expect(adminPage.getByText(approvedVideoUrl)).toBeVisible();
      await expect(adminPage.getByText(rejectedVideoUrl)).toBeVisible();

      const implementedRequestCard = queueCard(adminPage.getByText(implementedTheme));
      await implementedRequestCard.getByRole('button', { name: 'Mark implemented' }).click();
      await expectRowStatus(
        async () => {
          const { data } = await adminEvidence
            .from('lesson_requests')
            .select('status')
            .eq('theme', implementedTheme)
            .maybeSingle();
          return data?.status ?? null;
        },
        'implemented',
        'lesson request did not update to implemented',
      );
      coverage.touch('admin.queues.request.implemented', 'outcome-asserted');

      const reviewedRequestCard = queueCard(adminPage.getByText(reviewedTheme));
      await reviewedRequestCard.getByRole('button', { name: 'Mark reviewed' }).click();
      await expectRowStatus(
        async () => {
          const { data } = await adminEvidence
            .from('lesson_requests')
            .select('status')
            .eq('theme', reviewedTheme)
            .maybeSingle();
          return data?.status ?? null;
        },
        'reviewed',
        'lesson request did not update to reviewed',
      );
      coverage.touch('admin.queues.request.reviewed', 'outcome-asserted');

      const ticketCard = queueCard(adminPage.getByText(ticketSubject));
      await ticketCard.getByRole('button', { name: 'Mark in-progress' }).click();
      await expectRowStatus(
        async () => {
          const { data } = await adminEvidence
            .from('tickets')
            .select('status')
            .eq('subject', ticketSubject)
            .maybeSingle();
          return data?.status ?? null;
        },
        'in-progress',
        'ticket did not update to in-progress',
      );
      coverage.touch('admin.queues.ticket.in_progress', 'outcome-asserted');
      const approvedVideoCard = queueCard(adminPage.getByText(approvedVideoUrl));
      await approvedVideoCard.getByRole('button', { name: 'Approve video' }).click();
      await expectRowStatus(
        async () => {
          const { data } = await adminEvidence
            .from('video_suggestions')
            .select('status')
            .eq('video_url', approvedVideoUrl)
            .maybeSingle();
          return data?.status ?? null;
        },
        'approved',
        'video suggestion did not update to approved',
      );
      coverage.touch('admin.queues.video.approve', 'outcome-asserted');

      const rejectedVideoCard = queueCard(adminPage.getByText(rejectedVideoUrl));
      await rejectedVideoCard.getByRole('button', { name: 'Reject video' }).click();
      await expectRowStatus(
        async () => {
          const { data } = await adminEvidence
            .from('video_suggestions')
            .select('status')
            .eq('video_url', rejectedVideoUrl)
            .maybeSingle();
          return data?.status ?? null;
        },
        'rejected',
        'video suggestion did not update to rejected',
      );
      coverage.touch('admin.queues.video.reject', 'outcome-asserted');
    } finally {
      await adminEvidence.from('lesson_requests').delete().eq('theme', implementedTheme);
      await adminEvidence.from('lesson_requests').delete().eq('theme', reviewedTheme);
      await adminEvidence.from('tickets').delete().eq('subject', ticketSubject);
      await adminEvidence.from('video_suggestions').delete().eq('video_url', approvedVideoUrl);
      await adminEvidence.from('video_suggestions').delete().eq('video_url', rejectedVideoUrl);
    }
  });
});
