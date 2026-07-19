// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/34-support-ticket-roundtrip.spec.ts
// Description: End-to-end support-ticket journey. A user submits a real support ticket from
//   Settings, the admin closes that exact ticket from Review Queues, and the user refreshes
//   My Submissions to verify the status transition to closed.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('support ticket roundtrip', () => {
  test('user-submitted support ticket can be closed by admin and reflected back in My Submissions', async ({
    page,
    adminPage,
    userEvidence,
    adminEvidence,
    testUser,
    coverage,
  }) => {
    const nonce = Date.now().toString();
    const subject = `E2E support roundtrip ${nonce}`;
    const description = `Roundtrip support description ${nonce}`;

    try {
      await landOnHome(page);
      await page.getByRole('button', { name: 'Settings' }).first().click();

      await page.getByRole('button', { name: 'Support & Feedback' }).click();
      coverage.touch('settings.support.open', 'outcome-asserted');
      const supportDialog = page.getByRole('dialog', { name: 'Support & Feedback' });
      await expect(supportDialog).toBeVisible();

      await supportDialog.getByPlaceholder('e.g., Audio not playing').fill(subject);
      await supportDialog.getByPlaceholder('Please describe the issue in detail...').fill(description);
      await supportDialog.getByRole('button', { name: 'Submit Ticket' }).click();
      coverage.touch('settings.support.submit_ticket', 'outcome-asserted');

      await expect
        .poll(
          async () => {
            const { data } = await userEvidence
              .from('tickets')
              .select('subject, description, status')
              .eq('user_id', testUser.userId)
              .eq('subject', subject)
              .maybeSingle();
            return data ? `${data.subject}|${data.description}|${data.status}` : null;
          },
          { timeout: 12_000, message: 'support ticket row was not created from the user support modal' },
        )
        .toBe(`${subject}|${description}|open`);

      await landOnHome(adminPage);
      await adminPage.getByRole('button', { name: 'Admin' }).first().click();
      await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Review Queues/i })).toBeVisible();

      await expect(adminPage.getByText(subject)).toBeVisible();
      const ticketCard = adminPage.getByText(subject).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await ticketCard.getByRole('button', { name: 'Close ticket' }).click();
      coverage.touch('admin.queues.ticket.close', 'outcome-asserted');

      await expect
        .poll(
          async () => {
            const { data } = await adminEvidence.from('tickets').select('status').eq('subject', subject).maybeSingle();
            return data?.status ?? null;
          },
          { timeout: 12_000, message: 'admin did not close the submitted support ticket' },
        )
        .toBe('closed');

      await landOnHome(page);
      await page.getByRole('button', { name: 'Settings' }).first().click();
      await page.getByRole('button', { name: 'My Submissions' }).click();
      coverage.touch('settings.submissions.open', 'outcome-asserted');
      await expect(page.getByRole('heading', { name: 'My Submissions' })).toBeVisible();

      const refreshButton = page.getByRole('button', { name: 'Refresh submissions' });
      // EF-33/LT10 guard: the refresh control must become enabled after the online reload;
      // if supabase-js wedges before the network layer it stays disabled forever (read-only app).
      await expect(refreshButton).toBeEnabled();
      await refreshButton.click();
      coverage.touch('settings.submissions.refresh', 'outcome-asserted');

      const ticketRow = page.getByText(subject).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await expect(ticketRow).toBeVisible();
      await expect(ticketRow.locator('span').last()).toHaveText('closed');
    } finally {
      await adminEvidence.from('tickets').delete().eq('subject', subject);
    }
  });
});
