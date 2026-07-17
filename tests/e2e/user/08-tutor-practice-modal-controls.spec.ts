// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/08-tutor-practice-modal-controls.spec.ts
// Description: Tutor practice modal coverage that stays fully local. Exercises opening the
//   guided practice modal from the Tutor empty state, toggling help/audio controls, verifying
//   input/send state, and closing the session without depending on a live AI response.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('tutor practice modal controls', () => {
  test('Start Today\'s Lesson opens the tutor modal and local controls respond', async ({ page, coverage }) => {
    await page.route('**/functions/v1/ai-gateway', async (route, request) => {
      const body = request.postDataJSON();
      if (body && typeof body === 'object' && 'action' in body && body.action === 'chat') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            text: 'E2E modal reply',
            requestId: 'e2e-tutor-modal',
          }),
        });
        return;
      }
      await route.continue();
    });

    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();

    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();
    await page.getByRole('button', { name: /Start Today's Lesson/i }).click();
    coverage.touch('tutor.empty.start_todays_lesson', 'outcome-asserted');

    const tutorDialog = page.getByRole('dialog', { name: /AI .* Tutor/i });
    await expect(tutorDialog).toBeVisible();
    await expect(tutorDialog.getByText(/Practicing:/i)).toBeVisible();

    const helpToggle = page.getByRole('button', { name: 'Turn on help mode' });
    await expect(helpToggle).toHaveAttribute('aria-pressed', 'false');
    await helpToggle.click();
    await expect(page.getByRole('button', { name: 'Turn off help mode' })).toHaveAttribute('aria-pressed', 'true');
    coverage.touch('tutor.practice.help_toggle', 'outcome-asserted');

    // Sound toggle. TB-5 made read-aloud default OFF for NEW users, but this shared user's profile
    // may carry a saved preference (useSettings loads profiles.is_sound_enabled), so assert the
    // toggle FLIPS rather than a fixed default. (The default-off itself is unit-tested via
    // initialSoundEnabled in useSettings' tests.)
    const soundToggle = page.getByRole('button', { name: /^(Mute|Unmute) tutor audio$/ });
    await expect(soundToggle).toBeVisible();
    const wasUnmute = (await soundToggle.getAttribute('aria-label')) === 'Unmute tutor audio';
    await soundToggle.click();
    const flippedLabel = wasUnmute ? 'Mute tutor audio' : 'Unmute tutor audio';
    await expect(page.getByRole('button', { name: flippedLabel })).toBeVisible();
    coverage.touch('tutor.practice.audio_toggle', 'outcome-asserted');

    const input = tutorDialog.getByPlaceholder('Type in Portuguese...');
    const send = tutorDialog.getByRole('button', { name: 'Send message' });
    await expect(send).toBeDisabled();

    await input.fill('Bom dia');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(tutorDialog.getByText('E2E modal reply')).toBeVisible();
    coverage.touch('tutor.practice.send_message', 'outcome-asserted');

    await tutorDialog.getByRole('button', { name: 'Close practice session' }).click();
    await expect(page.getByRole('heading', { name: /AI .* Tutor/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();
    coverage.touch('tutor.practice.close_session', 'outcome-asserted');
  });
});
