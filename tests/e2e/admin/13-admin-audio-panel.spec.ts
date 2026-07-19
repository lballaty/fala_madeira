// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/13-admin-audio-panel.spec.ts
// Description: EN-23 + EN-23b admin audio-management panel coverage. The render/interaction path needs
//   no DB (clip enumeration is from bundled content), so it always runs: open Admin -> Audio -> Level 0.
//   EN-23b assertions: the first load is a BOUNDED page (W3), the server tier is reported honestly (no
//   hardwired "pending EN-8" — W1), play works for ANY clip via synthesis with the size then shown
//   (W2 + W4). The verdict+enqueue DB round-trip (no-regression, acceptance #5) needs the tts_audio_*
//   tables from migration 00014 (operator-gated, staging-first), so it self-skips until those exist.
// Author: claude-en23 (EN-23b coverage by claude-en23b)
// Created: 2026-07-17. Updated: 2026-07-19.

import { test, expect, landOnHome } from '../support/fixtures';

const PAGE_SIZE = 25; // mirrors config.audio.reviewPageSize

// Route the EN-8 server-tier probes to a fast 404 so the panel loads deterministically (honest
// "server: no") without depending on whether the local preview host SPA-falls-back /audio or how the
// public Supabase bucket responds. Keeps W1/W3 assertions env-independent and fast.
async function stubServerTierMisses(page: Parameters<typeof landOnHome>[0]): Promise<void> {
  await page.route('**/audio/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/storage/v1/object/public/tts-audio/**', (route) => route.fulfill({ status: 404, body: '' }));
}

test.describe('admin audio panel (EN-23 / EN-23b)', () => {
  test('renders a bounded first page with an honest server tier (W1 + W3)', async ({ adminPage }) => {
    await stubServerTierMisses(adminPage);
    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

    await adminPage.getByTestId('admin-tab-audio').click();
    await expect(adminPage.getByTestId('audio-scope-select')).toBeVisible();
    await expect(adminPage.getByTestId('audio-scope-select')).toHaveValue('0');

    // Rows enumerate from bundled content — no DB write needed.
    await expect(adminPage.getByTestId('audio-clip-row').first()).toBeVisible({ timeout: 30_000 });
    const rowCount = await adminPage.getByTestId('audio-clip-row').count();
    expect(rowCount).toBeGreaterThan(0);
    // W3: the first load is bounded to one page — it does not enumerate + probe the whole scope.
    expect(rowCount).toBeLessThanOrEqual(PAGE_SIZE);

    // W1: the server tier is no longer hardwired to "pending EN-8"; it reads the real config and
    // reports an honest per-clip badge (here "server: no", since the probes are stubbed to 404).
    await expect(adminPage.getByTestId('audio-summary')).not.toContainText(/pending EN-8/i);
    await expect(adminPage.getByTestId('audio-clip-row').first()).toContainText(/server:/i);

    // W3: when the scope exceeds one page the count reads "N of M" and a Load more control appears.
    const countText = (await adminPage.getByTestId('audio-count').textContent()) ?? '';
    if (/of \d+/.test(countText)) {
      await expect(adminPage.getByTestId('audio-load-more')).toBeVisible();
      const before = await adminPage.getByTestId('audio-clip-row').count();
      await adminPage.getByTestId('audio-load-more').click();
      await expect
        .poll(async () => adminPage.getByTestId('audio-clip-row').count(), { timeout: 30_000 })
        .toBeGreaterThan(before);
    }
  });

  test('plays any clip via synthesis and shows its size (W2 + W4)', async ({ adminPage }) => {
    await stubServerTierMisses(adminPage);
    // Deterministic W2: intercept the TTS edge call so play never depends on the live provider/quota
    // (EF-37 server TTS 503). Return a small PCM payload; getPlaybackUrl decodes it into a playable
    // buffer and the row then shows its byte size (W4).
    const pcmBase64 = Buffer.from(new Uint8Array(64)).toString('base64');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    await adminPage.route('**/functions/v1/ai-gateway', (route) => {
      // supabase-js invoke is a non-simple POST → a CORS preflight precedes it; answer both.
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ audio: pcmBase64, requestId: 'e2e-mock' }),
      });
    });

    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await adminPage.getByTestId('admin-tab-audio').click();
    const firstRow = adminPage.getByTestId('audio-clip-row').first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });

    // W2: the play button is enabled for a clip that is NOT device-cached (the old build disabled it).
    const playBtn = firstRow.getByTestId('audio-play');
    await expect(playBtn).toBeEnabled();
    await playBtn.click();

    // W4: once fetched, the clip's size renders regardless of prior device scoring (64 B here).
    await expect(firstRow.getByTestId('audio-size')).toBeVisible({ timeout: 30_000 });
    await expect(firstRow.getByTestId('audio-size')).toContainText(/size:/i);
  });

  test('marks a clip bad and enqueues it for regeneration', async ({ adminPage, adminEvidence }) => {
    // Gated: the review/queue tables land with migration 00014 (operator-applied, staging-first).
    const probe = await adminEvidence.from('tts_audio_regen_queue').select('build_key').limit(1);
    test.skip(probe.error != null, 'tts_audio_regen_queue missing — pending migration 00014 apply (operator-gated)');

    await stubServerTierMisses(adminPage); // this test does not exercise the server tier — keep load fast/deterministic
    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await adminPage.getByTestId('admin-tab-audio').click();
    const firstRow = adminPage.getByTestId('audio-clip-row').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    // Deterministic + isolated: target a specific clip by its build_key, and pre-clean any residue
    // for it (from a prior run / another admin) so the enqueue control is enabled and the assertion
    // is unambiguous. Without this the "first row" could already be Queued (button disabled).
    const targetKey = (await firstRow.getAttribute('data-build-key'))!;
    expect(targetKey).toBeTruthy();
    // The regen queue is append/update-only: admins have SELECT/INSERT/UPDATE but NOT DELETE
    // (migration 00014 — a durable log guarded by a unique LIVE-status index; done/failed rows are
    // retained so re-enqueue is allowed). A DELETE here is SILENTLY RLS-blocked and would leak a
    // permanent pending row that disables the enqueue control on every later run — this was EF-38.
    // Retire any LIVE (pending/claimed) entry via UPDATE instead, so `queued` clears and enqueue is
    // enabled. The verdict row is left as-is (setVerdict upserts; a stale verdict is harmless).
    const cleanup = async () => {
      await adminEvidence
        .from('tts_audio_regen_queue')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('build_key', targetKey)
        .in('status', ['pending', 'claimed']);
    };
    await cleanup(); // pre-clean

    try {
      // Reflect the cleaned DB state in the UI, then re-acquire the row by its exact key.
      await adminPage.getByTestId('audio-reload').click();
      const row = adminPage.locator(`[data-testid="audio-clip-row"][data-build-key="${targetKey}"]`);
      await expect(row).toBeVisible({ timeout: 15_000 });

      await row.getByTestId('audio-verdict-bad').click();
      await expect(row).toHaveAttribute('data-verdict', 'bad');

      await expect(row.getByTestId('audio-enqueue')).toBeEnabled();
      await row.getByTestId('audio-enqueue').click();

      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('tts_audio_regen_queue')
              .select('status')
              .eq('build_key', targetKey)
              .eq('status', 'pending')
              .maybeSingle();
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'no pending regen-queue row appeared for the target clip after enqueue' },
        )
        .toBe('pending');

      // The verdict persisted too (round-trip through tts_audio_review).
      const { data: review } = await adminEvidence
        .from('tts_audio_review')
        .select('verdict')
        .eq('build_key', targetKey)
        .maybeSingle();
      expect(review?.verdict).toBe('bad');
    } finally {
      await cleanup();
    }
  });
});
