// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/15-settings-signout.spec.ts
// Description: Deterministic sign-out coverage from Settings. Verifies the shared authenticated
//   user can sign out via the real control and lands on the unauthenticated auth landing without
//   stale signed-in shell content remaining visible.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome, createThrowawayUserContext } from '../support/fixtures';

test.describe('settings sign-out flow', () => {
  test('Sign Out returns the user to the auth landing', async ({ browser }) => {
    // Sign Out calls supabase.auth.signOut() (default = GLOBAL scope), which revokes ALL of the
    // user's refresh tokens server-side. Running this on the SHARED suite user poisoned every later
    // spec's evidence session ("Auth session missing!"). Use a one-off disposable user (like
    // 09-account-deletion) so the shared user's session stays valid for the rest of the suite.
    const { context, page } = await createThrowawayUserContext(browser);
    try {
      await landOnHome(page);
      await page.getByRole('button', { name: 'Settings' }).first().click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

      // Scope to the Profile page's Sign Out — the sidebar now also has one (EN-9), so the bare
      // role+name matches two elements.
      await page.getByRole('main').getByRole('button', { name: 'Sign Out' }).click();

      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'FalaMadeira' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Olá,/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Settings' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
