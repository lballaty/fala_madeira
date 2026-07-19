// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/11-accessibility.spec.ts
// Description: Accessibility smoke (WCAG 2.2 AA target, AGENTS.md §3). Runs axe-core against the
//   key deterministic screens (auth, home, profile, practice hub) and fails on any violation of
//   impact 'critical' or 'serious'. Scoped to critical/serious to keep the signal high; lower-
//   impact findings are reported in the failure message but do not fail the gate. Reuses the
//   suite fixtures + landOnHome. This is a genuine product audit: a failure here is an a11y
//   defect to fix, not a harness bug.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, landOnHome } from './support/fixtures';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function assertNoSeriousViolations(page: Page, label: string) {
  // Let framer-motion entrance fades (App tab wrapper + HomeView: initial opacity 0 → 1, ~0.3s)
  // settle before the snapshot. axe computes EFFECTIVE colour including opacity, so scanning
  // mid-fade caught e.g. Home's "See All" (--fm-brand #0057B7) at ~83% opacity = 4.44:1 — a false
  // serious color-contrast violation; at rest it is ~5.6:1 (passes AA). Audit the settled UI.
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  const summary = blocking
    .map((v) => `  [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s); first: ${v.nodes[0]?.target?.join(' ')}`)
    .join('\n');
  expect(blocking, `${label} has critical/serious a11y violations:\n${summary}`).toEqual([]);
}

test.describe('@a11y accessibility smoke (WCAG 2.2 AA)', () => {
  test('auth screen has no critical/serious violations', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Log In|Sign Up/i }).first()).toBeVisible({ timeout: 30_000 });
    await assertNoSeriousViolations(page, 'Auth screen');
    await context.close();
  });

  test('home screen has no critical/serious violations', async ({ page }) => {
    await landOnHome(page);
    await assertNoSeriousViolations(page, 'Home screen');
  });

  test('profile/settings screen has no critical/serious violations', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await assertNoSeriousViolations(page, 'Profile screen');
  });

  test('practice hub has no critical/serious violations', async ({ page }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();
    await assertNoSeriousViolations(page, 'Practice hub');
  });
});
