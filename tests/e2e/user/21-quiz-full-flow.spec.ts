// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/21-quiz-full-flow.spec.ts
// Description: Quiz end-to-end progression coverage. Opens a real lesson quiz, answers both
//   multiple-choice and typed questions generically, advances through all questions, and asserts
//   the completion toast + modal close path.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

async function readActiveQuizIndex(quizSurface: Parameters<typeof landOnHome>[0]['locator'] extends never ? never : any) {
  const progressDots = quizSurface.locator('header div.flex.space-x-1 > div');
  const count = await progressDots.count();
  for (let index = 0; index < count; index += 1) {
    const className = await progressDots.nth(index).getAttribute('class');
    if (className?.includes('bg-ios-blue/30')) return index;
  }
  return -1;
}

async function waitForFreshQuestionState(
  quizSurface: Parameters<typeof landOnHome>[0]['locator'] extends never ? never : any,
  previousIndex: number,
) {
  await expect
    .poll(
      async () => {
        const currentIndex = await readActiveQuizIndex(quizSurface);
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
}

test.describe('quiz full flow', () => {
  test('lesson quiz supports answering, progression, scoring toast, and close on finish', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
    await firstLesson.click();
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Practice Quiz' }).click();

    const quizHeading = page.getByRole('heading', { name: /Quiz:/i });
    await expect(quizHeading).toBeVisible();
    const quizSurface = quizHeading.locator('xpath=ancestor::div[contains(@class,"fixed")]').first();

    for (let step = 0; step < 5; step += 1) {
      if (!(await quizHeading.isVisible().catch(() => false))) break;
      const previousIndex = await readActiveQuizIndex(quizSurface);

      const input = quizSurface.getByPlaceholder('Type the answer...');
      const checkAnswer = quizSurface.getByRole('button', { name: 'Check Answer' });
      if (await checkAnswer.isVisible().catch(() => false)) {
        await expect(input).toBeEnabled();
        await input.fill(`e2e-answer-${step}`);
        await checkAnswer.click();
      } else {
        const optionButton = quizSurface
          .locator('div.grid')
          .getByRole('button')
          .filter({ hasNot: quizSurface.locator('svg') })
          .first();
        await expect(optionButton).toBeVisible();
        await optionButton.click();
      }

      const nextButton = quizSurface.getByRole('button', { name: /Next Question|Finish Quiz/i });
      await expect(nextButton).toBeEnabled();
      const isLastQuestion = await quizSurface.getByRole('button', { name: 'Finish Quiz' }).isVisible().catch(() => false);
      await nextButton.click();
      if (!isLastQuestion) {
        await waitForFreshQuestionState(quizSurface, previousIndex);
      }
    }

    await expect(page.getByText(/Quiz completed! Score:/i)).toBeVisible({ timeout: 15_000 });
    await expect(quizHeading).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
  });
});
