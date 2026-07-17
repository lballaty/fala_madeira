// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/13-admin-audio-panel.spec.ts
// Description: EN-23 admin audio-management panel coverage. The render/interaction path needs no DB
//   (clip enumeration is from bundled content), so it always runs: open Admin -> Audio -> Level 0 ->
//   the coverage+signals list renders with rows. The verdict+enqueue DB round-trip needs the
//   tts_audio_* tables from migration 00014 (operator-gated, staging-first), so it self-skips until
//   those tables exist, then marks a clip bad, enqueues it, and asserts a pending regen-queue row.
// Author: claude-en23
// Created: 2026-07-17

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('admin audio panel (EN-23)', () => {
  test('renders the Audio tab clip list for Level 0 (no DB required)', async ({ adminPage }) => {
    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

    await adminPage.getByTestId('admin-tab-audio').click();
    await expect(adminPage.getByTestId('audio-scope-select')).toBeVisible();
    // Default scope is Level 0.
    await expect(adminPage.getByTestId('audio-scope-select')).toHaveValue('0');

    // The list enumerates from bundled content — rows appear without any DB write.
    await expect(adminPage.getByTestId('audio-clip-row').first()).toBeVisible({ timeout: 15_000 });
    const rowCount = await adminPage.getByTestId('audio-clip-row').count();
    expect(rowCount).toBeGreaterThan(0);
    // Server tier is honestly reported as pending until EN-8 lands.
    await expect(adminPage.getByTestId('audio-summary')).toContainText(/pending EN-8/i);
  });

  test('marks a clip bad and enqueues it for regeneration', async ({ adminPage, adminEvidence }) => {
    // Gated: the review/queue tables land with migration 00014 (operator-applied, staging-first).
    const probe = await adminEvidence.from('tts_audio_regen_queue').select('build_key').limit(1);
    test.skip(probe.error != null, 'tts_audio_regen_queue missing — pending migration 00014 apply (operator-gated)');

    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await adminPage.getByTestId('admin-tab-audio').click();
    const firstRow = adminPage.getByTestId('audio-clip-row').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    await firstRow.getByTestId('audio-verdict-bad').click();
    await expect(firstRow).toHaveAttribute('data-verdict', 'bad');

    let enqueuedBuildKey: string | null = null;
    try {
      await firstRow.getByTestId('audio-enqueue').click();
      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('tts_audio_regen_queue')
              .select('build_key, status')
              .eq('status', 'pending')
              .order('enqueued_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            enqueuedBuildKey = data?.build_key ?? null;
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'no pending regen-queue row appeared after enqueue' },
        )
        .toBe('pending');
    } finally {
      if (enqueuedBuildKey) {
        await adminEvidence.from('tts_audio_regen_queue').delete().eq('build_key', enqueuedBuildKey);
        await adminEvidence.from('tts_audio_review').delete().eq('build_key', enqueuedBuildKey);
      }
    }
  });
});
