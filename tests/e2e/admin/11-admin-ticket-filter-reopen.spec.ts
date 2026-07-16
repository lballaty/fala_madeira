// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/11-admin-ticket-filter-reopen.spec.ts
// Description: Coverage-backlog spec (2026-07-16 audit) for two admin ticket-queue controls that
//   had no e2e coverage: the "Filter tickets by status" select and the "Reopen ticket" action.
//   Seeds a closed ticket directly (user-RLS insert + admin close), filters the queue to closed,
//   reopens the ticket from the UI, and asserts the DB row transitions back to open.
// Author: Coverage audit (with assistant)
// Created: 2026-07-16

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('admin ticket filter + reopen', () => {
  test('admin filters tickets to closed and reopens one; DB row returns to open', async ({
    adminPage,
    userEvidence,
    adminEvidence,
    testUser,
    coverage,
  }) => {
    const nonce = Date.now().toString();
    const subject = `E2E reopen ticket ${nonce}`;

    try {
      // Seed: user inserts an open ticket (owner RLS), admin closes it (admin RLS) so the
      // reopen control is deterministically present.
      const { error: insertError } = await userEvidence.from('tickets').insert({
        user_id: testUser.userId,
        subject,
        description: `Seeded for the reopen-control regression ${nonce}`,
        status: 'open',
      });
      expect(insertError).toBeNull();
      const { error: closeError } = await adminEvidence
        .from('tickets')
        .update({ status: 'closed' })
        .eq('subject', subject);
      expect(closeError).toBeNull();

      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

      // Filter the ticket queue down to closed tickets.
      const filter = adminPage.getByLabel('Filter tickets by status');
      await filter.scrollIntoViewIfNeeded();
      await filter.selectOption('closed');
      await expect(adminPage.getByText(subject)).toBeVisible();
      coverage.touch('admin.queues.ticket.filter_status', 'outcome-asserted');

      // Reopen it from the seeded ticket's card.
      const ticketCard = adminPage
        .getByText(subject)
        .locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await ticketCard.getByRole('button', { name: 'Reopen ticket' }).click();

      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence
              .from('tickets')
              .select('status')
              .eq('subject', subject)
              .maybeSingle();
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'ticket did not transition back to open after Reopen' },
        )
        .toBe('open');
      coverage.touch('admin.queues.ticket.reopen', 'outcome-asserted');
    } finally {
      await adminEvidence.from('tickets').delete().eq('subject', subject);
    }
  });
});
