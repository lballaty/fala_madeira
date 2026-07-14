// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/10-admin-all-tickets.spec.ts
// Description: Regression coverage for the admin "all tickets" triage view. The review queue now
//   shows ALL tickets (not just open/in-progress), filterable by status + free-text search, with a
//   Reopen action for closed tickets. Seeds an open and a closed ticket through the throwaway user,
//   drives the status filter + search in the real admin UI, and asserts closed-ticket visibility and
//   the reopen outcome via the admin evidence client. Guards the gap that hid triaged testers' reports.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import type { Locator } from '@playwright/test';
import { test, expect, landOnHome } from '../support/fixtures';

function queueCard(pageTextLocator: Locator) {
  return pageTextLocator.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
}

test.describe('admin all-tickets triage view', () => {
  test('admin filters by status + search to see closed tickets and can reopen them', async ({
    adminPage,
    adminEvidence,
    userEvidence,
    testUser,
  }) => {
    const nonce = Date.now().toString();
    const openSubject = `All-tickets OPEN ${nonce}`;
    const closedSubject = `All-tickets CLOSED ${nonce}`;

    try {
      // Seed one open ticket and one that we then triage to closed (mirrors the real flow: users
      // can only insert their own tickets; the admin closes them).
      const openInsert = await userEvidence.from('tickets').insert({
        user_id: testUser.userId,
        subject: openSubject,
        description: `open ticket ${nonce}`,
        status: 'open',
        priority: 'medium',
      });
      expect(openInsert.error?.message ?? null).toBeNull();

      const closedInsert = await userEvidence.from('tickets').insert({
        user_id: testUser.userId,
        subject: closedSubject,
        description: `closed ticket ${nonce}`,
        status: 'open',
        priority: 'medium',
      });
      expect(closedInsert.error?.message ?? null).toBeNull();
      const closeUpdate = await adminEvidence
        .from('tickets')
        .update({ status: 'closed' })
        .eq('subject', closedSubject);
      expect(closeUpdate.error?.message ?? null).toBeNull();

      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();

      const search = adminPage.getByLabel('Search tickets');
      const statusFilter = adminPage.getByLabel('Filter tickets by status');
      await expect(search).toBeVisible();

      // Default filter = 'open': the closed ticket is NOT shown (this was the old gap).
      await search.fill(closedSubject);
      await expect(adminPage.getByText(closedSubject)).toHaveCount(0);

      // Switch to 'Closed': the closed ticket becomes visible.
      await statusFilter.selectOption('closed');
      await expect(adminPage.getByText(closedSubject)).toBeVisible();

      // 'All' + search the open subject: the open ticket is visible.
      await statusFilter.selectOption('all');
      await search.fill(openSubject);
      await expect(adminPage.getByText(openSubject)).toBeVisible();

      // Reopen the closed ticket → DB status returns to 'open'.
      await statusFilter.selectOption('closed');
      await search.fill(closedSubject);
      const closedCard = queueCard(adminPage.getByText(closedSubject));
      await closedCard.getByRole('button', { name: 'Reopen ticket' }).click();
      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('tickets')
              .select('status')
              .eq('subject', closedSubject)
              .maybeSingle();
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'ticket did not reopen to open' },
        )
        .toBe('open');
    } finally {
      await adminEvidence.from('tickets').delete().eq('subject', openSubject);
      await adminEvidence.from('tickets').delete().eq('subject', closedSubject);
    }
  });
});
