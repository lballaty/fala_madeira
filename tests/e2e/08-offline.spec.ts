// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/08-offline.spec.ts
// Description: S17-adjacent offline behavior. Uses context.setOffline(true) to prove the
//   online/offline split (CONTENT-ARCHITECTURE §10): (1) the Practice hub marks the online-only
//   Situation Simulator with an "online" badge; (2) opened while offline, the Simulator shows its
//   calm "Online only" panel (SimulatorView §10 surface); (3) an offline-capable core mode
//   (Pattern Builder) still works offline — its situation chooser renders from bundled/cached
//   content with no network. The onboarding init-script also unregisters the PWA service worker
//   so this exercises the app's own connectivity handling, not the SW cache (docs/TEST-VERTICAL-
//   SLICES.md offline note). We assert the app's honest offline surfaces, not a fabricated one.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';

test.describe('offline behavior (S17 §10)', () => {
  test('online-only marked; offline shows "Online only" while offline-capable modes still work', async ({
    page,
    context,
  }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    // (1) Situation Simulator (requiresOnline) carries the "online" badge on its tile.
    const simulatorTile = page.locator('button').filter({ hasText: 'Situation Simulator' });
    await expect(simulatorTile).toBeVisible();
    await expect(simulatorTile.getByText('online', { exact: true })).toBeVisible();

    // Warm the content chain WHILE ONLINE: open Pattern Builder once so the content repository
    // loads (cache → bundled) into memory. This mirrors real usage (content is fetched/bundled
    // before offline use, §10) and isolates the offline assertion to connectivity, not a cold
    // first-ever content fetch racing the offline toggle.
    const backButton = page.locator('button', { has: page.locator('svg.lucide-chevron-left') }).first();
    await page.getByText('Pattern Builder', { exact: true }).click();
    await expect(page.getByText(/Pick a situation to drill/i)).toBeVisible({ timeout: 20_000 });
    await backButton.click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    // Go offline for the rest of the test.
    await context.setOffline(true);

    // (2) Open the online-only Simulator → it swaps to the calm "Online only" panel.
    await page.getByText('Situation Simulator', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Online only' })).toBeVisible({ timeout: 15_000 });

    // Return to the tile grid via the mode chrome back button (calls closeMode — the sidebar nav
    // only switches tabs and would NOT reset the active mode route).
    await backButton.click();
    await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();

    // (3) The offline-capable core mode STILL works offline: Pattern Builder renders its situation
    //     chooser from the already-loaded (bundled/cached) content with no network. This is the
    //     online/offline split — online-only marked + degraded, offline-capable still functional.
    await page.getByText('Pattern Builder', { exact: true }).click();
    await expect(page.getByText(/Pick a situation to drill/i)).toBeVisible({ timeout: 15_000 });
    const firstChoice = page.locator('button').filter({ hasText: /^L\d/ }).first();
    await expect(firstChoice).toBeVisible();

    // Restore connectivity for suite hygiene.
    await context.setOffline(false);
  });
});
