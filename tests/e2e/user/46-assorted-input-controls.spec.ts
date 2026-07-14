// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/46-assorted-input-controls.spec.ts
// Description: Coverage-backlog sweep of assorted input controls that lacked functional inventory
//   coverage: the Support modal subject + description fields, the Settings TTS provider-key
//   reference input (behind the Voice Provider selection), the Tutor free-chat input, the
//   unauthenticated AuthScreen Email input on the Log In screen, and the AdminView "Close admin"
//   control. Each control gets a deterministic value-changed / outcome assertion.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('assorted input controls', () => {
  test('support subject + description accept typed values', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    await page.getByRole('button', { name: 'Support & Feedback' }).click();
    const dialog = page.getByRole('dialog', { name: 'Support & Feedback' });
    await expect(dialog).toBeVisible();

    const subject = dialog.getByPlaceholder('e.g., Audio not playing');
    const description = dialog.getByPlaceholder('Please describe the issue in detail...');

    await subject.fill('Coverage subject probe');
    await expect(subject).toHaveValue('Coverage subject probe');
    coverage.touch('settings.support.subject_input', 'value-changed');

    await description.fill('Coverage description probe with detail.');
    await expect(description).toHaveValue('Coverage description probe with detail.');
    coverage.touch('settings.support.description_input', 'value-changed');
  });

  test('TTS provider-key reference input accepts a typed value', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    // The provider-key input only renders once a specific voice provider is chosen.
    // handleSetTtsProvider optimistically updates local profile.tts_provider before the
    // network write, so the key input mounts synchronously after the select changes.
    const providerSelect = page.getByRole('combobox').filter({ hasText: 'Default (automatic)' });
    await providerSelect.selectOption('elevenlabs');

    const keyInput = page.getByPlaceholder('e.g. TTS_ELEVENLABS_KEY_ALICE');
    await expect(keyInput).toBeVisible();

    await keyInput.fill('TTS_ELEVENLABS_KEY_ALICE');
    await expect(keyInput).toHaveValue('TTS_ELEVENLABS_KEY_ALICE');
    coverage.touch('settings.tts.provider_key_input', 'value-changed');
  });

  test('tutor free-chat input accepts text and enables Send', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();

    const input = page.getByPlaceholder('Type in Portuguese...');
    const send = page.locator('button').filter({ has: page.locator('svg.lucide-send') });

    await expect(input).toHaveValue('');
    await expect(send).toBeDisabled();

    await input.fill('Olá, tudo bem?');
    await expect(input).toHaveValue('Olá, tudo bem?');
    await expect(send).toBeEnabled();
    coverage.touch('tutor.chat.input', 'value-changed');
  });

  test('auth Email input accepts a typed value on the Log In screen', async ({ browser, coverage }) => {
    // Fresh unauthenticated context: no seeded session, so the app renders the AuthScreen.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'Log In' }).click();
      await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();

      const emailInput = page.getByPlaceholder('Email');
      await emailInput.fill('coverage-probe@example.test');
      await expect(emailInput).toHaveValue('coverage-probe@example.test');
      coverage.touch('auth.email_input', 'value-changed');
    } finally {
      await context.close();
    }
  });

  test('Close admin dismisses the admin panel and returns to the app', async ({ adminPage, coverage }) => {
    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();

    // The admin surface is a role="dialog" overlay whose heading reads "Admin" (proven by the
    // admin review-queue specs). Assert on the heading for the open-check, then track the
    // dialog element by role for the close-check.
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
    const adminDialog = adminPage.getByRole('dialog');

    await adminPage.getByRole('button', { name: 'Close admin' }).click();

    // The AdminView overlay unmounts (isAdminViewOpen -> false); the underlying Home shell
    // is visible again, proving the close actually dismissed the panel.
    await expect(adminDialog).toHaveCount(0);
    await expect(adminPage.getByRole('heading', { name: /Olá,/i })).toBeVisible();
    coverage.touch('admin.close', 'outcome-asserted');
  });
});
