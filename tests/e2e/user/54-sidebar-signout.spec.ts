// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/54-sidebar-signout.spec.ts
// Description: EN-9 regression. Sign Out must be available in the desktop nav sidebar at all times,
//   not only at the bottom of the Profile tab. Asserts the sidebar (complementary region) exposes a
//   Sign Out control while on Home — no Profile navigation — and that using it returns to the auth
//   landing. Complements user/15 (Profile-page sign-out, the mobile affordance).
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { test, expect, landOnHome, createThrowawayUserContext } from '../support/fixtures';

test.describe('EN-9 sidebar sign-out (always available)', () => {
  test('Sign Out is reachable from the desktop sidebar without opening Profile', async ({ browser }) => {
    // Sign Out globally revokes the user's refresh token (supabase signOut default scope), so run it
    // on a one-off disposable user — using the SHARED suite user poisoned every later spec's evidence
    // session ("Auth session missing!"). Mirrors 09-account-deletion / user/15.
    const { context, page } = await createThrowawayUserContext(browser);
    try {
      await landOnHome(page);
      await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();

      // The requirement: sign-out is present in the sidebar right here on Home — not gated behind
      // navigating to Profile. Scope to the sidebar's complementary region so it's unambiguous.
      const sidebar = page.getByRole('complementary');
      const signOut = sidebar.getByRole('button', { name: 'Sign Out' });
      await expect(signOut).toBeVisible();

      await signOut.click();

      await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Olá,/i })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
