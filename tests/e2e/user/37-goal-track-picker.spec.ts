// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/37-goal-track-picker.spec.ts
// Description: TB-11 regression. Selecting "Goal track" in Settings must surface a goal (track)
//   chooser and let the learner pick WHICH track. Before this fix, choosing Goal track only set
//   the path type and left activeTrackId null, so goal-track silently fell back to the first track
//   and read as the Structured Course. Proves: the chooser appears only for goal-track, picking a
//   goal persists activeTrackId, and the Home CTA then reflects the chosen track.
//   TB-11b extension: after picking a goal, the Home "Today's Focus" CTA reads "Continue your
//   track" and its detail carries the chosen track's NAME — proving the pick propagates to Home,
//   not just to storage. (The no-goal "Choose your goal" state is covered by src/paths unit tests:
//   user_track_selection persists per-user in the DB, so the null state is not reliably
//   reproducible for the shared e2e user.)
// Author: Lane A (with assistant); TB-11b by Lane B
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';
import { readKv } from '../support/storage';

async function openProfile(page: Parameters<typeof landOnHome>[0]) {
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function openHome(page: Parameters<typeof landOnHome>[0]) {
  await page.getByRole('button', { name: 'Home' }).first().click();
  await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();
}

test.describe('goal-track picker (TB-11)', () => {
  test('choosing Goal track reveals a goal chooser and picking one persists the active track', async ({ page, testUser, coverage }) => {
    await landOnHome(page);
    await openProfile(page);
    // SEC-1: the path selection mirror is namespaced per user (paths:selection:${userId}).
    const selectionKey = `paths:selection:${testUser.userId}`;

    const learningPathCard = page
      .locator('div')
      .filter({ has: page.getByText('Learning Path', { exact: true }) })
      .first();

    // The chooser must NOT be present until Goal track is the active path.
    await expect(page.getByTestId('goal-track-chooser')).toHaveCount(0);

    await learningPathCard.getByRole('button', { name: 'Goal track' }).click();
    await expect
      .poll(async () => {
        const value = await readKv(page, selectionKey);
        return value && typeof value === 'object' && 'type' in value
          ? (value as { type?: string }).type ?? null
          : null;
      })
      .toBe('goal-track');

    // Now the goal chooser is visible with at least one track to pick.
    const goalChooser = page.getByTestId('goal-track-chooser');
    await expect(goalChooser.getByText('Choose your goal')).toBeVisible();
    const firstGoal = goalChooser.getByRole('button').first();
    await expect(firstGoal).toBeVisible();
    // Capture the goal's name so we can assert Home reflects THIS track (not a default).
    const goalName = ((await firstGoal.locator('span.font-semibold').first().textContent()) ?? '').trim();
    expect(goalName.length).toBeGreaterThan(0);
    coverage.touch('settings.path.goal_track.chooser', 'rendered');

    await firstGoal.click();

    // Picking a goal persists a concrete activeTrackId (no longer the silent tracks[0] fallback).
    await expect
      .poll(async () => {
        const value = await readKv(page, selectionKey);
        return value && typeof value === 'object' && 'activeTrackId' in value
          ? (value as { activeTrackId?: string | null }).activeTrackId ?? null
          : null;
      })
      .not.toBeNull();
    coverage.touch('settings.path.goal_track.select', 'outcome-asserted');

    // The chosen goal renders as active in the chooser.
    await expect(goalChooser.getByRole('button', { name: /active/i }).first()).toBeVisible();

    // TB-11b: the Home CTA must REFLECT the picked track — "Continue your track" with the chosen
    // track's name in the detail — proving the pick propagates to Home and the internals, not just
    // that it persisted to storage.
    await openHome(page);
    const focusCard = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: "Today's Focus" }) })
      .first();
    await expect(focusCard.getByRole('button', { name: 'Continue your track' })).toBeVisible();
    await expect(focusCard.getByText(goalName, { exact: false })).toBeVisible();
    coverage.touch('home.goal_track.reflects_pick', 'outcome-asserted');
  });
});
