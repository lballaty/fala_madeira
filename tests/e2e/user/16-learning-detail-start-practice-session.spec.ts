// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/16-learning-detail-start-practice-session.spec.ts
// Description: Learning detail to tutor-practice coverage. Opens a real lesson detail sheet and
//   verifies Start Practice Session transitions into the tutor practice modal with only visible
//   UI-state assertions.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('learning detail practice launch', () => {
  test('Start Practice Session from lesson details opens the tutor practice modal', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    const firstLesson = page.locator('[class*="cursor-pointer"]').filter({ hasText: 'Day' }).first();
    await firstLesson.click();
    await expect(page.getByRole('heading', { name: 'Lesson Details' })).toBeVisible();

    const lessonTitle = (await page.locator('h3.text-2xl').first().textContent())?.trim();
    expect(lessonTitle && lessonTitle.length > 0).toBeTruthy();

    await page.getByRole('button', { name: 'Start Practice Session' }).click();

    await expect(page.getByRole('heading', { name: /AI .* Tutor/i })).toBeVisible();
    await expect(page.getByText(/Practicing:/i)).toBeVisible();
    if (lessonTitle) {
      await expect(page.getByRole('heading', { name: lessonTitle })).toBeVisible();
    }
    await expect(page.getByPlaceholder('Type in Portuguese...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});
