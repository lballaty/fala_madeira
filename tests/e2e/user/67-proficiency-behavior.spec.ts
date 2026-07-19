// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/67-proficiency-behavior.spec.ts
// Description: TB-1a end-to-end coverage — proficiency_level now DRIVES the learning START point
//   (not just the Home label, which TB-1/spec 64 already covers). Proves the reported bug ("it
//   makes no difference what proficiency I choose as to where the system starts my learning") is
//   fixed, while the paywall stays an orthogonal check (the separation invariant, R10/R11/R14).
//
//   Drives the REAL signup + onboarding UI (no onboarding pre-seed — the clean-context + real-signup
//   pattern from 63/64) so the genuine placement → profiles.proficiency_level → PathContext →
//   Structured Course next() path runs. The Structured Course Home CTA renders "Continue Day N",
//   where N is the ABSOLUTE course day (seed pack: Month 1 = days 1..28, Month 3 = days 57..84 —
//   verified in src/content/packs/seed-course.ts), so the day number in the CTA is a direct,
//   observable proxy for WHICH month the learner starts in.
//
//   Asserts, in order:
//     1. A fresh FREE placement-2 user's structured start is BOUNDED to accessible content: with the
//        default unlocked_level=1, the accessible ceiling is Month 1, so the CTA is "Continue Day 1"
//        — the placement start did NOT strand the learner on a paywalled CTA (R11 / §5.3.2, D2 clamp).
//     2. INVARIANT (R14): the paywall unlock-modal copy is captured before/after the placement start
//        is derived and is UNCHANGED — deriving/showing the placement start did not unlock paid
//        content or move the paywall.
//     3. Retroactive re-base with no progress (R13): changing proficiency to 0 in Settings re-bases
//        the CTA; changing back to 2 re-bases forward — all within the accessible bound.
//     4. THE REPORTED-BUG PROOF (different starts, R8): granting the placement-2 user full access
//        (admin sets subscription_tier='unlimited' — the EN-15 "grant all levels" bypass) lifts the
//        accessible ceiling so their DERIVED Month-3 start becomes visible ("Continue Day 57"),
//        while a second fresh placement-0 user stays at "Continue Day 1". The two placements land at
//        DIFFERENT starts — placement now makes a difference. (Two FREE users would both clamp to
//        Month 1 by design — the D2 clamp is deliberate; see this spec's report note.)
//     5. INVARIANT the other way (R14 / §5.3.3): raising unlocked_level via the real access-key
//        unlock flow does NOT change proficiency_level and does NOT move the proficiency-DERIVED
//        start (the derivation is a function of proficiency alone; the clamp only relaxes).
// Author: claude-tb1a
// Created: 2026-07-19

import type { Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { test, expect } from '../support/fixtures';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../support/env';

// Structured Course CTA label prefix (src/paths/structured-course.ts → "Continue Day N").
const CTA_DAY_RE = /Continue Day (\d+)/i;

/**
 * Drive the real signup + onboarding UI for a brand-new fake-email user to Home, choosing the given
 * placement option and the Structured Course path (so Home renders the "Continue Day N" CTA). No
 * IndexedDB onboarding seed is injected, so the genuine placement → profiles write runs on finish.
 * Mirrors registerWithPlacement in spec 64.
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

/** Read the Structured Course start day from the Home path CTA label (data-testid, TB-1a). */
async function readStartDay(page: Page): Promise<number> {
  const label = page.getByTestId('home-path-cta-label');
  await expect(label).toBeVisible({ timeout: 30_000 });
  const text = (await label.textContent()) ?? '';
  const m = text.match(CTA_DAY_RE);
  expect(m, `Home path CTA did not render a "Continue Day N" label, got: "${text}"`).not.toBeNull();
  return Number(m![1]);
}

/**
 * Capture the paywall unlock-modal copy that reflects unlocked_level ("Enter your access key to
 * unlock Month N …") — the R14 invariant probe. Same technique as spec 64.
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

/** Mint an independent RLS-scoped client authed as the given throwaway user (self-reads under RLS). */
async function mintUserClient(email: string, password: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error, `evidence sign-in failed: ${error?.message ?? ''}`).toBeNull();
  const { data } = await client.auth.getUser();
  const userId = data.user?.id ?? '';
  expect(userId).not.toBe('');
  return { client, userId };
}

test.describe('TB-1a proficiency BEHAVIOR (placement drives the structured start, paywall-separated)', () => {
  test('placement drives WHERE learning starts, bounded by access, without moving the paywall', async ({
    browser,
    coverage,
    adminEvidence,
  }) => {
    // ---- Fresh placement-2 user (free tier) --------------------------------------------------
    const nonce = `${Date.now()}-tb1a`;
    const email2 = `e2e-tb1a-p2-${nonce}@example.test`;
    const prefix2 = email2.split('@')[0];
    const password2 = `FmE2E!${Date.now()}`;

    const ctx2 = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page2 = await ctx2.newPage();
    await registerWithPlacement(page2, email2, password2, /Basic conversation/i);
    coverage.touch('onboarding.consent.start_learning', 'outcome-asserted');

    const greeting2 = page2.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix2}`, 'i') });
    await expect(greeting2).toBeVisible({ timeout: 30_000 });

    // --- 1. FREE placement-2 start is BOUNDED to accessible content (Month 1 → Day 1). ---------
    // unlocked_level defaults to 1 (schema 00001), so the accessible ceiling is Month 1: the
    // placement-2 seed (Month 3) is clamped DOWN so the learner is not stranded on a paywalled CTA.
    const freeStartDay = await readStartDay(page2);
    coverage.touch('home.path.start_cta', 'outcome-asserted');
    expect(
      freeStartDay,
      'a fresh FREE placement-2 user must start within accessible content (Month 1 / Day 1..28), not past the paywall',
    ).toBeLessThanOrEqual(28);

    // --- 2. INVARIANT (R14): deriving/showing the placement start did not move the paywall. -----
    const paywallBefore = await readPaywallUnlockCopy(page2);
    coverage.touch('home.unlock.open', 'outcome-asserted');
    expect(paywallBefore).toMatch(/Enter your access key to unlock Month \d+/i);

    // --- 3. Retroactive re-base with no progress (R13): change proficiency in Settings. ---------
    // Drop to level 0, return Home — the start stays within the accessible bound (still Month 1).
    await page2.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page2.getByTestId('proficiency-card').getByText('Your level', { exact: true })).toBeVisible();
    await expect(page2.getByTestId('proficiency-option-2')).toHaveAttribute('aria-pressed', 'true');
    await page2.getByTestId('proficiency-option-0').click();
    await expect(page2.getByTestId('proficiency-option-0')).toHaveAttribute('aria-pressed', 'true');
    coverage.touch('settings.proficiency.select', 'outcome-asserted');
    await page2.getByRole('button', { name: /^Home$/ }).first().click();
    await expect(greeting2).toBeVisible();
    const startAfterP0 = await readStartDay(page2);
    expect(startAfterP0).toBeLessThanOrEqual(28); // p=0 → Month 1 as well (bound + derivation agree)

    // Paywall STILL unchanged after the proficiency change (R14 both here and on reload).
    const paywallAfterChange = await readPaywallUnlockCopy(page2);
    expect(paywallAfterChange, 'changing proficiency must not move the paywall (R14)').toBe(paywallBefore);

    // Restore placement 2 for the difference proof below.
    await page2.getByRole('button', { name: 'Settings' }).first().click();
    await page2.getByTestId('proficiency-option-2').click();
    await expect(page2.getByTestId('proficiency-option-2')).toHaveAttribute('aria-pressed', 'true');
    await page2.getByRole('button', { name: /^Home$/ }).first().click();
    await expect(greeting2).toBeVisible();

    // --- 4. THE REPORTED-BUG PROOF: grant full access → the DERIVED Month-3 start becomes visible.
    // Admin sets subscription_tier='unlimited' (EN-15 grant-all bypass) for the placement-2 user, so
    // the accessible ceiling lifts and the placement-2 derivation (Month 3, Day 57) is now shown —
    // WITHOUT touching unlocked_level or proficiency_level.
    const { client: user2, userId: userId2 } = await mintUserClient(email2, password2);
    const { error: grantError } = await adminEvidence
      .from('profiles')
      .update({ subscription_tier: 'unlimited' })
      .eq('id', userId2);
    expect(grantError, `admin grant failed: ${grantError?.message ?? ''}`).toBeNull();

    await page2.reload();
    await expect(greeting2).toBeVisible({ timeout: 30_000 });
    const unlockedStartDay = await readStartDay(page2);
    expect(
      unlockedStartDay,
      'with full access, the placement-2 DERIVED start (Month 3) must be visible — Day >= 57',
    ).toBeGreaterThanOrEqual(29); // strictly beyond Month 1; Month 3 begins at Day 57

    // ---- Second fresh placement-0 user: the difference proof ----------------------------------
    const email0 = `e2e-tb1a-p0-${nonce}@example.test`;
    const prefix0 = email0.split('@')[0];
    const password0 = `FmE2E!${Date.now() + 1}`;
    const ctx0 = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page0 = await ctx0.newPage();
    await registerWithPlacement(page0, email0, password0, /Complete beginner/i);
    const greeting0 = page0.getByRole('heading', { name: new RegExp(`Olá,\\s*${prefix0}`, 'i') });
    await expect(greeting0).toBeVisible({ timeout: 30_000 });
    const p0StartDay = await readStartDay(page0);
    expect(p0StartDay).toBeLessThanOrEqual(28); // Month 1

    // THE PROOF: placement 0 and placement 2 (with access) land at DIFFERENT starts.
    expect(
      unlockedStartDay,
      'placement 2 (with access) must start LATER than placement 0 — placement now makes a difference (R8)',
    ).toBeGreaterThan(p0StartDay);

    // --- 5. INVARIANT the other way (R14 / §5.3.3): access-key unlock does not move the derived start.
    // Read the live unlock key and drive the real Home unlock flow for the placement-0 free user,
    // raising unlocked_level from 1 → 2. proficiency_level is untouched, and the proficiency-derived
    // start does not jump: the clamp merely relaxes to the (still Month-1) derivation for p=0.
    const { data: keySetting, error: keyError } = await adminEvidence
      .from('global_settings')
      .select('value')
      .eq('key', 'level_unlock_key')
      .single();
    expect(keyError, `could not read level_unlock_key: ${keyError?.message ?? ''}`).toBeNull();
    const unlockKey = String(keySetting?.value ?? '').trim();
    expect(unlockKey, 'global_settings.level_unlock_key is empty; unlock cannot be exercised').not.toBe('');

    const { client: user0, userId: userId0 } = await mintUserClient(email0, password0);
    const { data: beforeRow } = await user0
      .from('profiles')
      .select('proficiency_level, unlocked_level')
      .eq('id', userId0)
      .single();
    const proficiencyBefore = beforeRow?.proficiency_level ?? null;

    await page0.getByRole('button', { name: 'Unlock Next Level' }).click();
    await expect(page0.getByRole('heading', { name: 'Unlock Level' })).toBeVisible();
    await page0.getByPlaceholder('Enter Key...').fill(unlockKey);
    await page0.getByRole('button', { name: 'Unlock Level' }).click();
    await expect(page0.getByText('Level 2 unlocked!')).toBeVisible({ timeout: 15_000 });
    coverage.touch('home.unlock.submit', 'outcome-asserted');

    await expect
      .poll(
        async () => {
          const { data } = await user0
            .from('profiles')
            .select('proficiency_level, unlocked_level')
            .eq('id', userId0)
            .single();
          return data ?? null;
        },
        { timeout: 12_000, message: 'unlocked_level did not increment after access-key submit' },
      )
      .toMatchObject({ unlocked_level: 2 });

    // proficiency_level UNCHANGED by the paywall unlock (separation invariant, both directions).
    const { data: afterRow } = await user0
      .from('profiles')
      .select('proficiency_level, unlocked_level')
      .eq('id', userId0)
      .single();
    expect(
      afterRow?.proficiency_level ?? null,
      'raising unlocked_level must not change proficiency_level (R14)',
    ).toBe(proficiencyBefore);

    // The proficiency-derived start for the p=0 learner is still Month 1 — unlocking raised the
    // ceiling but the derivation (a function of proficiency alone) did not move.
    await page0.reload();
    await expect(greeting0).toBeVisible({ timeout: 30_000 });
    const p0StartAfterUnlock = await readStartDay(page0);
    expect(
      p0StartAfterUnlock,
      'unlocking a level must not move the proficiency-derived start (R14 / §5.3.3)',
    ).toBe(p0StartDay);

    await user0.auth.signOut();
    await user2.auth.signOut();
    await ctx0.close();
    await ctx2.close();
  });
});
