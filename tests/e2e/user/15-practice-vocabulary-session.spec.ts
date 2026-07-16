// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/15-practice-vocabulary-session.spec.ts
// Description: Vocabulary Review regression coverage. Exercises a real flashcard loop through a
//   SITUATION-SCOPED deck (Browse situations → Vocabulary), including flip, grade buttons, audio
//   chrome, and the completion summary. Situation-scoped entry is required since EN-16 (b351bbe):
//   sessions scale to their scope, so the hub's default "All lessons" deck is the full inventory
//   (1000+ cards) and never reaches the summary inside a bounded loop.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('practice vocabulary session', () => {
  test('Vocabulary Review supports flip, grading, and summary actions', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();

    // Enter through a single situation so the EN-16 scope is "This lesson" — a deck small
    // enough (situation vocabulary only) for the grading loop to finish and reach the summary.
    await page.getByRole('button', { name: 'Browse situations' }).click();
    await expect(page.getByRole('heading', { name: 'Situations' })).toBeVisible();
    const firstSituation = page.locator('button[aria-expanded]').first();
    await expect(firstSituation).toBeVisible({ timeout: 20_000 });
    await firstSituation.click();
    await expect(page.getByText('Practice this with…')).toBeVisible();
    await page.getByRole('button', { name: 'Vocabulary Review' }).click();

    await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();

    const summaryHeading = page.getByRole('heading', { name: 'Session complete' });
    for (let step = 0; step < 25; step += 1) {
      if (await summaryHeading.isVisible().catch(() => false)) break;

      const flashcard = page.getByRole('button', { name: 'Flashcard — tap to flip' }).first();
      await expect(flashcard).toBeVisible({ timeout: 20_000 });

      const playWord = page.getByRole('button', { name: 'Play the word' }).first();
      if (await playWord.isVisible().catch(() => false)) {
        await playWord.click();
      }

      // Click near the card's top-left corner, NOT the center: the front face centers the word
      // beside a 44px nested "Play the word" SpeakerButton that stopPropagation()s. For short
      // words (e.g. "Ali") the card's center point lands ON that button, so a center click
      // plays audio instead of flipping — deterministic failure at that card. The corner is
      // always the flip surface.
      await flashcard.click({ position: { x: 20, y: 20 } });

      const goodButton = page.getByRole('button', { name: 'Good' });
      await expect(goodButton).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Again' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Hard' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Easy' })).toBeVisible();
      await goodButton.click();
    }

    await expect(summaryHeading).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Review again' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();

    // Deepen practice.vocabulary.done beyond presence: Done calls onExit and returns to the
    // Practice hub. (Review again — which restarts a fresh session loop — stays presence-only
    // here: both summary actions navigate away, so exercising it too would require a second
    // full grading loop; deferred to keep suite runtime bounded.)
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(summaryHeading).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();
    coverage.touch('practice.vocabulary.done', 'outcome-asserted');
  });
});
