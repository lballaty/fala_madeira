// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/52-onboarding-footer-reachable-short-viewport.spec.ts
// Description: TB-4 regression guard. On a short viewport (small phone / installed PWA window /
//   short laptop window), the onboarding footer CTA ("Let's go", "Continue") must stay inside the
//   viewport and be clickable. The original bug: the StepShell scroll region lacked `min-h-0` and
//   the app shell used `h-screen` (100vh), so on a short container the flex-1 body grew to content
//   height and pushed the `shrink-0` footer BELOW the fold, with no page scroll to reach it — the
//   user was stuck on the first screen and could not advance. Fixes: App.tsx h-screen->h-dvh
//   (9c73629) + OnboardingFlow.tsx flex-1 min-h-0 on the scroll region (822feb6).
//   NOTE ON THE ASSERTION: toBeVisible() would NOT catch this bug — the footer button stays in the
//   DOM and is not display:none; it is merely positioned off-screen. toBeInViewport() is the
//   assertion that fails pre-fix and passes post-fix.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { test, expect } from '../support/fixtures';

// @mobile — runs under the mobile project; the per-test viewport below overrides its height to a
// deliberately short window so the placement step's content exceeds the viewport.
test.describe('@mobile onboarding footer reachable on a short viewport (TB-4)', () => {
  // Short + narrow: forces the content-heavy placement step to overflow, reproducing the
  // pushed-off-screen footer the fix addresses.
  test.use({ viewport: { width: 390, height: 560 } });

  test('footer CTA stays in the viewport and advances the flow on a short window', async ({
    browser,
    coverage,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    const nonce = Date.now().toString();
    const email = `e2e-tb4-${nonce}@example.test`;
    const password = `FmE2E!${nonce}`;

    await page.goto('/');

    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.locator('input[type="checkbox"]').nth(0).check({ force: true });
    await page.locator('input[type="checkbox"]').nth(1).check({ force: true });
    await page.getByRole('button', { name: 'Sign Up' }).click();

    // Welcome step: its footer CTA must be reachable on a short window (pre-fix it could be pushed
    // off-screen with no scroll to reach it).
    await expect(page.getByRole('heading', { name: 'Bem-vindo to FalaMadeira' })).toBeVisible();
    const letsGo = page.getByRole('button', { name: "Let's go" });
    await expect(letsGo).toBeInViewport();
    coverage.touch('onboarding.welcome.footer_in_viewport', 'outcome-asserted');
    await letsGo.click();

    // Placement step: content-heavy (title + subtitle + several choice cards + footer). This is the
    // step most likely to overflow a short viewport, so it is the strongest TB-4 guard.
    await expect(page.getByRole('heading', { name: 'Where are you starting?' })).toBeVisible();
    await page.getByRole('button', { name: /A few words/i }).click();

    const continueBtn = page.getByRole('button', { name: 'Continue' });
    // Core TB-4 assertion: the footer CTA is inside the viewport, not pushed below the fold.
    await expect(continueBtn).toBeInViewport();
    coverage.touch('onboarding.placement.footer_in_viewport', 'outcome-asserted');

    // ...and it actually advances the flow (proves the footer is interactive, not just painted).
    await continueBtn.click();
    await expect(page.getByRole('heading', { name: 'How do you want to learn?' })).toBeVisible();
    coverage.touch('onboarding.placement.footer_advances', 'outcome-asserted');

    await context.close();
  });
});
