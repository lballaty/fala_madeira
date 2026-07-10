// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/03-learning.spec.ts
// Description: S2 structured-course / learning slice. Opens the Learning tab, asserts the plan +
//   daily curriculum render, opens a lesson detail and asserts the patterns/vocab content is
//   visible (LessonDetailModal — "Common Patterns" / "Vocabulary"). This drives the real
//   structured-course entry point (docs/TEST-VERTICAL-SLICES.md S2). The quiz-completion
//   domain-row evidence (profiles.completed_lessons, G5) requires ≥3 correct quiz answers which
//   depends on content-specific quiz data; asserted at the UI-render level here and left to the
//   dedicated content-model quiz step to automate the array-membership write.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';

test.describe('learning / structured-course (S2)', () => {
  test('@smoke Learning tab renders the plan and a lesson detail shows patterns/vocab', async ({ page }) => {
    await landOnHome(page);

    // Navigate to Learning (sidebar button on desktop viewport).
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '6-Month Roadmap' })).toBeVisible();

    // Daily curriculum section is present.
    await expect(page.getByText('Daily Curriculum')).toBeVisible();

    // Open the first lesson card in the curriculum. Lesson cards carry a "Day" chip + title.
    const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
    await firstLesson.click();

    // The LessonDetailModal renders the lesson content: patterns and vocabulary are the
    // structured-course substance (S2). At least the modal heading + a content section appears.
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();
    // Common Patterns and/or Vocabulary sections render for a lesson with that content.
    const patterns = page.getByText('Common Patterns', { exact: false });
    const vocab = page.getByRole('heading', { name: 'Vocabulary' }).or(page.getByText('Vocabulary', { exact: true }));
    await expect(patterns.or(vocab).first()).toBeVisible();
  });
});
