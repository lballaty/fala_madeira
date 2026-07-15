// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/56-user-isolation-storage.spec.ts
// Description: SEC-2 regression. On a shared device the app must not bleed one user's durable
//   client state into the next. Root cause was device-global storage keys (e.g. paths:selection)
//   not scoped by user. This proves the primary fix in a real browser: the learner's path
//   selection now persists under a PER-USER key (paths:selection:${userId}) and NOTHING is written
//   to the legacy shared global key that was the bleed vector. The guard + logout-clear paths are
//   unit-covered (sync-queue.guard.test.ts, session-cleanup.test.ts); the null-state and cross-user
//   drain cannot be reliably reproduced e2e (user_track_selection persists per user in the DB).
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';
import { readKv } from '../support/storage';

test.describe('user isolation: device storage (SEC-2)', () => {
  test('path selection persists under a per-user key, never the shared global key', async ({ page, testUser, coverage }) => {
    await landOnHome(page);

    // Make a distinctive, persisted choice as this user: switch to Goal track and pick a goal.
    await page.getByRole('button', { name: 'Profile' }).first().click();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await page.getByTestId('path-switcher').getByRole('button', { name: 'Goal track' }).click();
    await page.getByTestId('goal-track-chooser').getByRole('button').first().click();

    // The selection is written under the PER-USER key (isolation by namespacing)…
    await expect
      .poll(async () => {
        const v = await readKv(page, `paths:selection:${testUser.userId}`);
        return v && typeof v === 'object' && 'type' in v ? (v as { type?: string }).type ?? null : null;
      })
      .toBe('goal-track');

    // …and the legacy device-global key (the old cross-user bleed vector) is never written.
    expect(await readKv(page, 'paths:selection')).toBeNull();
    coverage.touch('security.user_isolation.paths_namespaced', 'outcome-asserted');
  });
});
