// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/57-vocab-scope-selector.spec.ts
// Description: EN-16 regression. The vocabulary-review screen must state its content scope and word
//   count (so a scoped deck never reads as "general" and a small deck is never a surprise), and let
//   the user set the scope in-place. Entered from the Practice hub (no situation), the deck defaults
//   to "All lessons" with a word count; the scope selector is present and the header names the scope.
//   (Scope-to-session scaling is unit-covered in buildSessionCards.test.ts.)
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('vocabulary review: content scope selector (EN-16)', () => {
  test('names the scope + word count and offers an in-screen scope selector', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await page.getByText('Vocabulary Review', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();

    // The scope selector is present with an "All lessons (N)" option (word count in parentheses).
    const selector = page.getByTestId('vocab-scope-selector');
    await expect(selector).toBeVisible();
    await expect(selector.getByRole('button', { name: /All lessons \(\d+\)/ })).toBeVisible();

    // The header states the scope + word count — never a bare "general" screen.
    await expect(page.getByTestId('vocab-scope').first()).toContainText(/All lessons · \d+ words/);
    coverage.touch('practice.vocab.scope_selector', 'outcome-asserted');
  });
});
