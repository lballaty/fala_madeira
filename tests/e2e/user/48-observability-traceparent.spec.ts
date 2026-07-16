// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/48-observability-traceparent.spec.ts
// Description: Wire-level coverage for W3C trace context (plan obs-trace / OBSERVABILITY-CONTRACT
//   §8). Asserts the client attaches a well-formed `traceparent` header to every edge-function
//   invoke so a single flow can be reconstructed across client → edge → DB. Drives a real tutor
//   chat send and inspects the outgoing request header. The gemini call is fulfilled locally so
//   the test does not depend on the live AI backend.
// Author: Observability test build-out (with assistant)
// Created: 2026-07-14

import { test, expect, landOnHome } from '../support/fixtures';

const TRACEPARENT_RE = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

test.describe('observability: W3C traceparent propagation', () => {
  test('edge-function invokes carry a well-formed traceparent header', async ({ page, coverage }) => {
    let seenTraceparent: string | null = null;

    await page.route('**/functions/v1/ai-gateway', async (route, request) => {
      const body = request.postDataJSON();
      if (body && typeof body === 'object' && body.action === 'chat') {
        seenTraceparent = request.headers()['traceparent'] ?? null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ text: 'Olá! Como posso ajudar?', requestId: 'e2e-trace-1' }),
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
    coverage.touch('tutor.chat.input', 'value-changed');

    const sendButton = page.locator('div.absolute.bottom-0 button').last();
    await expect(sendButton).toBeEnabled();
    await sendButton.click();
    coverage.touch('tutor.chat.send_message', 'outcome-asserted');

    await expect.poll(() => seenTraceparent, { timeout: 15_000 }).not.toBeNull();
    expect(seenTraceparent).toMatch(TRACEPARENT_RE);
  });
});
