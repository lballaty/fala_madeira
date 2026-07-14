// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/13-tutor-chat-input-state.spec.ts
// Description: Tutor free-chat coverage that stays local to client state. Verifies the text
//   input send-state on the Tutor tab and that the seeded chat path preserves the standard
//   message controls without requiring a live AI call.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('tutor chat input state', () => {
  test('free-chat input enables send only when text exists and seeded chat exposes controls', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();

    const input = page.getByPlaceholder('Type in Portuguese...');
    const send = page.locator('button').filter({ has: page.locator('svg.lucide-send') });

    await expect(input).toHaveValue('');
    await expect(send).toBeDisabled();

    await input.fill('Olá');
    await expect(send).toBeEnabled();

    await input.fill('');
    await expect(send).toBeDisabled();

    await page.getByRole('button', { name: 'Just Want to Chat' }).click();
    coverage.touch('tutor.empty.just_chat', 'outcome-asserted');

    await expect(page.getByText(/What's on your mind\\?/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listen' })).toBeVisible();
    coverage.touch('tutor.model.listen', 'rendered');
    await expect(input).toHaveValue('');
    await expect(send).toBeDisabled();

    await input.fill('Tudo bem?');
    await expect(send).toBeEnabled();
  });
});
