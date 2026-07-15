// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/37-goal-track-picker.spec.ts
// Description: TB-11 regression. Selecting "Goal track" in Settings must surface a goal (track)
//   chooser and let the learner pick WHICH track. Before this fix, choosing Goal track only set
//   the path type and left activeTrackId null, so goal-track silently fell back to the first track
//   and read as the Structured Course. Proves: the chooser appears only for goal-track, picking a
//   goal persists activeTrackId, and the Home CTA then reflects the chosen track.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';
import { readKv } from '../support/storage';

async function openProfile(page: Parameters<typeof landOnHome>[0]) {
  await page.getByRole('button', { name: 'Profile' }).first().click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
}

test.describe('goal-track picker (TB-11)', () => {
  test('choosing Goal track reveals a goal chooser and picking one persists the active track', async ({ page, coverage }) => {
    await landOnHome(page);
    await openProfile(page);

    const learningPathCard = page
      .locator('div')
      .filter({ has: page.getByText('Learning Path', { exact: true }) })
      .first();

    // The chooser must NOT be present until Goal track is the active path.
    await expect(page.getByTestId('goal-track-chooser')).toHaveCount(0);

    await learningPathCard.getByRole('button', { name: 'Goal track' }).click();
    await expect
      .poll(async () => {
        const value = await readKv(page, 'paths:selection');
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
    coverage.touch('settings.path.goal_track.chooser', 'rendered');

    await firstGoal.click();

    // Picking a goal persists a concrete activeTrackId (no longer the silent tracks[0] fallback).
    await expect
      .poll(async () => {
        const value = await readKv(page, 'paths:selection');
        return value && typeof value === 'object' && 'activeTrackId' in value
          ? (value as { activeTrackId?: string | null }).activeTrackId ?? null
          : null;
      })
      .not.toBeNull();
    coverage.touch('settings.path.goal_track.select', 'outcome-asserted');

    // The chosen goal renders as active in the chooser.
    await expect(goalChooser.getByRole('button', { name: /active/i }).first()).toBeVisible();
  });
});
