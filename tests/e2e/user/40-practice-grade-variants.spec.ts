// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/40-practice-grade-variants.spec.ts
// Description: Grade-button variant coverage for the Pattern Builder self-graded engine. Drives the
//   non-"happy" grades — Almost / Missed — proving each records the grade and advances the drill
//   (next phrase or the completion summary). Assertions are UI-state only (no DB reads): SRS/Coach
//   writes are shared, non-deterministic state, whereas the phrase counter / "complete" heading are
//   deterministic consequences of a recorded grade advancing the queue.
//   NOTE (EN-18): the former Vocabulary Review grade-variant test (Again/Hard/Easy self-grade
//   buttons) was removed — the vocab engine is now an OBJECTIVE quiz (type the meaning + say it),
//   with no self-grade row. That flow is covered by 15-practice-vocabulary-session.spec.ts.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('practice grade-button variants', () => {
  // ── Pattern Builder — Almost / Missed ──────────────────────────────────────
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
