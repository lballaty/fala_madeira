// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/66-sidebar-about.spec.ts
// Description: NAV-1c / EN-4b coverage. The desktop nav sidebar must expose an "About" entry so the
//   in-app About surface is discoverable in the nav, not only buried under Settings (owner report,
//   staging .19.1). Asserts the sidebar (complementary region) exposes an About control while on
//   Home — no Settings navigation needed by the user — and that clicking it opens the About modal
//   (the same EN-4 dialog covered by user/53). The default project runs a 1280x900 desktop viewport,
//   so the sidebar renders and the mobile bottom bar is hidden. Mobile keeps About under Settings
//   (intentionally not added to the bottom bar), so this is a desktop-only affordance.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-19

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('NAV-1c desktop-sidebar About entry (EN-4b)', () => {
  test('About is reachable from the desktop sidebar and opens the About modal', async ({ page, coverage }) => {
    await landOnHome(page);
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();

    // The About entry lives in the sidebar's complementary region — discoverable right here on Home.
    const sidebar = page.getByRole('complementary');
    const about = sidebar.getByTestId('nav-about');
    await expect(about).toBeVisible();
    await expect(about).toHaveText(/About/);
    coverage.touch('nav.about', 'rendered');

    // Clicking it opens the in-app About modal (EN-4 dialog).
    await about.click();
    const dialog = page.getByRole('dialog', { name: /About FalaMadeira/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('about-version')).toBeVisible();
    coverage.touch('nav.about', 'outcome-asserted');
  });
});
