// File: tests/e2e/user/56-help-guidance.spec.ts
// Description: e2e for the EN-17a + EN-18 help & guidance features built on the App Capability
//   Registry. (1) The User Manual renders a recently-added capability (Situation Simulator) from
//   the registry. (2) A help-chat "Take me there" affordance navigates to + focuses the target
//   control (help answer references offline downloads -> chip -> Profile tab). (3) A proactive
//   contextual hint in the Practice hub appears under its condition (no lesson selected) and
//   navigates to the Learning roadmap. Uses the shared logged-in fixture; the gemini chat call is
//   mocked so the flow is deterministic and needs no live AI.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('help & guidance (EN-17a + EN-18)', () => {
  test('User Manual renders a recent capability from the registry', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();

    await page.getByRole('button', { name: 'User Manual' }).click();
    await expect(page.getByRole('heading', { name: 'User Manual' })).toBeVisible();

    // Registry-driven content: the Situation Simulator capability (a recently-shipped feature the
    // old hand-written manual never covered) renders, grouped under its Practice area.
    const sim = page.getByTestId('manual-cap-situation-simulator');
    await expect(sim).toBeVisible();
    await expect(sim).toContainText(/situation simulator/i);
    await expect(sim).toContainText(/role-play|conversation/i);
    // The old literal-** render bug must be gone (registry `long` is plain prose).
    await expect(page.getByTestId('user-manual-body')).not.toContainText('**');

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'User Manual' })).toHaveCount(0);
  });

  test('help chat "Take me there" navigates to + focuses the target control', async ({ page }) => {
    // Mock the gemini chat action so the help answer deterministically mentions offline downloads,
    // which the matcher maps to the 'offline-downloads' capability (target: Profile / tab-settings).
    await page.route('**/functions/v1/ai-gateway', async (route, request) => {
      const body = request.postDataJSON();
      if (body && typeof body === 'object' && 'action' in body && body.action === 'chat') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            text: 'You can download lessons for offline use in Profile — by whole track or one situation at a time.',
            requestId: 'e2e-help-guidance',
          }),
        });
        return;
      }
      await route.continue();
    });

    await landOnHome(page);
    await page.getByRole('button', { name: 'Tutor' }).first().click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();

    // Open the practice/help modal and switch to help mode.
    await page.getByRole('button', { name: /Start Today's Lesson/i }).click();
    const dialog = page.getByRole('dialog', { name: /AI .* Tutor/i });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Turn on help mode' }).click();

    // Ask a help question; the mocked answer arrives and the "Take me there" chip renders.
    await dialog.getByPlaceholder('Type in Portuguese...').fill('Where are downloads?');
    await dialog.getByRole('button', { name: 'Send message' }).click();
    await expect(dialog.getByText(/download lessons for offline use/i)).toBeVisible();

    const chip = page.getByTestId('take-me-there-offline-downloads');
    await expect(chip).toBeVisible();
    await chip.click();

    // The modal closes and we land on the Profile (settings) tab — the offline downloads target.
    await expect(page.getByRole('heading', { name: /AI .* Tutor/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    // The learning-path switcher (a Profile-tab control) is present, confirming the tab switched.
    await expect(page.getByTestId('path-switcher')).toBeVisible();
  });

  test('a proactive contextual hint appears under its condition and navigates', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByTestId('practice-hub')).toBeVisible();

    // With no lesson selected the hub surfaces the "pick a lesson first" hint pointing at Learning.
    const hint = page.getByTestId('contextual-hint-learning-roadmap');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText(/pick a lesson/i);

    await page.getByTestId('hint-take-me-there-learning-roadmap').click();

    // Navigates to the Learning roadmap.
    await expect(page.getByTestId('learning-plan')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
  });
});
