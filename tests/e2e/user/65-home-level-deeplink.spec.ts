// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/65-home-level-deeplink.spec.ts
// Description: NAV-1b coverage — tapping the Home proficiency level label deep-links to the Settings
//   "Your level" card. Before NAV-1b the level was a static <p>, so a learner seeing the wrong level
//   on Home had no obvious path to change it (owner report, staging .19.1). The fix makes the level a
//   button (data-testid="home-level-deeplink") that App wires to setActiveTab('settings') +
//   focusProficiencyCard, landing the learner on the proficiency-card. This spec lands on Home, taps
//   the level, and asserts the Settings screen with the "Your level" proficiency card is visible.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-19

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('Home level deep-link → Settings Your-level card (NAV-1b)', () => {
  test('tapping the Home level lands on Settings with the Your-level card visible', async ({ page, coverage }) => {
    await landOnHome(page);

    // The level control renders in the greeting sub-line (proficiencyName), now tappable.
    const levelControl = page.getByTestId('home-level-deeplink');
    await expect(levelControl).toBeVisible();
    coverage.touch('home.level.deeplink', 'rendered');

    // Tap it — this is the deep-link into Settings' "Your level" card.
    await levelControl.click();

    // We land on the Settings screen…
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // …and the "Your level" proficiency card is present (the scroll/highlight target).
    const proficiencyCard = page.getByTestId('proficiency-card');
    await expect(proficiencyCard).toBeVisible();
    await expect(proficiencyCard.getByText('Your level', { exact: true })).toBeVisible();
    coverage.touch('home.level.deeplink', 'outcome-asserted');
  });
});
