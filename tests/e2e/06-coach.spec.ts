// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/06-coach.spec.ts
// Description: S16 Coach Focus card slice. The card is a drop-in on Home and computes
//   deterministically/offline (CONTENT-ARCHITECTURE §6b). Asserts the "Your Focus" card renders
//   honestly in EITHER state: the empty state ("Practice a little …") for an account with no
//   coach signals yet, or the populated state ("Your fastest wins today …" + suggestion rows).
//   We do not fabricate signals — the assertion accepts the true rendered state (docs/TEST-
//   VERTICAL-SLICES.md S16: "assert the card / empty state honestly").
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';

test.describe('coach Focus card (S16)', () => {
  test('Focus card renders on Home (empty state or populated, honestly)', async ({ page }) => {
    await landOnHome(page);

    // The card computes from supabase-backed signals (useCoach) and renders null until isReady,
    // so it can appear a beat after Home. Wait for the "Your Focus" heading to attach, then bring
    // it into view (it sits below the fold in the lg grid). Poll on count to tolerate the async
    // isReady flip rather than a single visibility check racing the coach load.
    const focusHeading = page.getByRole('heading', { name: 'Your Focus' });
    await expect
      .poll(async () => focusHeading.count(), {
        timeout: 30_000,
        message: 'Focus card ("Your Focus") never mounted on Home',
      })
      .toBeGreaterThan(0);

    await focusHeading.scrollIntoViewIfNeeded();
    await expect(focusHeading).toBeVisible();

    // Assert one of the two honest states is shown (empty cold-start vs populated suggestions).
    const emptyCopy = page.getByText(/Practice a little and your coach will highlight/i);
    const populatedCopy = page.getByText(/Your fastest wins today/i);
    await expect(emptyCopy.or(populatedCopy).first()).toBeVisible();
  });
});
