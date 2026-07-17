// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/37-tutor-error-ref-toast.spec.ts
// Description: Failure-path coverage for the canonical user-visible Ref contract. Forces the
//   tutor edge call to fail with a synthetic requestId and asserts the chat flow surfaces the
//   calm message plus short Ref while leaving the tutor screen mounted.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

const FORCED_REQUEST_ID = 'abcd1234-e2e-chat-failure';
const FORCED_MESSAGE = 'Tutor service unavailable for test';

test.describe('tutor error Ref surface', () => {
  test('free chat shows a calm error toast with Ref when the tutor edge call fails', async ({ page, coverage }) => {
    await page.route('**/functions/v1/ai-gateway', async (route, request) => {
      const body = request.postDataJSON();
      if (body && typeof body === 'object' && 'action' in body && body.action === 'chat') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'E2E_CHAT_FAILURE',
              message: FORCED_MESSAGE,
              requestId: FORCED_REQUEST_ID,
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();

    await page.getByRole('button', { name: 'Just Want to Chat' }).click();
    coverage.touch('tutor.empty.just_chat', 'outcome-asserted');
    await expect(page.getByText(/I'm .* ready to chat/i)).toBeVisible();

    const input = page.getByPlaceholder('Type in Portuguese...');
    await input.fill('Olá, consegues ajudar-me?');

    const sendButton = page.locator('div.absolute.bottom-0 button').last();
    await expect(sendButton).toBeEnabled();
    await sendButton.click();
    coverage.touch('tutor.chat.send_message', 'outcome-asserted');

    await expect(page.getByText(new RegExp(`${FORCED_MESSAGE} \\(Ref: abcd1234\\)`))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible();
    await expect(page.getByPlaceholder('Type in Portuguese...')).toBeVisible();
  });
});
