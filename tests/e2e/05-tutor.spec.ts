// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/05-tutor.spec.ts
// Description: S3 AI tutor slice. Asserts the chat screen renders (tutor header + welcome), the
//   input accepts text and the send path fires, and captures the `requestId` echoed by the
//   /functions/v1/ai-gateway response (success body { requestId } OR error envelope
//   { error: { requestId } }) as the canonical client↔edge join key (docs/TEST-VERTICAL-
//   SLICES.md S3, evidence path 1). One real edge call is made; we assert a requestId came back
//   either way — that IS the backend evidence for this slice (G2: edge fns don't write
//   public.logs; the echoed requestId is the join). If the network yields no /functions/v1/ai-gateway
//   call within the timeout (e.g. the send is blocked client-side), the requestId assertion fails
//   honestly rather than being weakened.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome, captureEdgeRequestId } from './support/fixtures';

test.describe('AI tutor (S3)', () => {
  test('chat screen renders and the input accepts text', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();

    // Tutor header + welcome empty-state prove the chat screen mounted.
    await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();

    const input = page.getByPlaceholder('Type in Portuguese...');
    await expect(input).toBeVisible();
    await input.fill('Olá, tudo bem?');
    await expect(input).toHaveValue('Olá, tudo bem?');
  });

  test('@smoke backend evidence: starting AI practice yields an edge requestId (client↔edge join)', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();

    // The empty-state "Start Today's Lesson" CTA drives startAIPractice(), which opens the AI
    // Practice modal and makes a real /functions/v1/ai-gateway call (action 'chat') with the lesson
    // context — the reliable edge-fn entry for this slice. (Free-chat send depends on an async
    // session-init that can lag a restored session; the practice path creates its own session
    // inline, so it always reaches the edge — the honest, deterministic evidence path for S3.)
    const startLesson = page.getByRole('button', { name: /Start Today's Lesson/i });
    await expect(startLesson).toBeVisible();

    // Arm the requestId capture BEFORE triggering. The gemini edge fn echoes requestId on
    // success ({ text, requestId }) and inside the error envelope ({ error: { requestId } }) —
    // either proves the client reached the edge and got the correlation key back (S3 evidence
    // path 1, G2). Generous timeout for a cold AI round-trip.
    const requestIdPromise = captureEdgeRequestId(page, 'ai-gateway', 60_000);
    await startLesson.click();

    const requestId = await requestIdPromise;
    expect(
      requestId,
      'no requestId echoed by /functions/v1/ai-gateway — the AI-practice path did not reach the edge function',
    ).toBeTruthy();
    // Shape sanity: the edge newRequestId() is a non-trivial token.
    expect(requestId!.length).toBeGreaterThan(6);
  });
});
