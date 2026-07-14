// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/49-observability-log-sink-persist.spec.ts
// Description: Wire-level coverage for client error persistence (plan obs-client-sink + obs-log-sink
//   / OBSERVABILITY-CONTRACT §6). Forces an edge-function failure so the client logs an ERROR,
//   then asserts the persist queue flushes that event to the service-role `log-sink` edge function
//   as a batched { events: [...] } payload carrying the correlation IDs. This proves the ERROR
//   class actually reaches the persistence tier (the old direct RLS-gated insert silently dropped
//   many of these). The log-sink response is stubbed so the test needs no deployed function.
// Author: Observability test build-out (with assistant)
// Created: 2026-07-14

import { test, expect, landOnHome } from '../support/fixtures';

interface SinkEvent {
  event_type?: string;
  level?: string;
  session_id?: string;
  request_id?: string;
  correlation_id?: string;
}

test.describe('observability: client → log-sink persistence', () => {
  test('a failed edge call is logged and flushed to the log-sink as batched events', async ({ page, coverage }) => {
    const sinkEvents: SinkEvent[] = [];

    await page.route('**/functions/v1/log-sink', async (route, request) => {
      try {
        const body = request.postDataJSON();
        if (body && Array.isArray(body.events)) sinkEvents.push(...(body.events as SinkEvent[]));
      } catch {
        /* non-JSON body — ignore */
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inserted: 1, requestId: 'e2e-sink-1' }),
      });
    });

    await page.route('**/functions/v1/gemini', async (route, request) => {
      const body = request.postDataJSON();
      if (body && typeof body === 'object' && body.action === 'chat') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'E2E_FORCED_FAILURE', message: 'Forced failure for log-sink test', requestId: 'e2e-req-1' },
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

    // The error toast confirms the failure was surfaced to the user (dual-surface contract).
    await expect(page.getByText(/\(Ref: /)).toBeVisible({ timeout: 15_000 });

    // …and the same class of event must reach the persistence tier. Flush is timer-batched
    // (config.logging.flushIntervalMs), so allow generous time.
    await expect
      .poll(() => sinkEvents.some((e) => e.event_type === 'edge_fn_failed'), { timeout: 30_000 })
      .toBe(true);

    const persisted = sinkEvents.find((e) => e.event_type === 'edge_fn_failed')!;
    expect(persisted.level).toBe('ERROR');
    expect(persisted.session_id).toBeTruthy();
    expect(persisted.correlation_id).toBeTruthy();
  });
});
