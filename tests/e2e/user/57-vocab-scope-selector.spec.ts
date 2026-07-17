// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/57-vocab-scope-selector.spec.ts
// Description: EN-18 (folds in the EN-16 scope regression). The hub Vocabulary Review screen sources
//   from the situations the learner has WORKED ON and states its scope + word count (so a deck never
//   reads as "general"), letting the learner narrow by theme/category in-place. With one started
//   situation seeded, the focus picker is present with an "All started (N)" chip, the header names
//   the scope + word count, and switching to the theme chip re-scopes the deck. (Pool construction +
//   grouping are unit-covered in sourcing.test.ts; scope→session scaling in buildSessionCards.test.ts.)
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';

const STARTED_SITUATION_ID = 'sit-d1-greetings-presence';

test.describe('vocabulary review: theme focus picker (EN-18)', () => {
  test('names the scope + word count and offers an in-screen theme focus picker', async ({ page, userEvidence, testUser, coverage }) => {
    // Seed one WORKED-ON situation so the progress-aware pool is non-empty (a fresh user has no
    // started themes → the honest "Nothing to review yet" state, which carries no picker).
    const { error: seedError } = await userEvidence.from('user_situation_progress').upsert(
      {
        user_id: testUser.userId,
        situation_id: STARTED_SITUATION_ID,
        mode: 'review',
        status: 'completed',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,situation_id,mode' },
    );
    if (seedError) throw seedError;

    try {
      await landOnHome(page);
      await page.getByRole('button', { name: 'Practice' }).first().click();
      await page.getByText('Vocabulary Review', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();

      // The focus picker is present with an "All started (N)" chip (word count in parentheses).
      const picker = page.getByTestId('vocab-focus-picker');
      await expect(picker).toBeVisible({ timeout: 20_000 });
      await expect(picker.getByRole('button', { name: /All started \(\d+\)/ })).toBeVisible();

      // The header states the scope + word count — never a bare "general" screen.
      await expect(page.getByTestId('vocab-scope').first()).toContainText(/All started · \d+ words/);

      // Switching to the theme chip re-scopes the deck (the header no longer reads "All started").
      const chips = picker.getByRole('button');
      await expect(chips).toHaveCount(2); // All started + one theme (greetings' category)
      await chips.nth(1).click();
      await expect(page.getByTestId('vocab-scope').first()).not.toContainText('All started ·');

      coverage.touch('practice.vocab.focus_picker', 'outcome-asserted');
    } finally {
      await userEvidence
        .from('user_situation_progress')
        .delete()
        .eq('user_id', testUser.userId)
        .eq('situation_id', STARTED_SITUATION_ID)
        .eq('mode', 'review');
    }
  });
});
