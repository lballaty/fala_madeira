// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/15-practice-vocabulary-session.spec.ts
// Description: Vocabulary reinforcement QUIZ regression (EN-18). Exercises the objective typed-answer
//   loop through a SITUATION-SCOPED deck (Browse situations → Vocabulary Review): type the meaning →
//   Check → (skip the mic step) → app-derived feedback (SUCCESS/FAILURE + return timing) → next, to
//   the completion summary. A wrong answer yields FAILURE (meaning missed, returns ~1 day); the
//   correct meaning (read from the test-only data-answer hint) yields SUCCESS. Situation-scoped entry
//   keeps the deck small enough to finish (the hub deck is progress-wide). The live mic step is
//   manual-verified — here we always Skip speaking so the flow is comprehension-only and deterministic
//   regardless of whether the preview browser exposes speech recognition.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('practice vocabulary session', () => {
  test('Vocabulary quiz grades typed answers and reaches the summary', async ({ page, coverage }) => {
    // Expose the expected meaning on the answer input so the typed flow is deterministic
    // (prod-safe: the app only reads this flag under test).
    await page.addInitScript(() => {
      try {
        localStorage.setItem('fm:e2e', '1');
      } catch {
        /* ignore */
      }
    });

    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();

    // Enter through a single situation so the deck is that lesson's vocabulary — small enough for
    // the grading loop to finish and reach the summary (the hub deck spans all worked-on themes).
    await page.getByRole('button', { name: 'Browse situations' }).click();
    await expect(page.getByRole('heading', { name: 'Situations' })).toBeVisible();
    const firstSituation = page.locator('button[aria-expanded]').first();
    await expect(firstSituation).toBeVisible({ timeout: 20_000 });
    await firstSituation.click();
    await expect(page.getByText('Practice this with…')).toBeVisible();
    await page.getByRole('button', { name: 'Vocabulary Review' }).click();

    await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();

    const summaryHeading = page.getByRole('heading', { name: 'Session complete' });
    const feedback = page.getByTestId('vocab-feedback');
    let sawSuccess = false;
    let sawFailure = false;

    for (let step = 0; step < 30; step += 1) {
      if (await summaryHeading.isVisible().catch(() => false)) break;

      const input = page.getByTestId('vocab-answer-input');
      await expect(input).toBeVisible({ timeout: 20_000 });

      // First card: type a deliberately wrong answer → FAILURE. Every other card: type the correct
      // meaning from the test-only hint → SUCCESS.
      const expected = await input.getAttribute('data-answer');
      expect(expected, 'data-answer hint must be exposed under fm:e2e').toBeTruthy();
      const typeWrong = step === 0;
      await input.fill(typeWrong ? 'zzqqxx-not-a-word' : (expected ?? ''));
      await page.getByTestId('vocab-check').click();

      // The reveal offers a mic step when recognition is available — always skip it so grading is
      // comprehension-only and deterministic. When it isn't available the flow finalizes directly.
      const sayButton = page.getByTestId('vocab-say');
      if (await sayButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.getByTestId('vocab-skip-speaking').click();
      }

      await expect(feedback).toBeVisible({ timeout: 10_000 });
      const outcome = await feedback.getAttribute('data-outcome');
      if (typeWrong) {
        expect(outcome).toBe('failure');
        await expect(feedback).toContainText('✗ meaning');
        await expect(feedback).toContainText('back in');
        sawFailure = true;
      } else if (outcome === 'success') {
        await expect(feedback).toContainText('✓ meaning');
        sawSuccess = true;
      }

      await page.getByTestId('vocab-next').click();
    }

    expect(sawFailure, 'a wrong answer should be graded FAILURE').toBe(true);
    expect(sawSuccess, 'a correct answer should be graded SUCCESS').toBe(true);

    await expect(summaryHeading).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('vocab-summary-success')).not.toHaveText('0');
    await expect(page.getByTestId('vocab-summary-failure')).not.toHaveText('0');
    await expect(page.getByRole('button', { name: 'Review again' })).toBeVisible();

    // Done calls onExit and returns to the Practice hub.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(summaryHeading).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();

    coverage.touch('practice.vocabulary.check', 'outcome-asserted');
    coverage.touch('practice.vocabulary.skipSpeaking', 'outcome-asserted');
    coverage.touch('practice.vocabulary.next', 'outcome-asserted');
    coverage.touch('practice.vocabulary.done', 'outcome-asserted');
  });
});
