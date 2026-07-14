// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/06-tutor-static-surfaces.spec.ts
// Description: Tutor non-edge coverage. Exercises the empty-state "Just Want to Chat" action and
//   verifies it seeds a local tutor message with the model-message controls, without depending on
//   an external AI response.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('tutor static surfaces', () => {
  test('Just Want to Chat seeds a model message and exposes Listen control', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();

    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();
    await page.getByRole('button', { name: 'Just Want to Chat' }).click();
    coverage.touch('tutor.empty.just_chat', 'outcome-asserted');

    await expect(page.getByText(/I'm here and ready to chat/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listen' })).toBeVisible();
    coverage.touch('tutor.model.listen', 'rendered');
  });
});
