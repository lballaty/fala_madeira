// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/59-tutor-free-chat-send-after-modal-close.spec.ts
// Description: TB-15 regression. The Tutor-tab free chat shares a single chat session with the
//   AI-Practice/Help modal, which nulls that session on close. Before the fix, a send after any
//   practice open+close was a silent no-op (handleSendMessage bailed on the null session). This
//   spec opens the practice modal, closes it (nulling the shared session), then sends a free-chat
//   message and asserts BOTH the user message and the model reply render — i.e. the session is
//   re-created on send instead of silently dropped.
// Author: Claude (assistant)
// Created: 2026-07-16

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('tutor free chat (TB-15)', () => {
  test('free chat still sends after the practice modal is opened and closed', async ({ page, coverage }) => {
    await page.route('**/functions/v1/gemini', async (route, request) => {
      const body = request.postDataJSON();
      if (body && typeof body === 'object' && 'action' in body && body.action === 'chat') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ text: 'E2E free-chat reply', requestId: 'e2e-tb15-freechat' }),
        });
        return;
      }
      await route.continue();
    });

    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();

    // Open the practice modal, then close it. Closing dispatches CLOSE_PRACTICE, which nulls the
    // shared chat session — the exact precondition that broke free-chat sends (TB-15).
    await page.getByRole('button', { name: /Start Today's Lesson/i }).click();
    const tutorDialog = page.getByRole('dialog', { name: /AI .* Tutor/i });
    await expect(tutorDialog).toBeVisible();
    await tutorDialog.getByRole('button', { name: 'Close practice session' }).click();
    await expect(page.getByRole('heading', { name: /AI .* Tutor/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();

    // Now send a free-chat message. The session is null at this point; the fix re-creates it.
    const input = page.getByPlaceholder('Type in Portuguese...');
    await input.fill('Olá, tudo bem?');
    await input.press('Enter');
    coverage.touch('tutor.chat.send_message', 'outcome-asserted');

    // Pre-fix: nothing renders (silent no-op). Post-fix: the user message AND the model reply show.
    await expect(page.getByText('Olá, tudo bem?')).toBeVisible();
    await expect(page.getByText('E2E free-chat reply')).toBeVisible({ timeout: 15_000 });
    await expect(input).toHaveValue('');
  });
});
