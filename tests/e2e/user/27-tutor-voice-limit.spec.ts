// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/27-tutor-voice-limit.spec.ts
// Description: Tutor voice-limit enforcement coverage. Seeds the throwaway profile at its daily
//   mic limit, opens the tutor practice modal, and asserts the user-facing guardrail message
//   appears instead of starting recording.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('tutor voice-limit enforcement', () => {
  test('recording is blocked with a clear toast when the daily voice limit is exhausted', async ({
    page,
    userEvidence,
    testUser,
  }) => {
    const { data: beforeProfile, error: beforeError } = await userEvidence
      .from('profiles')
      .select('voice_limit, voice_usage_today, last_voice_usage_date, subscription_tier, role')
      .eq('id', testUser.userId)
      .single();
    if (beforeError) throw beforeError;

    const today = new Date().toISOString().split('T')[0];
    const original = {
      voice_limit: beforeProfile?.voice_limit ?? null,
      voice_usage_today: beforeProfile?.voice_usage_today ?? 0,
      last_voice_usage_date: beforeProfile?.last_voice_usage_date ?? null,
      subscription_tier: beforeProfile?.subscription_tier ?? 'free',
      role: beforeProfile?.role ?? 'user',
    };
    const { error: seedError } = await userEvidence
      .from('profiles')
      .update({
        voice_limit: 1,
        voice_usage_today: 1,
        last_voice_usage_date: today,
        subscription_tier: 'free',
        role: 'user',
      })
      .eq('id', testUser.userId);
    if (seedError) throw seedError;

    try {
      await landOnHome(page);
      await page.getByRole('button', { name: 'Tutor' }).first().click();
      await page.getByRole('button', { name: /Start Today's Lesson/i }).click();

      const tutorDialog = page.getByRole('dialog', { name: /AI .* Tutor/i });
      await expect(tutorDialog).toBeVisible();
      await tutorDialog.getByRole('button', { name: 'Start recording' }).click();

      await expect(page.getByText(/Daily voice limit \(1\) reached/i)).toBeVisible({ timeout: 15_000 });
      await expect(tutorDialog.getByRole('button', { name: 'Start recording' })).toBeVisible();
    } finally {
      await userEvidence
        .from('profiles')
        .update({
          voice_limit: original.voice_limit,
          voice_usage_today: original.voice_usage_today,
          last_voice_usage_date: original.last_voice_usage_date,
          subscription_tier: original.subscription_tier,
          role: original.role,
        })
        .eq('id', testUser.userId);
    }
  });
});
