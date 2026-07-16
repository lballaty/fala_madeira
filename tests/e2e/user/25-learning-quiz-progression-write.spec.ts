// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/25-learning-quiz-progression-write.spec.ts
// Description: Progression-write coverage for lesson completion. Freezes the quiz shuffle for
//   determinism, completes a passing quiz for Day 1, and asserts `profiles.completed_lessons`
//   gains the lesson id via the real UI flow.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';
import { INITIAL_LESSONS } from '../../../src/data/lessons';

const DAY_ONE_LESSON = INITIAL_LESSONS[0];
const VOCAB_ANSWER_MAP = new Map(DAY_ONE_LESSON.vocabulary.map((entry) => [entry.word, entry.translation]));

test.describe('quiz progression write', () => {
  test('passing the Day 1 quiz writes completed_lessons to the profile row', async ({ page, userEvidence, testUser }) => {
    const spokenPrompts: string[] = [];
    await page.route('**/functions/v1/ai-gateway', async (route, request) => {
      const body = request.postDataJSON();
      if (
        body &&
        typeof body === 'object' &&
        'action' in body &&
        body.action === 'tts' &&
        'text' in body &&
        typeof body.text === 'string'
      ) {
        spokenPrompts.push(body.text);
      }
      await route.continue();
    });

    await page.addInitScript(() => {
      const originalSort = Array.prototype.sort;
      Array.prototype.sort = function sortWithoutQuizShuffle(compareFn?: ((a: unknown, b: unknown) => number) | undefined) {
        if (typeof compareFn === 'function' && compareFn.toString().includes('Math.random')) {
          return this;
        }
        return originalSort.call(this, compareFn as never);
      };
    });

    const { data: beforeProfile, error: beforeError } = await userEvidence
      .from('profiles')
      .select('completed_lessons')
      .eq('id', testUser.userId)
      .single();
    if (beforeError) throw beforeError;

    const originalCompleted = Array.isArray(beforeProfile?.completed_lessons) ? beforeProfile.completed_lessons : [];
    const { error: resetError } = await userEvidence
      .from('profiles')
      .update({ completed_lessons: [] })
      .eq('id', testUser.userId);
    if (resetError) throw resetError;

    try {
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

        const questionText = (await quizSurface.locator('h3').textContent())?.trim() ?? '';
        const vocabMatch = questionText.match(/What is the translation for "(.+)"\?/);
        const checkAnswer = quizSurface.getByRole('button', { name: 'Check Answer' });

        if (vocabMatch) {
          const answer = VOCAB_ANSWER_MAP.get(vocabMatch[1]);
          expect(answer, `No vocabulary answer mapped for quiz prompt: ${questionText}`).toBeTruthy();
          await quizSurface.getByRole('button', { name: answer!, exact: true }).click();
        } else if (await checkAnswer.isVisible().catch(() => false)) {
          const audioButton = quizSurface.getByRole('button', { name: 'Play audio' });
          await expect(audioButton).toBeVisible();
          const priorPromptCount = spokenPrompts.length;
          await audioButton.click();
          await expect
            .poll(() => spokenPrompts.length, {
              timeout: 12_000,
              message: `Quiz audio prompt did not issue a TTS request for question: ${questionText}`,
            })
            .toBeGreaterThan(priorPromptCount);
          const typedAnswer = spokenPrompts.at(-1);
          expect(typedAnswer, `No typed-answer audio prompt captured for quiz question: ${questionText}`).toBeTruthy();

          const input = quizSurface.getByPlaceholder('Type the answer...');
          await input.fill(typedAnswer!);
          await checkAnswer.click();
        } else {
          throw new Error(`Unsupported quiz question shape during pass-path spec: ${questionText}`);
        }

        const nextButton = quizSurface.getByRole('button', { name: /Next Question|Finish Quiz/i });
        await expect(nextButton).toBeEnabled();
        const isLastQuestion = await quizSurface.getByRole('button', { name: 'Finish Quiz' }).isVisible().catch(() => false);
        await nextButton.click();
        if (!isLastQuestion) {
          await expect
            .poll(async () => ((await quizSurface.locator('h3').textContent())?.trim() ?? ''), {
              timeout: 10_000,
              message: `Quiz did not advance after answering question: ${questionText}`,
            })
            .not.toBe(questionText);
        }
      }

      await expect(page.getByText(/Quiz completed! Score: [3-5]/i)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(
          async () => {
            const { data } = await userEvidence
              .from('profiles')
              .select('completed_lessons')
              .eq('id', testUser.userId)
              .single();
            return Array.isArray(data?.completed_lessons) ? data.completed_lessons.includes(DAY_ONE_LESSON.id) : false;
          },
          { timeout: 12_000, message: 'profiles.completed_lessons did not include the finished lesson after a passing quiz' },
        )
        .toBe(true);
    } finally {
      await userEvidence.from('profiles').update({ completed_lessons: originalCompleted }).eq('id', testUser.userId);
    }
  });
});
