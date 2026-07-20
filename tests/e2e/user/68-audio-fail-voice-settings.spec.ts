// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/68-audio-fail-voice-settings.spec.ts
// Description: EN-31 WP-F coverage — when audio playback fails outright, the failure toast offers a
//   "Voice settings" action that deep-links to Settings › Voice Provider (scrolled + highlighted).
//   Drives a real tutor chat reply, stubs the tts edge action to a 500 that is NOT TTS_UNAVAILABLE
//   (so it does NOT degrade to device speech — it's a total failure), clicks "Listen", asserts the
//   error toast with its Ref, then clicks "Voice settings" and asserts the highlighted card.
//   Mirrors the audio harness of 50-observability-tts-fallback and the deep-link shape of
//   65-home-level-deeplink.
// Author: Agent A (with owner)
// Created: 2026-07-20

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('audio-failure toast → Voice settings deep-link (EN-31 WP-F)', () => {
  test('a total TTS failure offers a Voice settings action that lands on the Voice Provider card', async ({ page, coverage }) => {
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
        // 500 with a code that is NOT TTS_UNAVAILABLE → the client does NOT degrade to device
        // speech; the error propagates to useSpeechPlayback's failure toast (a genuine total fail).
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'E2E_TTS_FAILURE', message: 'Synthetic total TTS failure', requestId: 'e2e-tts-500' },
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

    // AI reply arrives with a per-message "Listen" control; playing it hits the failing tts action.
    await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible({ timeout: 15_000 });
    const listen = page.getByRole('button', { name: 'Listen' }).first();
    await expect(listen).toBeVisible();
    await listen.click();
    coverage.touch('tutor.model.listen', 'outcome-asserted');

    // The failure toast surfaces the stable copy + its support Ref, and offers "Voice settings".
    await expect(page.getByText(/Couldn't play the audio/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/\(Ref: /)).toBeVisible();
    const voiceSettings = page.getByRole('button', { name: 'Voice settings' });
    await expect(voiceSettings).toBeVisible();

    // Taking it deep-links to Settings and lands on the highlighted Voice Provider card.
    await voiceSettings.click();
    const card = page.getByTestId('voice-provider-card');
    await expect(card).toBeVisible();
    await expect(card.getByText('Voice Provider', { exact: true })).toBeVisible();
    await expect(card.getByLabel('Voice Provider')).toBeVisible();
    coverage.touch('settings.voice_provider.deeplink', 'outcome-asserted');
  });
});
