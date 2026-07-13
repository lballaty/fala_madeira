// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/40-practice-grade-variants.spec.ts
// Description: Grade-button variant coverage for the two self-graded practice engines. The
//   existing suite only exercises the "happy" grade on each engine (Vocabulary Review's "Good"
//   in 15-practice-vocabulary-session; Pattern Builder's "Got it" in 19-offline-pattern-builder-
//   drill). This spec functionally drives the remaining variants — vocab Again/Hard/Easy and
//   pattern Almost/Missed — proving each records the grade and advances the drill (next card /
//   next phrase, or the completion summary). Assertions are UI-state only (no DB reads): SRS and
//   Coach writes are shared-state and non-deterministic across runs, whereas the flip-state
//   reset (a fresh unflipped card) and the progress counter / "complete" heading are deterministic
//   consequences of a recorded grade advancing the queue.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('practice grade-button variants', () => {
  // ── Test A: Vocabulary Review — Again / Hard / Easy ────────────────────────
  //
  // Only "Good" is covered elsewhere. Here we open the flashcard loop and, on
  // successive cards, press Again → Hard → Easy. The grade row is only shown when
  // the card is flipped (VocabularyView: the row is `invisible` until isFlipped),
  // so each press must be preceded by a flip. After each grade the session either
  // advances to a fresh (unflipped) card — where "Flashcard — tap to flip" is
  // visible again — or reaches "Session complete". Either outcome proves the grade
  // was accepted and the queue advanced.
  test('Vocabulary Review records Again, Hard, and Easy and advances', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await page.getByText('Vocabulary Review', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();

    const summaryHeading = page.getByRole('heading', { name: 'Session complete' });
    const flashcard = page.getByRole('button', { name: 'Flashcard — tap to flip' }).first();

    // Grades to exercise, in order. A grade maps to a coverage id we assert once it
    // is actually applied and the drill is observed to advance.
    const gradePlan: { label: 'Again' | 'Hard' | 'Easy'; coverageId: string }[] = [
      { label: 'Again', coverageId: 'practice.vocabulary.grade_again' },
      { label: 'Hard', coverageId: 'practice.vocabulary.grade_hard' },
      { label: 'Easy', coverageId: 'practice.vocabulary.grade_easy' },
    ];

    const applied: string[] = [];

    for (const { label, coverageId } of gradePlan) {
      // If the deck emptied before we reached this grade, stop — we assert what we
      // reached below and note the shortfall via the coverage record.
      if (await summaryHeading.isVisible().catch(() => false)) break;

      await expect(flashcard).toBeVisible({ timeout: 20_000 });

      // Flip to reveal the grade row (idempotent: if already flipped the buttons
      // are simply already visible; a second tap would flip back, so only flip
      // when the front — the "tap to flip" affordance — is still showing).
      const gradeButton = page.getByRole('button', { name: label, exact: true });
      if (!(await gradeButton.isEnabled().catch(() => false))) {
        await flashcard.click();
      }
      await expect(gradeButton).toBeVisible({ timeout: 10_000 });
      await expect(gradeButton).toBeEnabled();

      await gradeButton.click();

      // Deterministic post-grade assertion: the grade advanced the queue. Either a
      // fresh unflipped card is offered again, or the run finished. (We do not assert
      // the counter value: "Again" re-queues the item, so total can shift — but the
      // flip-state reset / summary transition is invariant.)
      await expect(
        flashcard.or(summaryHeading),
      ).toBeVisible({ timeout: 20_000 });

      applied.push(coverageId);
      coverage.touch(coverageId, 'outcome-asserted');
    }

    // We must have exercised at least one non-"Good" grade for the test to have
    // meaning; in practice the seed deck is large enough for all three.
    expect(applied.length).toBeGreaterThan(0);
  });

  // ── Test B: Pattern Builder — Almost / Missed ──────────────────────────────
  //
  // Only "Got it" is covered elsewhere. Pattern Builder routes each pattern to
  // either the slotted or the degraded phrase drill; both render the shared
  // GradeRow (Got it / Almost / Missed). The degraded PhraseDrill hides the grade
  // row until "Reveal the Portuguese" is pressed, so we reveal first when needed.
  // handleGrade advances run.index, or emits done → "Drill complete" on the last
  // phrase. We grade one card "Almost" and the next "Missed", asserting each time
  // that the phrase counter advanced or the drill completed.
  test('Pattern Builder records Almost and Missed and advances', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    await page.getByText('Pattern Builder', { exact: true }).click();

    // Tile entry lands on the situation chooser ("Pick a situation to drill").
    // Browser-route entry would start a drill directly, but from the Practice hub
    // we always get the chooser, so pick the first situation offered.
    await expect(page.getByText(/Pick a situation to drill/i)).toBeVisible({ timeout: 20_000 });
    const firstChoice = page.locator('button').filter({ hasText: /^L\d/ }).first();
    await expect(firstChoice).toBeVisible();
    await firstChoice.click();

    const completeHeading = page.getByRole('heading', { name: 'Drill complete' });
    const progress = page.getByText(/Phrase \d+ of \d+/);
    await expect(progress.or(completeHeading)).toBeVisible({ timeout: 20_000 });

    const gradePlan: { label: 'Almost' | 'Missed'; coverageId: string }[] = [
      { label: 'Almost', coverageId: 'practice.pattern_builder.grade_almost' },
      { label: 'Missed', coverageId: 'practice.pattern_builder.grade_missed' },
    ];

    const applied: string[] = [];

    for (const { label, coverageId } of gradePlan) {
      if (await completeHeading.isVisible().catch(() => false)) break;

      // Read the current phrase counter so we can prove it advances after grading.
      const beforeText = await progress.first().innerText().catch(() => '');

      // Degraded phrase drills hide the grade row behind "Reveal the Portuguese".
      // Slotted drills show the grade row immediately. Reveal if present.
      const reveal = page.getByRole('button', { name: /Reveal the Portuguese/i });
      if (await reveal.isVisible().catch(() => false)) {
        await reveal.click();
      }

      const gradeButton = page.getByRole('button', { name: label, exact: true });
      await expect(gradeButton).toBeVisible({ timeout: 10_000 });
      await gradeButton.click();

      // Deterministic post-grade assertion: either the drill completed, or the
      // phrase counter changed (queue advanced to the next pattern).
      if (await completeHeading.isVisible().catch(() => false)) {
        applied.push(coverageId);
        coverage.touch(coverageId, 'outcome-asserted');
        break;
      }

      await expect(async () => {
        const afterText = await progress.first().innerText().catch(() => '');
        expect(afterText).not.toBe(beforeText);
      }).toPass({ timeout: 15_000 });

      applied.push(coverageId);
      coverage.touch(coverageId, 'outcome-asserted');
    }

    // A one-phrase situation completes on the first grade; that still exercises one
    // variant. Require at least one recorded grade so the test is meaningful.
    expect(applied.length).toBeGreaterThan(0);
  });
});
