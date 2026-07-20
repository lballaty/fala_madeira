// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/04-learning-feedback.spec.ts
// Description: Learning feedback regression coverage. Exercises the user-visible request-theme,
//   suggest-video, and report-correction flows from the real Learning UI, then proves each path
//   wrote the expected row to the live database for the throwaway user.
// Author: Codex
// Created: 2026-07-11

import { test, expect, landOnHome } from '../support/fixtures';

async function openFirstLessonDetails(page: Parameters<typeof landOnHome>[0]) {
  await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
  const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await firstLesson.click();
    const opened = await page.getByRole('heading', { name: 'Lesson Details' }).isVisible().catch(() => false);
    if (opened) return;
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
}

async function assertQuizTypingWorks(page: Parameters<typeof landOnHome>[0], value: string) {
  await page.getByRole('button', { name: 'Start Practice Quiz' }).click();
  const quizHeading = page.getByRole('heading', { name: /Quiz:/ });
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

  for (let step = 0; step < 5; step += 1) {
    const answerInput = quizSurface.getByPlaceholder('Type the answer...');
    if (await answerInput.isVisible().catch(() => false)) {
      await answerInput.fill(value);
      await expect(answerInput).toHaveValue(value);
      await page.getByLabel('Close quiz').click();
      await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
      return;
    }

    const firstChoice = quizSurface.locator('div.grid').getByRole('button').first();
    await expect(firstChoice).toBeVisible();
    const previousIndex = await readActiveQuizIndex();
    const nextButton = quizSurface.getByRole('button', { name: /Next Question|Finish Quiz/ });
    // EF-39: under full-suite CPU load the AnimatePresence question-entrance animation
    // (motion.div key={index}, x:20->0) can jank, so the first choice-click may land on a
    // still-transitioning element and never fire handleAnswer -> isAnswered stays false ->
    // Next stays disabled. handleAnswer guards `if (isAnswered) return`, so re-clicking is
    // idempotent. Poll the click until the answer registers. This does NOT weaken the
    // assertion: the product must still enable Next in response to a real choice-click.
    await expect(async () => {
      if (!(await nextButton.isEnabled().catch(() => false))) {
        await firstChoice.click();
      }
      await expect(nextButton).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await nextButton.click();
    const finishButtonVisible = await quizSurface.getByRole('button', { name: 'Finish Quiz' }).isVisible().catch(() => false);
    if (!finishButtonVisible) {
      await waitForFreshQuestionState(previousIndex);
    }
  }

  throw new Error('Quiz never surfaced a translation text field within the first 5 questions.');
}

test.describe('learning feedback writes', () => {
  test('requesting a theme, suggesting a video, and reporting a correction all persist', async ({ page, userEvidence, testUser }) => {
    // EF-39: collapse the Quiz per-question enter/exit animation to zero duration so the choice
    // buttons / typed-answer input (which live inside the animated motion.div) are not a moving
    // target under full-suite CPU load. Prod-safe test-only flag (see Quiz.tsx E2E_INSTANT_ANIM).
    // Must be registered before the first navigation so it applies on initial load.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('fm:e2e', '1');
      } catch {
        /* ignore */
      }
    });
    const nonce = Date.now().toString();
    const requestTheme = `E2E Theme ${nonce}`;
    const requestDescription = `Need a practical lesson for market small talk ${nonce}`;
    const suggestionUrl = `https://youtube.com/watch?v=e2e${nonce}`;
    const suggestionNote = `Useful pronunciation context ${nonce}`;
    const correctionText = `Correction needed for phrase wording ${nonce}`;
    const vocabQuery = `mercado ${nonce}`;
    const quizAnswer = `typed answer ${nonce}`;

    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    await page.getByRole('button', { name: 'Request Theme' }).click();
    await expect(page.getByRole('heading', { name: 'Request Lesson' })).toBeVisible();
    const requestThemeInput = page.getByLabel('Theme / Subject');
    const requestDescriptionInput = page.getByLabel('Description');
    await requestThemeInput.fill(requestTheme);
    await requestDescriptionInput.fill(requestDescription);
    await expect(requestThemeInput).toHaveValue(requestTheme);
    await expect(requestDescriptionInput).toHaveValue(requestDescription);
    await page.getByRole('button', { name: 'Submit Request' }).click();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('lesson_requests')
            .select('theme, description, status')
            .eq('user_id', testUser.userId)
            .eq('theme', requestTheme)
            .maybeSingle();
          return data ? `${data.theme}|${data.description}|${data.status}` : null;
        },
        { timeout: 12_000, message: 'lesson_requests row was not created from Request Theme modal' },
      )
      .toBe(`${requestTheme}|${requestDescription}|pending`);

    await openFirstLessonDetails(page);

    await page.getByRole('button', { name: 'Vocab', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vocabulary Lookup' })).toBeVisible();
    const vocabInput = page.getByPlaceholder('Portuguese or English word...');
    await vocabInput.fill(vocabQuery);
    await expect(vocabInput).toHaveValue(vocabQuery);
    await page.getByRole('dialog', { name: 'Vocabulary Lookup' }).getByLabel('Close').click();
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();

    await assertQuizTypingWorks(page, quizAnswer);

    await page.getByRole('button', { name: 'Suggest Video' }).click();
    await expect(page.getByRole('heading', { name: 'Suggest a Video' })).toBeVisible();
    const suggestionUrlInput = page.getByLabel('YouTube URL');
    const suggestionNoteInput = page.getByLabel('Note (Optional)');
    await suggestionUrlInput.fill(suggestionUrl);
    await suggestionNoteInput.fill(suggestionNote);
    await expect(suggestionUrlInput).toHaveValue(suggestionUrl);
    await expect(suggestionNoteInput).toHaveValue(suggestionNote);
    await page.getByRole('button', { name: 'Submit Suggestion' }).click();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('video_suggestions')
            .select('video_url, note, status')
            .eq('user_id', testUser.userId)
            .eq('video_url', suggestionUrl)
            .maybeSingle();
          return data ? `${data.video_url}|${data.note ?? ''}|${data.status}` : null;
        },
        { timeout: 12_000, message: 'video_suggestions row was not created from Suggest Video modal' },
      )
      .toBe(`${suggestionUrl}|${suggestionNote}|pending`);

    // handleSuggestVideo only closes the suggestion sub-modal; the parent Lesson Details
    // (z-[60]) stays mounted by design — the app keeps you on the lesson you just annotated,
    // exactly as the Correction submit path does. Reach Correction directly from here.
    // (Previously this re-opened via Learning Plan, whose heading reads "visible" behind the
    // still-mounted overlay, so the lesson-card click was intercepted for the full timeout —
    // the EF-16 stacked-dialog family failure.)
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
    await page.getByRole('button', { name: 'Correction' }).click();
    await expect(page.getByRole('heading', { name: 'Report Correction' })).toBeVisible();
    const correctionInput = page.getByPlaceholder('Describe the correction needed...');
    await correctionInput.fill(correctionText);
    await expect(correctionInput).toHaveValue(correctionText);
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('lesson_corrections')
            .select('correction_text, status')
            .eq('user_id', testUser.userId)
            .eq('correction_text', correctionText)
            .maybeSingle();
          return data ? `${data.correction_text}|${data.status}` : null;
        },
        { timeout: 12_000, message: 'lesson_corrections row was not created from Correction modal' },
      )
      .toBe(`${correctionText}|pending`);
  });
});
