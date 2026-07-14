// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/26-speaking-response-speed.spec.ts
// Description: Response-speed drill coverage. Uses mocked browser STT to make the timing path
//   deterministic, then asserts the scored UI state and the persisted pronunciation_attempts row
//   with `mode: speed`.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';
import { installMockSpeechRecognition, setMockSpeechTranscript } from '../support/mockSpeechRecognition';

test.describe('speaking response speed', () => {
  test('response-speed drill scores a mocked response and persists the speed attempt', async ({ page, userEvidence, testUser }) => {
    await installMockSpeechRecognition(page);

    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await page.getByText('Speaking & Pronunciation', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Speaking & Pronunciation' })).toBeVisible();

    await page.getByRole('button', { name: 'Response speed' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();

    const startedAt = new Date().toISOString();
    await setMockSpeechTranscript(page, 'Bom dia');
    await page.getByRole('button', { name: 'Start' }).click();

    await expect(page.getByText(/Good pace|Instant|You got there/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/time to start speaking/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next prompt' })).toBeVisible();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('pronunciation_attempts')
            .select('created_at, score')
            .eq('user_id', testUser.userId)
            .order('created_at', { ascending: false })
            .limit(5);

          const row = data?.find((entry) => (
            typeof entry.created_at === 'string' &&
            entry.created_at >= startedAt &&
            typeof entry.score === 'object' &&
            entry.score !== null &&
            'mode' in entry.score &&
            entry.score.mode === 'speed'
          ));

          if (!row || typeof row.score !== 'object' || row.score === null || !('latencyMs' in row.score)) {
            return null;
          }

          return typeof row.score.latencyMs === 'number' && row.score.latencyMs >= 0;
        },
        { timeout: 12_000, message: 'pronunciation_attempts row was not created for the response-speed drill' },
      )
      .toBe(true);
  });
});
