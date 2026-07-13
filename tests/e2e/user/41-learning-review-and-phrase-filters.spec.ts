// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/41-learning-review-and-phrase-filters.spec.ts
// Description: Functional coverage for two previously untested interactive controls:
//   (a) the Learning "Review Mode" toggle in the Daily Curriculum block (LearningView.tsx),
//       proving the label flips to "Finish Review" and back; and (b) a Phrase Library register
//       filter chip (PhraseLibraryView.tsx), proving the chip becomes active and the visible
//       phrase count shrinks when a non-"All" register is selected. Both assert an observable
//       UI response, not mere presence.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('learning review mode + phrase filters', () => {
  test('A: Review Mode toggle flips the Daily Curriculum label', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Learning', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    // Before: the toggle offers to ENTER review mode.
    const toggle = page.getByRole('button', { name: 'Review Mode', exact: true });
    await expect(toggle).toBeVisible();
    coverage.touch('learning.review_mode.toggle', 'clicked');

    // Click to enter review mode — the same button's label flips to "Finish Review".
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Finish Review', exact: true })).toBeVisible();
    // The "Review Mode" label is gone while active (proves a real state change, not a duplicate).
    await expect(page.getByRole('button', { name: 'Review Mode', exact: true })).toHaveCount(0);

    // Toggle back — label returns to "Review Mode".
    await page.getByRole('button', { name: 'Finish Review', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review Mode', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish Review', exact: true })).toHaveCount(0);

    coverage.touch('learning.review_mode.toggle', 'outcome-asserted');
  });

  test('B: Phrase Library register chip filters the visible phrase list', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();

    await page.getByText('Phrase Library', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Phrase Library' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search phrases' })).toBeVisible();

    // The count line ("N phrases · from M situations") is the deterministic response surface.
    const countLine = page.getByText(/\d+ phrase(s)? /);
    await expect(countLine).toBeVisible();
    const readCount = async (): Promise<number> => {
      const text = (await countLine.textContent()) ?? '';
      const match = text.match(/(\d+)\s+phrase/);
      return match ? Number(match[1]) : NaN;
    };
    const unfilteredCount = await readCount();
    expect(unfilteredCount).toBeGreaterThan(0);

    // The register chips are static (REGISTERS enum), so "informal" always renders regardless
    // of content. The seed course is dominated by neutral/formal variants, so restricting to
    // "informal" is guaranteed to be a strict subset of the full library.
    const informalChip = page.getByRole('button', { name: 'informal', exact: true });
    await expect(informalChip).toBeVisible();
    coverage.touch('practice.phrases.filter', 'clicked');

    await informalChip.click();

    // Response 1: the chip becomes active (selected styling → bg-ios-blue text-white).
    await expect(informalChip).toHaveClass(/bg-ios-blue/);
    await expect(informalChip).toHaveClass(/text-white/);

    // Response 2: the visible list actually updates — the count strictly shrinks because the
    // seed content contains neutral/formal entries that the informal filter removes.
    await expect
      .poll(readCount, { timeout: 10_000 })
      .toBeLessThan(unfilteredCount);

    coverage.touch('practice.phrases.filter', 'outcome-asserted');
  });
});
