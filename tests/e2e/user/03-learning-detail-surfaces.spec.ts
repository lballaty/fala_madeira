// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/03-learning-detail-surfaces.spec.ts
// Description: Learning-detail structural coverage beyond the base smoke slice. Verifies the
//   lesson-detail Vocab modal opens with its empty state and that the quiz launch opens the real
//   quiz surface for the selected lesson.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('learning detail surfaces', () => {
  test('Vocabulary Lookup and Start Practice Quiz open their real modal surfaces', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
    await firstLesson.click();
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();

    await page.getByRole('button', { name: 'Vocab' }).click();
    const vocabDialog = page.getByRole('dialog', { name: 'Vocabulary Lookup' });
    await expect(vocabDialog).toBeVisible();
    await expect(vocabDialog.getByPlaceholder('Enter a word or phrase...')).toBeVisible();
    await expect(vocabDialog.getByText(/AI-powered translation and Madeiran context/i)).toBeVisible();
    await vocabDialog.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Start Practice Quiz' }).click();
    await expect(page.getByRole('heading', { name: /Quiz:/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close quiz' })).toBeVisible();
  });
});
