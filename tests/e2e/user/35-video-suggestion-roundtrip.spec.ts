// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/35-video-suggestion-roundtrip.spec.ts
// Description: End-to-end video-suggestion journey. A user submits a video suggestion from a real
//   lesson, the admin approves that exact row from Review Queues, and the user refreshes
//   My Submissions to verify the status transition to approved.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

async function openFirstLessonDetails(page: Parameters<typeof landOnHome>[0]) {
  await page.getByRole('button', { name: 'Learning' }).first().click();
  await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
  const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
  await firstLesson.click();
  await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
}

test.describe('video suggestion roundtrip', () => {
  test('user-submitted video suggestion can be approved by admin and reflected back in My Submissions', async ({
    page,
    adminPage,
    userEvidence,
    adminEvidence,
    testUser,
    coverage,
  }) => {
    const nonce = Date.now().toString();
    const videoUrl = `https://youtube.com/watch?v=roundtrip${nonce}`;
    const note = `E2E roundtrip video ${nonce}`;

    try {
      await landOnHome(page);
      await openFirstLessonDetails(page);

      await page.getByRole('button', { name: 'Suggest Video' }).click();
      await expect(page.getByRole('heading', { name: 'Suggest a Video' })).toBeVisible();
      await page.getByLabel('YouTube URL').fill(videoUrl);
      await page.getByLabel('Note (Optional)').fill(note);
      await page.getByRole('button', { name: 'Submit Suggestion' }).click();

      await expect
        .poll(
          async () => {
            const { data } = await userEvidence
              .from('video_suggestions')
              .select('video_url, note, status')
              .eq('user_id', testUser.userId)
              .eq('video_url', videoUrl)
              .maybeSingle();
            return data ? `${data.video_url}|${data.note ?? ''}|${data.status}` : null;
          },
          { timeout: 12_000, message: 'video suggestion row was not created from the user lesson modal' },
        )
        .toBe(`${videoUrl}|${note}|pending`);

      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();

      await expect(adminPage.getByText(videoUrl)).toBeVisible();
      const videoCard = adminPage.getByText(videoUrl).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await videoCard.getByRole('button', { name: 'Approve video' }).click();
      coverage.touch('admin.queues.video.approve', 'outcome-asserted');

      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('video_suggestions')
              .select('status')
              .eq('video_url', videoUrl)
              .maybeSingle();
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'admin did not approve the submitted video suggestion' },
        )
        .toBe('approved');

      await landOnHome(page);
      await page.getByRole('button', { name: 'Profile' }).first().click();
      await page.getByRole('button', { name: 'My Submissions' }).click();
      coverage.touch('settings.submissions.open', 'outcome-asserted');
      await expect(page.getByRole('heading', { name: 'My Submissions' })).toBeVisible();

      const refreshButton = page.getByRole('button', { name: 'Refresh submissions' });
      // EF-33/LT10 guard: the refresh control must become enabled after the online reload;
      // if supabase-js wedges before the network layer it stays disabled forever (read-only app).
      await expect(refreshButton).toBeEnabled();
      await refreshButton.click();
      coverage.touch('settings.submissions.refresh', 'outcome-asserted');

      const videoRow = page.getByText(`"${note}"`).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await expect(videoRow).toBeVisible();
      await expect(videoRow.locator('span').last()).toHaveText('approved');
    } finally {
      await adminEvidence.from('video_suggestions').delete().eq('video_url', videoUrl);
    }
  });
});
