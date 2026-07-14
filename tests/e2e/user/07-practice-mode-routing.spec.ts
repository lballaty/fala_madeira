// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/07-practice-mode-routing.spec.ts
// Description: Practice mode route coverage for additional offline-capable engines. Verifies
//   direct tile entry opens the expected mode chrome and a real in-mode surface for Vocabulary
//   Review, Phrase Library, and Speaking & Pronunciation.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('practice mode routing', () => {
  test('Vocabulary Review, Phrase Library, and Speaking open their real mode bodies', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    const backToPractice = page.locator('button', { has: page.locator('svg.lucide-chevron-left') }).first();

    await page.getByText('Vocabulary Review', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();
    await expect(page.getByText(/due|new/i).first()).toBeVisible();
    await backToPractice.click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    await page.getByText('Phrase Library', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Phrase Library' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search phrases' })).toBeVisible();
    await backToPractice.click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    await page.getByText('Speaking & Pronunciation', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Speaking & Pronunciation' })).toBeVisible();
    await expect(page.getByText(/pick a drill/i)).toBeVisible();
  });
});
