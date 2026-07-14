// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/17-my-submissions-statuses.spec.ts
// Description: Deterministic My Submissions status coverage. Seeds one row per feedback table for
//   the current test user, verifies grouped status readback in the Settings modal, and exercises
//   the refresh control against the live backing data.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('my submissions statuses', () => {
  test('My Submissions shows grouped rows with current statuses and supports refresh', async ({ page, userEvidence, testUser, coverage }) => {
    const nonce = Date.now().toString();
    const lessonId = `e2e-status-lesson-${nonce}`;
    const correctionText = `E2E approved correction ${nonce}`;
    const requestTheme = `E2E implemented request ${nonce}`;
    const ticketSubject = `E2E in-progress ticket ${nonce}`;
    const videoNote = `E2E rejected video ${nonce}`;

    const correctionInsert = await userEvidence.from('lesson_corrections').insert({
      lesson_id: lessonId,
      user_id: testUser.userId,
      correction_text: correctionText,
      status: 'approved',
    });
    expect(correctionInsert.error?.message ?? null).toBeNull();

    const requestInsert = await userEvidence.from('lesson_requests').insert({
      user_id: testUser.userId,
      theme: requestTheme,
      description: `Implemented request description ${nonce}`,
      status: 'implemented',
    });
    expect(requestInsert.error?.message ?? null).toBeNull();

    const ticketInsert = await userEvidence.from('tickets').insert({
      user_id: testUser.userId,
      subject: ticketSubject,
      description: `Ticket description ${nonce}`,
      status: 'in-progress',
      priority: 'medium',
    });
    expect(ticketInsert.error?.message ?? null).toBeNull();

    const videoInsert = await userEvidence.from('video_suggestions').insert({
      lesson_id: lessonId,
      user_id: testUser.userId,
      video_url: `https://youtube.com/watch?v=statuses${nonce}`,
      note: videoNote,
      status: 'rejected',
    });
    expect(videoInsert.error?.message ?? null).toBeNull();

    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();
    await page.getByRole('button', { name: 'My Submissions' }).click();
    await expect(page.getByRole('heading', { name: 'My Submissions' })).toBeVisible();
    coverage.touch('settings.submissions.open', 'outcome-asserted');

    await expect(page.getByText('Lesson Corrections')).toBeVisible();
    await expect(page.getByText('Lesson Requests')).toBeVisible();
    await expect(page.getByText('Support Tickets')).toBeVisible();
    await expect(page.getByText('Video Suggestions')).toBeVisible();

    await expect(page.getByText(correctionText)).toBeVisible();
    await expect(page.getByText(requestTheme)).toBeVisible();
    await expect(page.getByText(ticketSubject)).toBeVisible();
    await expect(page.getByText(`"${videoNote}"`)).toBeVisible();

    const correctionRow = page.getByText(correctionText).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
    const requestRow = page.getByText(requestTheme).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
    const ticketRow = page.getByText(ticketSubject).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
    const videoRow = page.getByText(`"${videoNote}"`).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');

    await expect(correctionRow.locator('span').last()).toHaveText('approved');
    await expect(requestRow.locator('span').last()).toHaveText('implemented');
    await expect(ticketRow.locator('span').last()).toHaveText('in-progress');
    await expect(videoRow.locator('span').last()).toHaveText('rejected');

    const refreshButton = page.getByRole('button', { name: 'Refresh submissions' });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();
    coverage.touch('settings.submissions.refresh', 'outcome-asserted');

    await expect(page.getByText(correctionText)).toBeVisible();
    await expect(page.getByText(requestTheme)).toBeVisible();
    await expect(page.getByText(ticketSubject)).toBeVisible();
    await expect(page.getByText(`"${videoNote}"`)).toBeVisible();
  });
});
