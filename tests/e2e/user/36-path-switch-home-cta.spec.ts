// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/36-path-switch-home-cta.spec.ts
// Description: Path-switch second-half coverage. Changes the learning path in Settings and proves
//   the Home screen's primary CTA updates to the correct label for adaptive-guided, goal-track,
//   and structured-course.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';
import { readKv } from '../support/storage';

async function openProfile(page: Parameters<typeof landOnHome>[0]) {
  await page.getByRole('button', { name: 'Profile' }).first().click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
}

async function openHome(page: Parameters<typeof landOnHome>[0]) {
  await page.getByRole('button', { name: 'Home' }).first().click();
  await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();
}

async function switchPathAndAssertStorage(
  page: Parameters<typeof landOnHome>[0],
  label: 'Adaptive guided' | 'Goal track' | 'Structured course',
  expectedType: 'adaptive-guided' | 'goal-track' | 'structured',
) {
  // Scope to the path-switcher list specifically: the Goal-track chooser (TB-11) adds track
  // buttons in the same card, and a seed track named "Structured Course" would otherwise collide
  // with the case-insensitive substring match for the "Structured course" path button.
  await page.getByTestId('path-switcher').getByRole('button', { name: label }).click();
  await expect
    .poll(async () => {
      const value = await readKv(page, 'paths:selection');
      return value && typeof value === 'object' && 'type' in value ? (value as { type?: string }).type ?? null : null;
    })
    .toBe(expectedType);
}

test.describe('path switch changes the Home CTA', () => {
  test('adaptive, goal-track, and structured switches each update Home to the matching next-action CTA', async ({ page, coverage }) => {
    await landOnHome(page);

    await openProfile(page);
    await switchPathAndAssertStorage(page, 'Adaptive guided', 'adaptive-guided');
    coverage.touch('settings.path.adaptive_guided', 'outcome-asserted');
    await openHome(page);
    const adaptiveCta = page.getByRole('button', { name: "Start today's session" }).first();
    await expect(adaptiveCta).toBeVisible();
    coverage.touch('home.daily_session.start', 'rendered');

    await openProfile(page);
    await switchPathAndAssertStorage(page, 'Goal track', 'goal-track');
    coverage.touch('settings.path.goal_track', 'outcome-asserted');
    // TB-11b: goal-track only shows "Continue your track" once a specific goal IS chosen (before
    // that Home honestly shows "Choose your goal" — see user/37 + paths unit tests). Pick a goal
    // here so the CTA assertion is deterministic regardless of the shared user's prior DB state.
    await page.getByTestId('goal-track-chooser').getByRole('button').first().click();
    await openHome(page);
    await expect(page.getByRole('button', { name: 'Continue your track' }).first()).toBeVisible();

    await openProfile(page);
    await switchPathAndAssertStorage(page, 'Structured course', 'structured');
    await openHome(page);
    await expect(page.getByRole('button', { name: /Continue Day \d+/ }).first()).toBeVisible();
  });
});
