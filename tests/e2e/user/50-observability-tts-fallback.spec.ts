// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/50-observability-tts-fallback.spec.ts
// Description: Wire-level coverage for TTS graceful degradation (plan obs-tts-fallback /
//   OBSERVABILITY-CONTRACT §10.6). When SERVER TTS returns 503 TTS_UNAVAILABLE, the client must
//   fall back to the browser's speech-synthesis engine and NOT surface an error toast. Drives a
//   real tutor chat reply, clicks its "Listen" control with the tts edge action stubbed to 503,
//   and asserts device speech was invoked (window.speechSynthesis.speak spy) with no error Ref
//   toast. The chat reply and tts response are both fulfilled locally.
// Author: Observability test build-out (with assistant)
// Created: 2026-07-14

import { test, expect, landOnHome } from '../support/fixtures';

declare global {
  interface Window {
    __spokenTexts?: string[];
  }
}

test.describe('observability: TTS fallback to device speech', () => {
  test('a 503 TTS_UNAVAILABLE degrades to browser speech with no error toast', async ({ page, coverage }) => {
    // Spy on the browser speech-synthesis engine BEFORE app code loads.
    await page.addInitScript(() => {
      window.__spokenTexts = [];
      try {
        const synth = window.speechSynthesis;
        if (synth) {
          synth.speak = ((u: SpeechSynthesisUtterance) => {
            window.__spokenTexts!.push(u?.text ?? '');
            // Mimic the engine finishing so the app's onEnded contract fires.
            try {
              if (typeof u?.onend === 'function') setTimeout(() => u.onend!.call(u, {} as SpeechSynthesisEvent), 0);
            } catch {
              /* ignore */
            }
          }) as typeof synth.speak;
        }
      } catch {
        /* ignore */
      }
    });

    await page.route('**/functions/v1/ai-gateway', async (route, request) => {
      const body = request.postDataJSON();
      if (body && typeof body === 'object' && body.action === 'chat') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ text: 'Bom dia! Como está?', requestId: 'e2e-chat-ok' }),
        });
        return;
      }
      if (body && typeof body === 'object' && body.action === 'tts') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'TTS_UNAVAILABLE',
              message: 'Server text-to-speech is unavailable. Falling back to device speech.',
              requestId: 'e2e-tts-503',
              details: { attempted: ['azure', 'gemini'] },
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

    const input = page.getByPlaceholder('Type in Portuguese...');
    await input.fill('Olá');
    const sendButton = page.locator('div.absolute.bottom-0 button').last();
    await expect(sendButton).toBeEnabled();
    await sendButton.click();
    coverage.touch('tutor.chat.send_message', 'outcome-asserted');

    // AI reply arrives with a per-message "Listen" control.
    await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible({ timeout: 15_000 });
    const listen = page.getByRole('button', { name: 'Listen' }).first();
    await expect(listen).toBeVisible();
    await listen.click();
    coverage.touch('tutor.model.listen', 'outcome-asserted');

    // Device speech was used as the fallback (server TTS 503 was retried then degraded).
    await expect
      .poll(() => page.evaluate(() => (window.__spokenTexts ?? []).length), { timeout: 25_000 })
      .toBeGreaterThan(0);

    // And crucially: NO error toast (the degradation is silent-but-audible, WARN-logged only).
    await expect(page.getByText(/\(Ref: /)).toHaveCount(0);
  });
});
