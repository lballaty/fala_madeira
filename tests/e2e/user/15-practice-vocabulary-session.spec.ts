// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/15-practice-vocabulary-session.spec.ts
// Description: Vocabulary Review regression coverage. Exercises a real flashcard loop from the
//   Practice hub, including flip, grade buttons, audio chrome, and the completion summary.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('practice vocabulary session', () => {
  test('Vocabulary Review supports flip, grading, and summary actions', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await page.getByText('Vocabulary Review', { exact: true }).click();

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

      await flashcard.click();

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
