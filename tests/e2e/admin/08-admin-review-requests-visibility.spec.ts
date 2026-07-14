// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/08-admin-review-requests-visibility.spec.ts
// Description: Admin lesson-request visibility coverage. Seeds multiple request statuses through
//   the throwaway user, verifies the admin read path can now see them after the lesson_requests
//   policy migration, and asserts that the real Review Queues UI shows only the pending request
//   rows with the matching count for this seeded batch.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

interface RequestReadback {
  theme: string;
  status: string;
}

test.describe('admin review queue lesson request visibility', () => {
  test('admin can read seeded lesson requests and the queue renders only the pending request rows', async ({
    adminPage,
    adminEvidence,
    userEvidence,
    testUser,
  }) => {
    const nonce = Date.now().toString();
    const pendingThemeOne = `Admin visibility pending one ${nonce}`;
    const pendingThemeTwo = `Admin visibility pending two ${nonce}`;
    const reviewedTheme = `Admin visibility reviewed ${nonce}`;

    const pendingInsertOne = await userEvidence.from('lesson_requests').insert({
      user_id: testUser.userId,
      theme: pendingThemeOne,
      description: `Admin visibility pending description one ${nonce}`,
      status: 'pending',
    });
    expect(pendingInsertOne.error?.message ?? null).toBeNull();

    const pendingInsertTwo = await userEvidence.from('lesson_requests').insert({
      user_id: testUser.userId,
      theme: pendingThemeTwo,
      description: `Admin visibility pending description two ${nonce}`,
      status: 'pending',
    });
    expect(pendingInsertTwo.error?.message ?? null).toBeNull();

    const reviewedInsert = await userEvidence.from('lesson_requests').insert({
      user_id: testUser.userId,
      theme: reviewedTheme,
      description: `Admin visibility reviewed description ${nonce}`,
      status: 'reviewed',
    });
    expect(reviewedInsert.error?.message ?? null).toBeNull();

    const expectedReadback: RequestReadback[] = [
      { theme: pendingThemeOne, status: 'pending' },
      { theme: pendingThemeTwo, status: 'pending' },
      { theme: reviewedTheme, status: 'reviewed' },
    ];

    await expect
      .poll(
        async () => {
          const themes = [pendingThemeOne, pendingThemeTwo, reviewedTheme];
          const rows = await Promise.all(
            themes.map(async (theme) => {
              const { data } = await adminEvidence
                .from('lesson_requests')
                .select('theme, status')
                .eq('theme', theme)
                .maybeSingle();
              return data ? { theme: data.theme, status: data.status } : null;
            }),
          );
          return rows.filter((row): row is RequestReadback => row !== null).sort((a, b) => a.theme.localeCompare(b.theme));
        },
        { timeout: 12_000, message: 'admin read path did not return the seeded lesson_requests rows' },
      )
      .toEqual([...expectedReadback].sort((a, b) => a.theme.localeCompare(b.theme)));

    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await adminPage.getByRole('button', { name: /Review Queues/i }).click();

    const requestSection = adminPage.locator('section').filter({ has: adminPage.getByText('Lesson Requests') }).first();
    const seededPendingCards = requestSection.locator('div.p-3').filter({ hasText: nonce });

    await expect(requestSection.getByText(pendingThemeOne)).toBeVisible();
    await expect(requestSection.getByText(pendingThemeTwo)).toBeVisible();
    await expect(requestSection.getByText(reviewedTheme)).toHaveCount(0);
    await expect(seededPendingCards).toHaveCount(2);
  });
});
