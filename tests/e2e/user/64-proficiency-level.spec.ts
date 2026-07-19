// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/64-proficiency-level.spec.ts
// Description: TB-1 (Option B) end-to-end coverage — the proficiency/placement level is persisted
//   from onboarding to the DB, surfaced on Home, self-service editable in Settings, and kept
//   STRICTLY SEPARATE from the paywall `unlocked_level` (the separation invariant, REQUIREMENTS
//   §2/§8/R5). Drives a genuinely NEW user through the REAL signup + onboarding UI (no
//   onboarding pre-seed — clean-context + real-signup pattern from 63-new-user-first-home-render,
//   placement selection from 31-onboarding-path-variants), so the true placement→DB→Home path runs
//   (createThrowawayUserContext seeds onboarding and would bypass placement entirely).
//
//   Asserts, in order:
//     1. Register + complete onboarding choosing placement "Basic conversation" (PracticalLevel 2).
//     2. Home greeting shows the level-2 proficiency label "Basic conversation" (useHome
//        proficiencyLabel) and NOT the paywall "Absolute Beginner".
//     3. Settings → the new "Your level" control (data-testid proficiency-chooser /
//        proficiency-option-<n>) — change to the level-1 "A few words" label, return to Home,
//        assert Home reflects it AND it persists across a full page reload.
//     4. SEPARATION INVARIANT (R5): capture the paywall unlock-modal copy ("Enter your access key
//        to unlock Month N …", HomeView unlock modal) before and after the proficiency change and
//        assert it is UNCHANGED — changing proficiency must not move the paywall.
//     5. DB persistence: read profiles.proficiency_level via an RLS-scoped evidence client minted
//        from the throwaway user's own credentials, asserting the DB (not just the local mirror)
//        received the value.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-19

import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect } from '../support/fixtures';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../support/env';

// The proficiency label strings the TB-1 code maps (src/features/home/useHome.ts proficiencyLabel):
//   0 → "Complete beginner", 1 → "A few words", 2 → "Basic conversation", null/other → "Student".
const LABEL_LEVEL_2 = 'Basic conversation';
const LABEL_LEVEL_1 = 'A few words';
// The paywall level name that the conflation bug used to fabricate on Home for every fresh user;
// the TB-1 Home greeting must NEVER show it (it now lives only inside the unlock modal's Level Guide).
const PAYWALL_ABSOLUTE_BEGINNER = 'Absolute Beginner';

/**
 * Drive the real signup + onboarding UI for a brand-new fake-email user all the way to Home,
 * choosing the given placement option label at the "Where are you starting?" step and the
 * structured course (shortest path to Home). No IndexedDB onboarding seed is injected, so the
 * genuine placement→profiles write runs on finish.
 */
async function registerWithPlacement(
  page: Page,
  email: string,
  password: string,
  placementLabel: RegExp,
): Promise<void> {
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

  // Placement — TB-1 under test: pick the level-2 "Basic conversation" option.
  await expect(page.getByRole('heading', { name: 'Where are you starting?' })).toBeVisible();
  await page.getByRole('button', { name: placementLabel }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'How do you want to learn?' })).toBeVisible();
  await page.getByRole('button', { name: /Follow the structured course/i }).click();

  await expect(page.getByRole('heading', { name: 'Your first words' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page.getByRole('heading', { name: 'One last thing' })).toBeVisible();
  const startLearning = page.getByRole('button', { name: 'Start learning' });
  await expect(startLearning).toBeDisabled();
  await page.locator('input[type="checkbox"]').nth(0).check({ force: true });
  await page.locator('input[type="checkbox"]').nth(1).check({ force: true });
  await expect(startLearning).toBeEnabled();
  await startLearning.click();
}

/**
 * Capture the paywall unlock-modal copy that reflects `unlocked_level` ("Enter your access key to
 * unlock Month N …"). Opens the modal via the Home greeting's Key CTA, reads the paragraph, and
 * closes it again. This is the R5 invariant probe: the same string before and after the proficiency
 * change proves changing proficiency did not move the paywall.
 */
async function readPaywallUnlockCopy(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Unlock Next Level' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Unlock Level' })).toBeVisible();
  const copy = (await dialog.getByText(/Enter your access key to unlock Month/i).textContent()) ?? '';
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return copy.trim().replace(/\s+/g, ' ');
}

test.describe('TB-1 proficiency level (placement → DB → Home → Settings, paywall-separated)', () => {
  test('placement persists, Home labels it, Settings changes it, paywall is unaffected', async ({
    browser,
    coverage,
  }) => {
    // Fully clean context — no storageState, no makeInitScript onboarding seed — so the REAL
    // placement step runs and its profiles write is genuinely exercised (mirrors spec 63).
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    const nonce = `${Date.now()}-proficiency`;
    const email = `e2e-proficiency-${nonce}@example.test`;
    const prefix = email.split('@')[0];
    const password = `FmE2E!${Date.now()}`;

    // --- 1. Register + onboard choosing "Basic conversation" (PracticalLevel 2). --------------
    await registerWithPlacement(page, email, password, /Basic conversation/i);
    coverage.touch('onboarding.consent.start_learning', 'outcome-asserted');

    const greeting = page.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix}`, 'i') });
    await expect(greeting).toBeVisible({ timeout: 30_000 });

    // --- 2. Home greeting shows the level-2 label, NOT the paywall "Absolute Beginner". -------
    // The proficiency label renders in the greeting sub-line next to the greeting heading.
    await expect(page.getByText(LABEL_LEVEL_2, { exact: true })).toBeVisible();
    await expect(page.getByText(PAYWALL_ABSOLUTE_BEGINNER, { exact: true })).toHaveCount(0);

    // --- 4a. Capture the paywall unlock copy BEFORE the proficiency change (R5 probe). --------
    // For a fresh user unlocked_level is null → default 1 → "Month 2"; the exact string is
    // compared, not the number, so the assertion is robust to any future default.
    const paywallBefore = await readPaywallUnlockCopy(page);
    expect(paywallBefore).toMatch(/Enter your access key to unlock Month \d+/i);

    // --- 3. Settings → "Your level": change to the level-1 "A few words" option. --------------
    await page.getByRole('button', { name: 'Profile' }).first().click();
    const proficiencyCard = page.getByTestId('proficiency-card');
    await expect(proficiencyCard.getByText('Your level', { exact: true })).toBeVisible();
    // Level 2 is the current selection after onboarding placement.
    await expect(page.getByTestId('proficiency-option-2')).toHaveAttribute('aria-pressed', 'true');
    // Select level 1 ("A few words").
    await page.getByTestId('proficiency-option-1').click();
    await expect(page.getByTestId('proficiency-option-1')).toHaveAttribute('aria-pressed', 'true');
    coverage.touch('settings.proficiency.select', 'outcome-asserted');

    // Return to Home — the greeting now reflects the new level-1 label, not the old level-2 one.
    await page.getByRole('button', { name: /^Home$/ }).first().click();
    await expect(greeting).toBeVisible();
    await expect(page.getByText(LABEL_LEVEL_1, { exact: true })).toBeVisible();
    await expect(page.getByText(LABEL_LEVEL_2, { exact: true })).toHaveCount(0);

    // --- 4b. Capture the paywall unlock copy AFTER the change and assert it is UNCHANGED. -----
    const paywallAfter = await readPaywallUnlockCopy(page);
    expect(
      paywallAfter,
      'changing proficiency must not move the paywall (separation invariant R5)',
    ).toBe(paywallBefore);

    // --- 3 (persist). Full page reload — the new level survives (DB-backed, not session-only). -
    await page.reload();
    await expect(greeting).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(LABEL_LEVEL_1, { exact: true })).toBeVisible();
    await expect(page.getByText(LABEL_LEVEL_2, { exact: true })).toHaveCount(0);
    // Paywall still unchanged after reload — proves neither the change nor the reload touched it.
    const paywallAfterReload = await readPaywallUnlockCopy(page);
    expect(paywallAfterReload).toBe(paywallBefore);

    // --- 5. DB persistence: read profiles.proficiency_level via an RLS-scoped evidence client. -
    // Mint a fresh session for THIS throwaway user from its own credentials (independent of the
    // app's browser session — Supabase sessions don't invalidate each other), then self-read the
    // profile row under RLS to prove the write reached the DB, not just the local mirror.
    const evidence: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await evidence.auth.signInWithPassword({ email, password });
    expect(signInError, `evidence sign-in failed: ${signInError?.message ?? ''}`).toBeNull();
    const { data: authData } = await evidence.auth.getUser();
    const userId = authData.user?.id ?? '';
    expect(userId).not.toBe('');

    await expect
      .poll(
        async () => {
          const { data } = await evidence
            .from('profiles')
            .select('proficiency_level, unlocked_level')
            .eq('id', userId)
            .single();
          return data ?? null;
        },
        { timeout: 12_000, message: 'profiles.proficiency_level did not persist after the Settings change' },
      )
      .toMatchObject({ proficiency_level: 1 });

    // Invariant at the DB tier too: proficiency changed to 1 while unlocked_level was never set by
    // this flow (null / unchanged) — placement + the Settings control never touch the paywall field.
    const { data: finalRow } = await evidence
      .from('profiles')
      .select('proficiency_level, unlocked_level')
      .eq('id', userId)
      .single();
    expect(finalRow?.proficiency_level).toBe(1);
    expect(
      finalRow?.unlocked_level == null || finalRow?.unlocked_level === 1,
      `unlocked_level must be untouched by the proficiency flow, got ${String(finalRow?.unlocked_level)}`,
    ).toBeTruthy();

    await evidence.auth.signOut();
    await context.close();
  });
});
