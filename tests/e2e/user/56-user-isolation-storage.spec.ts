// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/56-user-isolation-storage.spec.ts
// Description: SEC-2 regression. On a shared device the app must not bleed one user's durable
//   client state into the next. Root cause was device-global storage keys (e.g. paths:selection)
//   not scoped by user. This proves the primary fix in a real browser: the learner's path
//   selection now persists under a PER-USER key (paths:selection:${userId}) and NOTHING is written
//   to the legacy shared global key that was the bleed vector. Also covers WP1's legacy→per-user
//   migration and WP2's logout clearing (wired via onLogoutCleanup) in a real browser. The sync
//   guard is unit-covered (sync-queue.guard.test.ts); clearDeviceUserState logic is unit-covered
//   (session-cleanup.test.ts). Not reproducible single-user e2e: the no-goal Home state + cross-user
//   drain (user_track_selection persists per user in the DB) and resetForLogout's new-user seeding
//   (needs a second signup) — the last is tracked as a two-user e2e follow-up in SEC-2.
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { test, expect, landOnHome } from '../support/fixtures';
import { readKv, writeKv, deleteKv } from '../support/storage';

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

  test('WP1: a pre-fix legacy device-global selection is migrated into the per-user key on first load, then removed', async ({ page, testUser, coverage }) => {
    await landOnHome(page);
    const perUserKey = `paths:selection:${testUser.userId}`;

    // Simulate an existing install in the app's real store (IndexedDB): a legacy device-global
    // value present, and no per-user value yet. Then reload so hydration runs the migration.
    await writeKv(page, 'paths:selection', { type: 'structured', activeTrackId: null, structuredMonth: 3, structuredDay: 5 });
    await deleteKv(page, perUserKey);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();

    // On first load the value is adopted into the signed-in user's namespace (type + cursor kept)…
    await expect
      .poll(async () => {
        const v = await readKv(page, perUserKey);
        return v && typeof v === 'object' ? (v as { type?: string }).type ?? null : null;
      })
      .toBe('structured');
    const migrated = (await readKv(page, perUserKey)) as { structuredMonth?: number } | null;
    expect(migrated?.structuredMonth).toBe(3); // structured cursor preserved through the migration

    // …and the legacy device-global key is deleted so it can never bleed to another user again.
    expect(await readKv(page, 'paths:selection')).toBeNull();
    coverage.touch('security.user_isolation.legacy_migration', 'outcome-asserted');
  });

  test('WP2: logout clears device-global client state (lesson cache + anonymous missions)', async ({ page, coverage }) => {
    await landOnHome(page);

    // Seed device-global stores that must NOT survive to the next user: the write-only lesson
    // cache (plain localStorage) and the anonymous missions list (IndexedDB KV, the app's tier).
    await page.evaluate(() => localStorage.setItem('active_lessons_month_1', '[{"id":"x"}]'));
    await writeKv(page, 'missions:log:local', [
      { id: 'm1', situation_id: 's1', status: 'planned', notes: '{}', completed_at: null, created_at: '2026-07-15T00:00:00Z' },
    ]);

    // Sign out via the desktop sidebar (EN-9).
    await page.getByRole('complementary').getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible({ timeout: 15_000 });

    // onLogoutCleanup → clearDeviceUserState() removed both (fire-and-forget → poll).
    await expect
      .poll(async () => ({
        lessons: await page.evaluate(() => localStorage.getItem('active_lessons_month_1')),
        missions: await readKv(page, 'missions:log:local'),
      }))
      .toEqual({ lessons: null, missions: null });
    coverage.touch('security.user_isolation.logout_clears_device_state', 'outcome-asserted');
  });
});
