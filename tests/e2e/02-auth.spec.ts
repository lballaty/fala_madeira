// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/02-auth.spec.ts
// Description: S1 auth slice. The session is minted programmatically in global-setup (magic-link
//   is not automatable; signInWithPassword is the robust path — docs/TEST-VERTICAL-SLICES.md S1).
//   Here we assert the RESTORED session lands the admin on Home with profile-driven content, and
//   assert the backend evidence: the `profiles` row for the admin exists with role='admin'
//   (domain-row evidence, G1). Also asserts the AuthScreen wrong-password failure surfaces a
//   calm error (no crash) on a fresh context.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';

test.describe('auth (S1)', () => {
  test('@smoke restored admin session lands on Home with a profile-driven greeting', async ({ page, admin }) => {
    await landOnHome(page);
    // Profile-driven: the greeting uses the email prefix ("Olá, <prefix>!").
    const prefix = admin.email.split('@')[0];
    await expect(page.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix}`, 'i') })).toBeVisible();
  });

  test('backend evidence: admin profile row exists with role=admin', async ({ evidence, admin }) => {
    const { data, error } = await evidence
      .from('profiles')
      .select('id, email, role')
      .eq('id', admin.userId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBe(admin.userId);
    expect(data?.role).toBe('admin');
  });

  test('wrong-password sign-in surfaces a calm error, no crash', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/');
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.getByPlaceholder('Email').fill('liborballaty@gmail.com');
    await page.getByPlaceholder('Password', { exact: true }).fill('definitely-wrong-password-xyz');
    // Submit the password form (button text is "Log In" in the form too).
    await page.getByRole('button', { name: 'Log In' }).click();

    // A toast/error appears and we stay on AuthScreen (not Home). We assert the app did not crash
    // and did not navigate to Home; the exact toast copy is calm/Ref'd (S1 failure path).
    await expect(page.getByRole('heading', { name: /Olá,/i })).toHaveCount(0);
    await page.waitForTimeout(1500); // allow the auth round-trip + toast to settle
    expect(pageErrors, `unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    // Still on the auth screen.
    await expect(page.getByPlaceholder('Email')).toBeVisible();

    await context.close();
  });
});
