// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/10-settings-readwrite.spec.ts
// Description: Settings regression coverage beyond support. Verifies tutor selection persists to
//   the profile row and restores cleanly, and that the My Submissions modal reads real rows from
//   the four backing feedback tables for the current user.
// Author: Codex
// Created: 2026-07-12

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('settings read/write coverage', () => {
  test('Switch AI Tutor persists to profiles and can be restored', async ({ page, userEvidence, testUser, coverage }) => {
    const { data: initialProfile } = await userEvidence
      .from('profiles')
      .select('selected_tutor_id')
      .eq('id', testUser.userId)
      .single();

    const originalTutorId = initialProfile?.selected_tutor_id ?? 't1';
    const target = originalTutorId === 't2'
      ? { id: 't3', label: /Ana, 62/ }
      : { id: 't2', label: /João, 45/ };
    const restore = originalTutorId === 't2'
      ? { id: 't2', label: /João, 45/ }
      : originalTutorId === 't3'
        ? { id: 't3', label: /Ana, 62/ }
        : { id: 't1', label: /Maria, 28/ };

    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();

    await page.getByRole('button', { name: 'Switch AI Tutor' }).click();
    await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toBeVisible();
    await page.getByRole('button', { name: target.label }).click();
    await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toHaveCount(0);
    coverage.touch('settings.tutor.open', 'outcome-asserted');
    coverage.touch('settings.tutor.select', 'outcome-asserted');

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('profiles')
            .select('selected_tutor_id')
            .eq('id', testUser.userId)
            .single();
          return data?.selected_tutor_id ?? null;
        },
        { timeout: 12_000, message: 'profiles.selected_tutor_id did not persist after tutor change' },
      )
      .toBe(target.id);

    await expect(page.getByText(new RegExp(target.label.source.replace(', 45', '').replace(', 62', ''), 'i')).first()).toBeVisible();

    // Restore the original tutor so the shared test account stays stable across runs.
    await page.getByRole('button', { name: 'Switch AI Tutor' }).click();
    await expect(page.getByRole('heading', { name: 'Choose Your Tutor' })).toBeVisible();
    await page.getByRole('button', { name: restore.label }).click();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('profiles')
            .select('selected_tutor_id')
            .eq('id', testUser.userId)
            .single();
          return data?.selected_tutor_id ?? null;
        },
        { timeout: 12_000, message: 'profiles.selected_tutor_id did not restore after tutor reset' },
      )
      .toBe(restore.id);
  });

  test('My Submissions reads tickets, requests, corrections, and videos for the current user', async ({ page, userEvidence, testUser, coverage }) => {
    const nonce = Date.now().toString();
    const lessonId = `e2e-lesson-${nonce}`;
    const requestTheme = `E2E submissions theme ${nonce}`;
    const correctionText = `E2E correction ${nonce}`;
    const ticketSubject = `E2E ticket ${nonce}`;
    const videoNote = `E2E video note ${nonce}`;

    const requestInsert = await userEvidence.from('lesson_requests').insert({
      user_id: testUser.userId,
      theme: requestTheme,
      description: `Need lesson detail ${nonce}`,
      status: 'pending',
    });
    expect(requestInsert.error?.message ?? null).toBeNull();

    const correctionInsert = await userEvidence.from('lesson_corrections').insert({
      lesson_id: lessonId,
      user_id: testUser.userId,
      correction_text: correctionText,
      status: 'pending',
    });
    expect(correctionInsert.error?.message ?? null).toBeNull();

    const ticketInsert = await userEvidence.from('tickets').insert({
      user_id: testUser.userId,
      subject: ticketSubject,
      description: `E2E ticket description ${nonce}`,
      status: 'open',
      priority: 'medium',
    });
    expect(ticketInsert.error?.message ?? null).toBeNull();

    const videoInsert = await userEvidence.from('video_suggestions').insert({
      lesson_id: lessonId,
      user_id: testUser.userId,
      video_url: `https://youtube.com/watch?v=submissions${nonce}`,
      note: videoNote,
      status: 'pending',
    });
    expect(videoInsert.error?.message ?? null).toBeNull();

    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await page.getByRole('button', { name: 'My Submissions' }).click();
    await expect(page.getByRole('heading', { name: 'My Submissions' })).toBeVisible();
    coverage.touch('settings.submissions.open', 'outcome-asserted');

    await expect(page.getByText(requestTheme)).toBeVisible();
    await expect(page.getByText(correctionText)).toBeVisible();
    await expect(page.getByText(ticketSubject)).toBeVisible();
    await expect(page.getByText(`"${videoNote}"`)).toBeVisible();
    await expect(page.getByText(`Lesson: ${lessonId}`).first()).toBeVisible();
  });
});
