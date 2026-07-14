// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/12-onboarding-fresh-flow.spec.ts
// Description: Fresh-user onboarding regression slice. Uses a brand-new browser context instead of
//   the shared authenticated fixtures so the App does not see the IndexedDB onboarding-complete
//   seed. Covers signup -> welcome -> placement -> path -> goal-track picker -> first win skip ->
//   consent -> main shell.
// Author: Codex
// Created: 2026-07-13

import { test, expect } from '../support/fixtures';

test.describe('onboarding fresh-user flow', () => {
  test('new password signup reaches and completes the onboarding flow', async ({ browser, coverage }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    const nonce = Date.now().toString();
    const email = `e2e-onboarding-${nonce}@example.test`;
    const prefix = email.split('@')[0];
    const password = `FmE2E!${nonce}`;

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
    coverage.touch('onboarding.welcome.lets_go', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'Where are you starting?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.getByRole('button', { name: /A few words/i }).click();
    coverage.touch('onboarding.placement.a_few_words', 'outcome-asserted');
    await page.getByRole('button', { name: 'Continue' }).click();
    coverage.touch('onboarding.placement.continue', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'How do you want to learn?' })).toBeVisible();
    await page.getByRole('button', { name: /Learn by goal/i }).click();
    coverage.touch('onboarding.path.goal', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'Pick your goal' })).toBeVisible();
    const survivalTrack = page.getByRole('button', { name: /Survival/i });
    if (await survivalTrack.count()) {
      await expect(survivalTrack).toBeVisible();
      await survivalTrack.click();
    } else {
      const trackButtons = page.locator('button').filter({ has: page.locator('span.block.font-bold.text-sm') });
      await expect(trackButtons.first()).toBeVisible();
      await trackButtons.first().click();
    }
    coverage.touch('onboarding.track.pick_goal', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'Your first words' })).toBeVisible();
    await expect(page.getByText('Bom dia!')).toBeVisible();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    coverage.touch('onboarding.first_win.skip', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: 'One last thing' })).toBeVisible();
    const startLearning = page.getByRole('button', { name: 'Start learning' });
    await expect(startLearning).toBeDisabled();
    await page.locator('input[type="checkbox"]').nth(0).check({ force: true });
    coverage.touch('onboarding.consent.terms_checkbox', 'value-changed');
    await page.locator('input[type="checkbox"]').nth(1).check({ force: true });
    coverage.touch('onboarding.consent.ai_checkbox', 'value-changed');
    await expect(startLearning).toBeEnabled();
    await startLearning.click();
    coverage.touch('onboarding.consent.start_learning', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix}`, 'i') })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Home' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bem-vindo to FalaMadeira' })).toHaveCount(0);

    await context.close();
  });
});
