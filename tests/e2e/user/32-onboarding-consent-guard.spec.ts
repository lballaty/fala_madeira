// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/32-onboarding-consent-guard.spec.ts
// Description: Onboarding consent-guard coverage. Proves the final onboarding CTA remains blocked
//   until both consent rows are accepted, and that the linked legal documents open from the
//   onboarding screen before completion.
// Author: Codex
// Created: 2026-07-13

import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

async function reachConsentStep(page: Page, email: string, password: string) {
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
  await page.getByRole('button', { name: /Learn by goal/i }).click();

  await expect(page.getByRole('heading', { name: 'Pick your goal' })).toBeVisible();
  const survivalTrack = page.getByRole('button', { name: /Survival/i });
  if (await survivalTrack.count()) {
    await survivalTrack.click();
  } else {
    await page.locator('button').filter({ has: page.locator('span.block.font-bold.text-sm') }).first().click();
  }

  await expect(page.getByRole('heading', { name: 'Your first words' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'One last thing' })).toBeVisible();
}

async function openLegalDocFromConsent(
  page: Page,
  controlName: 'Terms of Service' | 'Privacy Policy' | 'AI system',
  expectedHeading: RegExp,
) {
  await page.getByRole('button', { name: controlName }).click();
  const legalDialog = page.getByRole('dialog');
  await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible();
  await legalDialog.getByRole('button', { name: 'Close' }).click();
  // Wait for the LegalPage modal to FULLY detach, not merely for "One last thing" to be
  // visible-through-the-fade. The modal is a fixed inset-0 z-[70] overlay with a framer-motion
  // exit animation; while it is still exiting it covers the consent checkboxes, so a following
  // force-click lands on the exiting overlay and the checkbox never toggles (the run-14
  // failure). Asserting the dialog is detached guarantees the overlay is gone first.
  await expect(legalDialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'One last thing' })).toBeVisible();
}

async function toggleConsentRow(page: Page, rowText: RegExp, mode: 'check' | 'uncheck') {
  const row = page.locator('label').filter({ hasText: rowText }).first();
  const checkbox = row.getByRole('checkbox');
  await expect(checkbox).toBeVisible();
  const want = mode === 'check';
  // The onboarding ConsentRow is a CONTROLLED React checkbox (checked={state}, onChange
  // flips state). Playwright's .check()/.uncheck() force-click, then IMMEDIATELY re-read
  // input.checked and throw "did not change its state" if it hasn't flipped yet — a race
  // against React's re-render commit (pitfall #3, controlled-input tracker). Use a plain
  // state-guarded .click() and let expect(...).toBeChecked() retry until React commits.
  if ((await checkbox.isChecked()) !== want) {
    await checkbox.click({ force: true });
    await expect(checkbox).toBeChecked({ checked: want });
  }
}

test.describe('onboarding consent guard', () => {
  test('final onboarding CTA stays blocked until both consents are accepted', async ({ browser, coverage }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    const nonce = `${Date.now()}-consent`;
    const email = `e2e-onboarding-${nonce}@example.test`;
    const prefix = email.split('@')[0];
    const password = `FmE2E!${Date.now()}`;

    await reachConsentStep(page, email, password);

    const startLearning = page.getByRole('button', { name: 'Start learning' });

    await expect(startLearning).toBeDisabled();
    await openLegalDocFromConsent(page, 'Terms of Service', /Terms of Service/i);
    coverage.touch('onboarding.consent.terms_link', 'outcome-asserted');
    await openLegalDocFromConsent(page, 'Privacy Policy', /Privacy Policy/i);
    coverage.touch('onboarding.consent.privacy_link', 'outcome-asserted');
    await openLegalDocFromConsent(page, 'AI system', /AI Disclosure/i);
    coverage.touch('onboarding.consent.ai_disclosure_link', 'outcome-asserted');

    await toggleConsentRow(page, /I agree to the Terms of Service and Privacy Policy/i, 'check');
    coverage.touch('onboarding.consent.terms_checkbox', 'value-changed');
    await expect(startLearning).toBeDisabled();

    await toggleConsentRow(page, /I understand I am interacting with an AI system/i, 'check');
    coverage.touch('onboarding.consent.ai_checkbox', 'value-changed');
    await expect(startLearning).toBeEnabled();

    await toggleConsentRow(page, /I understand I am interacting with an AI system/i, 'uncheck');
    await expect(startLearning).toBeDisabled();

    await toggleConsentRow(page, /I understand I am interacting with an AI system/i, 'check');
    coverage.touch('onboarding.consent.ai_checkbox', 'value-changed');
    await expect(startLearning).toBeEnabled();
    await startLearning.click();
    coverage.touch('onboarding.consent.start_learning', 'outcome-asserted');

    await expect(page.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix}`, 'i') })).toBeVisible();
    await context.close();
  });
});
