// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/38-mobile-nav-smoke.spec.ts
// Description: CG-17 mobile bottom-bar navigation smoke. Routed to the 'mobile' Playwright
//   project (iPhone-scale viewport) via the @mobile tag, so it renders the mobile layout —
//   the product's primary form factor — with the bottom tab bar instead of the desktop
//   sidebar. Asserts all five tabs (Home, Learning, Practice, Tutor, Profile) reach their
//   screens. Nav accessible names are identical across layouts, so this also passes on desktop;
//   the 'mobile' project is what guarantees it runs at mobile dimensions.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('@mobile bottom-bar navigation smoke', () => {
  test('all five bottom-bar tabs reach their screens on the mobile layout', async ({ page, coverage }) => {
    await landOnHome(page);
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();
    coverage.touch('nav.home', 'outcome-asserted');

    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();

    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Tutor' }).first().click();
    await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible();
    coverage.touch('nav.tutor', 'outcome-asserted');

    await page.getByRole('button', { name: 'Profile' }).first().click();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    coverage.touch('nav.profile', 'outcome-asserted');

    await page.getByRole('button', { name: 'Home' }).first().click();
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();
    coverage.touch('nav.home', 'outcome-asserted');
  });
});
