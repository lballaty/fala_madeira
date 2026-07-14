// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/18-auth-signup-consent-links.spec.ts
// Description: Signup consent/legal coverage on the unauthenticated auth screen. Verifies the
//   required-consent validation message and the inline legal-document buttons that open the real
//   Terms, Privacy, and AI disclosure surfaces.
// Author: Codex
// Created: 2026-07-13

import { test, expect } from '../support/fixtures';

test.describe('auth signup consent and legal links', () => {
  test('Sign Up requires consent and opens inline legal documents', async ({ browser, coverage }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto('/');
    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByText('Skip Email Verification')).toBeVisible();

    await page.getByPlaceholder('Email').fill('consent-surface@example.test');
    await page.getByPlaceholder('Password').fill('FmConsent!123');
    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect(page.getByText('Please accept the Terms of Service and AI Usage Policy')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();

    await page.getByRole('button', { name: 'Terms of Service' }).click();
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText(/Version \d/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toHaveCount(0);
    coverage.touch('auth.signup.terms_link', 'outcome-asserted');

    await page.getByRole('button', { name: 'Privacy Policy' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText(/The data controller is SearchingFool/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toHaveCount(0);
    coverage.touch('auth.signup.privacy_link', 'outcome-asserted');

    await page.getByRole('button', { name: 'AI system' }).click();
    await expect(page.getByRole('heading', { name: 'AI Disclosure' })).toBeVisible();
    await expect(page.getByText(/No human is on the other side of the conversation/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'AI Disclosure' })).toHaveCount(0);
    coverage.touch('auth.signup.ai_disclosure_link', 'outcome-asserted');

    await context.close();
  });
});
