// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/04-learning-feedback.spec.ts
// Description: Learning feedback regression coverage. Exercises the user-visible request-theme,
//   suggest-video, and report-correction flows from the real Learning UI, then proves each path
//   wrote the expected row to the live database for the throwaway user.
// Author: Codex
// Created: 2026-07-11

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('learning feedback writes', () => {
  test('requesting a theme, suggesting a video, and reporting a correction all persist', async ({ page, userEvidence, testUser }) => {
    const nonce = Date.now().toString();
    const requestTheme = `E2E Theme ${nonce}`;
    const requestDescription = `Need a practical lesson for market small talk ${nonce}`;
    const suggestionUrl = `https://youtube.com/watch?v=e2e${nonce}`;
    const suggestionNote = `Useful pronunciation context ${nonce}`;
    const correctionText = `Correction needed for phrase wording ${nonce}`;

    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    await page.getByRole('button', { name: 'Request Theme' }).click();
    await expect(page.getByRole('heading', { name: 'Request Lesson' })).toBeVisible();
    await page.getByLabel('Theme / Subject').fill(requestTheme);
    await page.getByLabel('Description').fill(requestDescription);
    await page.getByRole('button', { name: 'Submit Request' }).click();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('lesson_requests')
            .select('theme, description, status')
            .eq('user_id', testUser.userId)
            .eq('theme', requestTheme)
            .maybeSingle();
          return data ? `${data.theme}|${data.description}|${data.status}` : null;
        },
        { timeout: 12_000, message: 'lesson_requests row was not created from Request Theme modal' },
      )
      .toBe(`${requestTheme}|${requestDescription}|pending`);

    const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
    await firstLesson.click();
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();

    await page.getByRole('button', { name: 'Suggest Video' }).click();
    await expect(page.getByRole('heading', { name: 'Suggest a Video' })).toBeVisible();
    await page.getByLabel('YouTube URL').fill(suggestionUrl);
    await page.getByLabel('Note (Optional)').fill(suggestionNote);
    await page.getByRole('button', { name: 'Submit Suggestion' }).click();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('video_suggestions')
            .select('video_url, note, status')
            .eq('user_id', testUser.userId)
            .eq('video_url', suggestionUrl)
            .maybeSingle();
          return data ? `${data.video_url}|${data.note ?? ''}|${data.status}` : null;
        },
        { timeout: 12_000, message: 'video_suggestions row was not created from Suggest Video modal' },
      )
      .toBe(`${suggestionUrl}|${suggestionNote}|pending`);

    await page.getByRole('button', { name: 'Correction' }).click();
    await expect(page.getByRole('heading', { name: 'Report Correction' })).toBeVisible();
    await page.getByPlaceholder('Describe the correction needed...').fill(correctionText);
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('lesson_corrections')
            .select('correction_text, status')
            .eq('user_id', testUser.userId)
            .eq('correction_text', correctionText)
            .maybeSingle();
          return data ? `${data.correction_text}|${data.status}` : null;
        },
        { timeout: 12_000, message: 'lesson_corrections row was not created from Correction modal' },
      )
      .toBe(`${correctionText}|pending`);
  });
});
