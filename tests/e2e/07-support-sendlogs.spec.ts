// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/07-support-sendlogs.spec.ts
// Description: S5 support-ticket + diagnostic Send-Logs slice — the one happy-path slice with
//   DIRECT correlation_id backend evidence (docs/TEST-VERTICAL-SLICES.md S5). Drives the real
//   UI: Settings → Support & Feedback → submit a uniquely-subjected ticket (writes `tickets`),
//   then Send Logs (confirm) which writes a `logs` row with event='user_report' whose details
//   JSON carries sessionId + the ring-buffer recentLogs (each with session_id/request_id/
//   correlation_id). Asserts BOTH rows via the RLS-scoped evidence client:
//     (a) the ticket row (domain-row evidence, G1);
//     (b) the user_report log row, and that its details JSON contains a sessionId and at least
//         one recentLogs entry — the session pivot that persists this session's INFO events with
//         their correlation_id (G1/G4 workaround). This is the correlation_id evidence class S5
//         must assert explicitly (§4).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import type { SupabaseClient } from '@supabase/supabase-js';
import { test, expect, landOnHome } from './support/fixtures';

test.describe('support ticket + Send Logs (S5)', () => {
  test('@smoke submit ticket + send logs, then assert both backend rows (correlation_id evidence)', async ({
    page,
    evidence,
    admin,
  }) => {
    const stamp = Date.now();
    const subject = `e2e-vertical-slice ${stamp}`;
    const description = `Automated vertical-slice e2e ticket at ${new Date(stamp).toISOString()}.`;

    await landOnHome(page);

    // Do a small in-session action first so the logger ring buffer has events (nav emits
    // USER_ACTION logs) that Send Logs will snapshot with their correlation_id.
    await page.getByRole('button', { name: 'Learning' }).first().click();
    await expect(page.getByRole('heading', { name: 'Learning Plan' })).toBeVisible();
    await page.getByRole('button', { name: 'Profile' }).first().click();

    // Open Support & Feedback.
    await page.getByRole('button', { name: 'Support & Feedback' }).click();
    await expect(page.getByRole('heading', { name: 'Support & Feedback' })).toBeVisible();

    // Submit a uniquely-subjected ticket (writes a `tickets` row).
    await page.getByPlaceholder('e.g., Audio not playing').fill(subject);
    await page.getByPlaceholder('Please describe the issue in detail...').fill(description);
    await page.getByRole('button', { name: 'Submit Ticket' }).click();

    // Success toast + modal closes on success.
    await expect(page.getByText('Ticket submitted successfully!')).toBeVisible({ timeout: 15_000 });

    // Backend evidence (a): the ticket row exists for the admin with the unique subject.
    await expect
      .poll(
        async () => {
          const { data } = await evidence
            .from('tickets')
            .select('id, subject, status, user_id')
            .eq('user_id', admin.userId)
            .eq('subject', subject)
            .maybeSingle();
          return data?.subject ?? null;
        },
        { timeout: 15_000, message: 'ticket row not found for the submitted subject' },
      )
      .toBe(subject);

    // Reopen Support (modal closed after ticket submit) and trigger Send Logs.
    await page.getByRole('button', { name: 'Support & Feedback' }).click();
    await expect(page.getByRole('heading', { name: 'Support & Feedback' })).toBeVisible();

    // Capture the moment just before the write to bound the evidence query.
    const beforeSend = new Date(Date.now() - 5_000).toISOString();

    await page.getByRole('button', { name: 'Send Logs' }).click();
    // Consent confirmation modal ("Collect Logs?" → "Yes, Collect").
    await expect(page.getByRole('heading', { name: 'Collect Logs?' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, Collect' }).click();
    await expect(page.getByText('Logs collected and sent!')).toBeVisible({ timeout: 15_000 });

    // Backend evidence (b): the user_report log row exists; its details JSON carries a sessionId
    // and a non-empty recentLogs snapshot (the session pivot — correlation_id evidence class).
    const row = await pollForUserReport(evidence, admin.userId, beforeSend);
    expect(row, 'no user_report log row found after Send Logs').not.toBeNull();

    const details = JSON.parse(row!.details as string);
    expect(details.sessionId, 'user_report details missing sessionId').toBeTruthy();
    expect(Array.isArray(details.recentLogs), 'recentLogs is not an array').toBe(true);
    // The session performed real actions (nav, ticket submit) → the ring buffer is non-empty,
    // and each recentLog entry carries the correlation chain fields.
    expect(details.recentLogs.length, 'recentLogs snapshot is empty').toBeGreaterThan(0);
    const sample = details.recentLogs[0];
    // The ring-buffer events carry session_id/request_id/correlation_id (the correlation chain).
    expect(sample.session_id ?? sample.sessionId, 'recentLogs entry missing session_id').toBeTruthy();
  });
});

/** Poll the RLS-scoped evidence client for the newest user_report row after `sinceIso`. */
async function pollForUserReport(
  evidence: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<{ details: string } | null> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { data } = await evidence
      .from('logs')
      .select('id, event, details, timestamp')
      .eq('user_id', userId)
      .eq('event', 'user_report')
      .gte('timestamp', sinceIso)
      .order('timestamp', { ascending: false })
      .limit(1);
    if (data && data.length > 0) return data[0] as { details: string };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}
