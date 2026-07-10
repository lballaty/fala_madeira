// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/04-practice.spec.ts
// Description: Practice-hub slice + an offline-capable engine drive (S11 Pattern Builder). Asserts
//   all 8 registered mode tiles render (docs/TEST-VERTICAL-SLICES.md S9–S14 + phrases/culture),
//   opens Pattern Builder (an offline-capable core mode — registry requiresOnline:false), and
//   drives one real interaction: pick a situation → the substitution/recall drill renders. The
//   pattern grade emits a Coach signal client-side (drill.ts) rather than a synchronous row
//   write, so this asserts the real engine path renders + accepts input, not a DB row (the
//   mastery_items/user_situation_progress write is the srs/engine steps' own evidence).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';

const MODE_TILES = [
  'Listening',
  'Speaking & Pronunciation',
  'Pattern Builder',
  'Situation Simulator',
  'Missions',
  'Vocabulary Review',
  'Phrase Library',
  'Culture',
];

test.describe('practice hub', () => {
  test('all 8 mode tiles render on the Practice hub', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();

    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
    for (const title of MODE_TILES) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    }
  });

  test('Pattern Builder (offline-capable) opens and drives one drill interaction', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();

    // Open the Pattern Builder tile. The hub owns the mode chrome (back button + title header).
    await page.getByText('Pattern Builder', { exact: true }).click();

    // Tile entry (situationId null) => the in-mode situation chooser renders over the seed
    // content ("Pick a situation to drill its phrases …"). Seed packs ship situations with
    // phrase_patterns, so the chooser lists at least one.
    await expect(page.getByText(/Pick a situation to drill/i)).toBeVisible({ timeout: 20_000 });

    // Pick the first situation to start the drill. Chooser rows are buttons with an "L<level>" chip.
    const firstChoice = page.locator('button').filter({ hasText: /^L\d/ }).first();
    await expect(firstChoice).toBeVisible();
    await firstChoice.click();

    // The drill body renders. Seed packs ship bare {id, base} patterns, so the degraded recall
    // card (PhraseDrill) is the common case: it needs a reveal before the self-grade row appears.
    // Slotted patterns show the grade row immediately. Handle both: reveal if present, then grade.
    const reveal = page.getByRole('button', { name: /Reveal the Portuguese/i });
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
    }

    // Self-grade controls (drill.ts three-way recall: "Got it" / "Almost" / "Missed") — the
    // real Coach/SRS signal path. Assert one is actionable and click it.
    const gradeButton = page.getByRole('button', { name: /^(Got it|Almost|Missed)$/ }).first();
    await expect(gradeButton).toBeVisible({ timeout: 15_000 });
    await gradeButton.click();
    // No crash / still inside the mode after a grade (drill advances or completes).
    await expect(page.getByRole('button', { name: 'Practice' }).first()).toBeVisible();
  });
});
