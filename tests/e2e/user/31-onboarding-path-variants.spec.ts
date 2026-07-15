// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/31-onboarding-path-variants.spec.ts
// Description: Onboarding path-choice coverage beyond the goal-track happy path. Verifies the
//   structured-course and adaptive-guided choices complete onboarding and persist the expected
//   `paths:selection.type` durable state for a brand-new fake-email user.
// Author: Codex
// Created: 2026-07-13

import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { readKvByPrefix } from '../support/storage';

async function completeSignupToPathChoice(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();

  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.locator('input[type="checkbox"]').nth(0).check({ force: true });
  await page.locator('input[type="checkbox"]').nth(1).check({ force: true });
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page.getByRole('heading', { name: 'Bem-vindo to FalaMadeira' })).toBeVisible();
  await page.getByRole('button', { name: "Let's go" }).click();

  await expect(page.getByRole('heading', { name: 'Where are you starting?' })).toBeVisible();
  await page.getByRole('button', { name: /A few words/i }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'How do you want to learn?' })).toBeVisible();
}

async function completeConsent(page: Page) {
  await expect(page.getByRole('heading', { name: 'One last thing' })).toBeVisible();
  const startLearning = page.getByRole('button', { name: 'Start learning' });
  await expect(startLearning).toBeDisabled();
  await page.locator('input[type="checkbox"]').nth(0).check({ force: true });
  await page.locator('input[type="checkbox"]').nth(1).check({ force: true });
  await expect(startLearning).toBeEnabled();
  await startLearning.click();
}

test.describe('onboarding path variants', () => {
  test('structured-course choice persists the structured path selection', async ({ browser, coverage }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    const nonce = `${Date.now()}-structured`;
    const email = `e2e-onboarding-${nonce}@example.test`;
    const prefix = email.split('@')[0];
    const password = `FmE2E!${Date.now()}`;

    await completeSignupToPathChoice(page, email, password);
    await page.getByRole('button', { name: /Follow the structured course/i }).click();
    coverage.touch('onboarding.path.structured', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'Your first words' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    coverage.touch('onboarding.first_win.skip', 'outcome-asserted');
    await completeConsent(page);
    coverage.touch('onboarding.consent.start_learning', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix}`, 'i') })).toBeVisible();
    await expect
      .poll(async () => {
        const value = await readKvByPrefix(page, 'paths:selection:');
        return value && typeof value === 'object' && 'type' in value ? (value as { type?: string }).type ?? null : null;
      })
      .toBe('structured');

    await context.close();
  });

  test('just-start-talking choice persists the adaptive-guided path selection', async ({ browser, coverage }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    const nonce = `${Date.now()}-adaptive`;
    const email = `e2e-onboarding-${nonce}@example.test`;
    const prefix = email.split('@')[0];
    const password = `FmE2E!${Date.now()}`;

    await completeSignupToPathChoice(page, email, password);
    await page.getByRole('button', { name: /Just start talking/i }).click();
    coverage.touch('onboarding.path.adaptive_guided', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'Your first words' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    coverage.touch('onboarding.first_win.skip', 'outcome-asserted');
    await completeConsent(page);
    coverage.touch('onboarding.consent.start_learning', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix}`, 'i') })).toBeVisible();
    await expect
      .poll(async () => {
        const value = await readKvByPrefix(page, 'paths:selection:');
        return value && typeof value === 'object' && 'type' in value ? (value as { type?: string }).type ?? null : null;
      })
      .toBe('adaptive-guided');

    await context.close();
  });
});
