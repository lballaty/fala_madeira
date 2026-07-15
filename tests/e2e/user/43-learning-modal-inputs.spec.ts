// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/43-learning-modal-inputs.spec.ts
// Description: Functional coverage for learning-modal INPUT fields and two buttons that lacked
//   inventory coverage. Opens each modal from the real Learning UI (Request Theme, plus the
//   per-lesson Vocab / Suggest Video / Correction sub-modals reached from Lesson Details), fills
//   each text field and asserts the value actually changed (value-changed). The Vocab "Search"
//   button asserts only the DETERMINISTIC immediate response — the loading spinner appears while
//   the button is disabled — not the nondeterministic AI translation result. The Lesson Details
//   "Play pronunciation" audio button is asserted enabled and clicked without throwing.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import type { Page } from '@playwright/test';
import { test, expect, landOnHome } from '../support/fixtures';

async function openLearningPlan(page: Page): Promise<void> {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Learning', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
}

// Mirror of 04-learning-feedback's helper: the lesson card click occasionally races the
// bottom-sheet mount, so retry once before asserting Lesson Details is open.
async function openFirstLessonDetails(page: Page): Promise<void> {
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

test.describe('learning modal inputs', () => {
  test('Request Lesson modal: theme + description inputs accept typed values', async ({ page, coverage }) => {
    await openLearningPlan(page);

    await page.getByRole('button', { name: 'Request Theme' }).click();
    await expect(page.getByRole('heading', { name: 'Request Lesson' })).toBeVisible();

    const themeInput = page.getByPlaceholder('e.g., Wine Tasting, Football...');
    await themeInput.fill('Wine Tasting');
    await expect(themeInput).toHaveValue('Wine Tasting');
    coverage.touch('learning.request_theme.theme_input', 'value-changed');

    const descInput = page.getByPlaceholder('What would you like to learn?');
    await descInput.fill('Ordering and tasting local Madeiran wines.');
    await expect(descInput).toHaveValue('Ordering and tasting local Madeiran wines.');
    coverage.touch('learning.request_theme.desc_input', 'value-changed');

    // Close cleanly without submitting (avoids writing a lesson_requests row).
    await page.getByRole('dialog', { name: 'Request Lesson' }).getByLabel('Close').click();
    await expect(page.getByRole('heading', { name: 'Request Lesson' })).toHaveCount(0);
  });

  test('Suggest Video modal: url + note inputs accept typed values', async ({ page, coverage }) => {
    await openLearningPlan(page);
    await openFirstLessonDetails(page);

    await page.getByRole('button', { name: 'Suggest Video' }).click();
    await expect(page.getByRole('heading', { name: 'Suggest a Video' })).toBeVisible();

    const urlInput = page.getByPlaceholder('https://youtube.com/watch?v=...');
    await urlInput.fill('https://youtube.com/watch?v=coverage43');
    await expect(urlInput).toHaveValue('https://youtube.com/watch?v=coverage43');
    coverage.touch('learning.lesson.suggest_video.url_input', 'value-changed');

    const noteInput = page.getByPlaceholder('Why is this video good for this lesson?');
    await noteInput.fill('Clear native pronunciation for this lesson.');
    await expect(noteInput).toHaveValue('Clear native pronunciation for this lesson.');
    coverage.touch('learning.lesson.suggest_video.note_input', 'value-changed');

    await page.getByRole('dialog', { name: 'Suggest a Video' }).getByLabel('Close').click();
    await expect(page.getByRole('heading', { name: 'Suggest a Video' })).toHaveCount(0);
    // Parent Lesson Details stays mounted by design.
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
  });

  test('Correction modal: correction textarea accepts typed value', async ({ page, coverage }) => {
    await openLearningPlan(page);
    await openFirstLessonDetails(page);

    await page.getByRole('button', { name: 'Correction' }).click();
    await expect(page.getByRole('heading', { name: 'Report Correction' })).toBeVisible();

    const correctionInput = page.getByPlaceholder('Describe the correction needed...');
    await correctionInput.fill('The second phrase has a typo in the verb form.');
    await expect(correctionInput).toHaveValue('The second phrase has a typo in the verb form.');
    coverage.touch('learning.lesson.correction.input', 'value-changed');

    // Cancel (also clears + closes) rather than Submit — no lesson_corrections row is written.
    await page.getByRole('dialog', { name: 'Report Correction' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Report Correction' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
  });

  test('Vocab Lookup modal: query input + Search button surface a loading state', async ({ page, coverage }) => {
    await openLearningPlan(page);
    await openFirstLessonDetails(page);

    await page.getByRole('button', { name: 'Vocab', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vocabulary Lookup' })).toBeVisible();
    const vocabDialog = page.getByRole('dialog', { name: 'Vocabulary Lookup' });

    const queryInput = page.getByPlaceholder('Portuguese or English word...');
    await queryInput.fill('mercado');
    await expect(queryInput).toHaveValue('mercado');
    coverage.touch('learning.lesson.vocab.query_input', 'value-changed');

    // Submit and assert only the DETERMINISTIC immediate response: handleVocabLookup sets
    // isVocabLoading(true) synchronously, which disables the Search button and swaps the
    // magnifying-glass icon for the animate-spin spinner. The AI translation result that
    // follows is nondeterministic and is intentionally NOT asserted.
    const searchButton = vocabDialog.getByRole('button', { name: 'Search' });
    await expect(searchButton).toBeEnabled();
    await searchButton.click();

    // EN-10 made lookup inventory-first: an in-inventory word resolves synchronously (the loading
    // spinner is too brief to observe), while a miss falls back to AI (spinner → result). Assert the
    // deterministic observable response either way — the loading spinner OR the rendered result
    // (its "Explanation" section). This proves the search action is wired without depending on the
    // transient spinner that inventory hits skip.
    await expect(
      vocabDialog.locator('.animate-spin').or(vocabDialog.getByText('Explanation', { exact: true })),
    ).toBeVisible();
    coverage.touch('learning.lesson.vocab.search', 'outcome-asserted');

    await vocabDialog.getByLabel('Close').click();
    await expect(page.getByRole('heading', { name: 'Vocabulary Lookup' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
  });

  test('Lesson Details: Play pronunciation audio button is clickable', async ({ page, coverage }) => {
    await openLearningPlan(page);
    await openFirstLessonDetails(page);

    // The Common Patterns / Vocabulary sections each render a "Play pronunciation" button.
    const playButton = page.getByRole('button', { name: 'Play pronunciation' }).first();
    await expect(playButton).toBeVisible();
    await expect(playButton).toBeEnabled();
    // playSpeech is a fire-and-forget TTS call with no deterministic UI indicator; assert only
    // that the click does not throw and the button remains enabled afterwards.
    await playButton.click();
    await expect(playButton).toBeEnabled();
    coverage.touch('learning.lesson.play_pronunciation', 'clicked');

    await page.getByRole('dialog', { name: 'Lesson Details' }).getByLabel('Close').click();
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toHaveCount(0);
  });
});
