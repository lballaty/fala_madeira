// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/53-about-version-release-notes.spec.ts
// Description: EN-4 regression. The in-app About surface (Settings -> About) must show the running
//   version (the CalVer from the root VERSION file, injected at build as __APP_VERSION__) and
//   render per-version release notes parsed from CHANGELOG.md. Guards the owner ask: version +
//   release notes for each version, reachable in-app (the native macOS PWA menu About is
//   browser-owned and cannot be populated by our code).
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, landOnHome } from '../support/fixtures';

// Source of truth for the version string the About screen must display. These specs run as ESM,
// so __dirname is not defined — derive it from import.meta.url.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_VERSION = readFileSync(
  path.resolve(HERE, '../../../VERSION'),
  'utf-8',
).trim();

test.describe('in-app About: version + release notes (EN-4)', () => {
  test('About opens from Settings and shows the current version + release notes', async ({
    page,
    coverage,
  }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    await page.getByRole('button', { name: 'About', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: /About FalaMadeira/ });
    await expect(dialog).toBeVisible();

    // Version matches the VERSION source of truth (both the header line and the detail row).
    await expect(dialog.getByTestId('about-version')).toHaveText(EXPECTED_VERSION);
    await expect(dialog.getByText(`Version ${EXPECTED_VERSION}`).first()).toBeVisible();
    coverage.touch('settings.about.version', 'outcome-asserted');

    // Release notes render at least one version block with at least one bullet.
    const notes = dialog.getByTestId('about-release-notes');
    await expect(notes).toBeVisible();
    await expect(notes.getByText(EXPECTED_VERSION).first()).toBeVisible();
    await expect(notes.locator('li').first()).toBeVisible();
    coverage.touch('settings.about.release_notes', 'outcome-asserted');

    // Links out to a legal doc (single-owned by SettingsView) — proves the wiring.
    await dialog.getByRole('button', { name: 'Privacy Policy' }).click();
    await expect(page.getByRole('dialog', { name: 'Privacy Policy' })).toBeVisible();
    coverage.touch('settings.about.legal_link', 'outcome-asserted');
  });
});
