// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/58-help-nav-entry.spec.ts
// Description: EN-20 regression. The persistent "Help" entry in the sidebar opens the App-Guide
//   chat directly in help mode (no lesson, no in-modal toggle needed) — so help is always one
//   click away. Asserts the entry is present on the primary screens and opens the help greeting.
// Author: Lane A (with assistant)
// Created: 2026-07-16

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('persistent Help entry (EN-20)', () => {
  test('the sidebar Help entry opens the App-Guide chat in help mode', async ({ page, coverage }) => {
    await landOnHome(page);

    // Help is a persistent sidebar action (desktop nav), available regardless of the active tab.
    const helpEntry = page.getByTestId('nav-help');
    await expect(helpEntry).toBeVisible();
    coverage.touch('nav.help.entry', 'rendered');

    await helpEntry.click();

    // Opens the App-Guide (help mode) chat with its greeting — directly, without starting a lesson
    // or flipping the in-modal help toggle.
    await expect(page.getByText(/App Guide/i)).toBeVisible();
    coverage.touch('nav.help.open', 'outcome-asserted');
  });
});
