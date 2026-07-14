// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/42-quiz-controls.spec.ts
// Description: Functional coverage for the Quiz controls that lacked inventory coverage:
//   the "Type the answer..." input, the "Play audio" button (pattern/translation questions),
//   and the "Close quiz" control. Reaches a quiz via Learning -> lesson -> Start Practice Quiz,
//   probes generically for the typed-input vs multiple-choice state (never relies on question
//   ordering), and asserts deterministic immediate responses.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('quiz controls', () => {
  test('type-the-answer input, play-audio button, and close-quiz control behave deterministically', async ({
    page,
    coverage,
  }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await firstLesson.click();
      if (await page.getByRole('heading', { name: 'Lesson Details' }).isVisible().catch(() => false)) break;
      await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();

    await page.getByRole('button', { name: 'Start Practice Quiz' }).click();
    const quizHeading = page.getByRole('heading', { name: /Quiz:/i });
    await expect(quizHeading).toBeVisible();
    const quizSurface = quizHeading.locator('xpath=ancestor::div[contains(@class,"fixed")]').first();

    const readActiveQuizIndex = async () => {
      const progressDots = quizSurface.locator('header div.flex.space-x-1 > div');
      const count = await progressDots.count();
      for (let index = 0; index < count; index += 1) {
        const className = await progressDots.nth(index).getAttribute('class');
        if (className?.includes('bg-ios-blue/30')) return index;
      }
      return -1;
    };

    const waitForFreshQuestionState = async (previousIndex: number) => {
      await expect
        .poll(
          async () => {
            const currentIndex = await readActiveQuizIndex();
            if (currentIndex === previousIndex) return `stale-index:${currentIndex}`;

            const answerInput = quizSurface.getByPlaceholder('Type the answer...');
            if (await answerInput.isVisible().catch(() => false)) {
              const isEnabled = await answerInput.isEnabled().catch(() => false);
              const inputValue = await answerInput.inputValue().catch(() => '');
              return isEnabled && inputValue === '' ? `typed:${currentIndex}` : `typed-wait:${currentIndex}`;
            }

            const firstChoice = quizSurface.locator('div.grid').getByRole('button').first();
            const className = (await firstChoice.getAttribute('class').catch(() => '')) ?? '';
            const nextEnabled = await quizSurface
              .getByRole('button', { name: /Next Question|Finish Quiz/ })
              .isEnabled()
              .catch(() => false);
            const choiceReset =
              !className.includes('bg-green-50') &&
              !className.includes('bg-red-50') &&
              !className.includes('opacity-50');
            return choiceReset && !nextEnabled ? `choice:${currentIndex}` : `choice-wait:${currentIndex}`;
          },
          {
            timeout: 10_000,
            message: `Quiz did not reach a fresh unanswered state after advancing from index ${previousIndex}.`,
          },
        )
        .toMatch(/^(typed|choice):/);
    };

    // Advance generically until we land on a typed (translation/pattern) question, which is the
    // only state that surfaces both the "Type the answer..." input and the "Play audio" button.
    // Never relies on question ordering — probes the state exactly like the existing quiz helper.
    let reachedTypedQuestion = false;
    for (let step = 0; step < 5 && !reachedTypedQuestion; step += 1) {
      const answerInput = quizSurface.getByPlaceholder('Type the answer...');
      if (await answerInput.isVisible().catch(() => false)) {
        reachedTypedQuestion = true;
        break;
      }

      // Multiple-choice question — answer it and advance to the next fresh state.
      const firstChoice = quizSurface.locator('div.grid').getByRole('button').first();
      await expect(firstChoice).toBeVisible();
      const previousIndex = await readActiveQuizIndex();
      await firstChoice.click();
      const nextButton = quizSurface.getByRole('button', { name: /Next Question|Finish Quiz/ });
      await expect(nextButton).toBeEnabled();
      const finishVisible = await quizSurface
        .getByRole('button', { name: 'Finish Quiz' })
        .isVisible()
        .catch(() => false);
      if (finishVisible) break; // last question was multiple-choice; no typed question in this quiz
      await nextButton.click();
      await waitForFreshQuestionState(previousIndex);
    }

    expect(reachedTypedQuestion, 'quiz surfaced a typed "Type the answer..." question').toBe(true);

    // --- Type the answer input: fill it and assert the value is accepted. ---
    const answerInput = quizSurface.getByPlaceholder('Type the answer...');
    await expect(answerInput).toBeEnabled();
    const typedValue = 'resposta e2e';
    await answerInput.fill(typedValue);
    await expect(answerInput).toHaveValue(typedValue);
    coverage.touch('learning.quiz.answer_input', 'value-changed');

    // --- Play audio: the pattern/translation question renders a "Play audio" button. Clicking it
    // calls playSpeech(answer). There is NO visible playing indicator in the DOM (fire-and-forget
    // TTS), so the deterministic immediate assertion is: the button is enabled, and clicking it
    // neither throws nor navigates away from the quiz surface. ---
    const playAudio = quizSurface.getByRole('button', { name: 'Play audio' });
    await expect(playAudio).toBeVisible();
    await expect(playAudio).toBeEnabled();
    await playAudio.click();
    await expect(playAudio).toBeEnabled(); // still mounted; click did not tear down the surface
    await expect(quizHeading).toBeVisible(); // did not navigate away from the quiz
    await expect(answerInput).toHaveValue(typedValue); // typed input state preserved through audio click
    coverage.touch('learning.quiz.play_audio', 'clicked');

    // --- Close quiz: click the close control and assert the quiz surface closes, returning to
    // Lesson Details (onClose unmounts the quiz overlay). ---
    await page.getByLabel('Close quiz').click();
    await expect(quizHeading).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
    coverage.touch('learning.quiz.close', 'outcome-asserted');
  });
});
