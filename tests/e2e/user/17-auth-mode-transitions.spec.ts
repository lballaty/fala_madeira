// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/17-auth-mode-transitions.spec.ts
// Description: Unauthenticated auth-screen surface coverage. Verifies deterministic transitions
//   between password, magic-link, forgot/reset, verify-code, and cancel flows without depending
//   on external email delivery by stubbing the password-reset response.
// Author: Codex
// Created: 2026-07-13

import { test, expect } from '../support/fixtures';

test.describe('auth mode transitions', () => {
  test('unauthenticated user can traverse password, magic-link, reset, verify, and cancel surfaces', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.route('**/auth/v1/recover*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'FalaMadeira' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();

    await page.getByRole('button', { name: 'Log In' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Password', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Magic Link' })).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();

    await page.getByRole('button', { name: 'Magic Link' }).click();
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Forgot Password?' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Password', exact: true }).click();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot Password?' })).toBeVisible();

    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toHaveCount(0);

    await page.getByPlaceholder('Email').fill('surface-only@example.test');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByRole('heading', { name: 'FalaMadeira' })).toBeVisible();
    await expect(page.getByPlaceholder('6-digit code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify Code' })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toHaveCount(0);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'FalaMadeira' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByPlaceholder('6-digit code')).toHaveCount(0);

    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Password', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Magic Link' })).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();

    await page.getByRole('button', { name: 'Magic Link' }).click();
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toHaveCount(0);
    await expect(page.getByText('Skip Email Verification')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'FalaMadeira' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();

    await context.close();
  });
});
