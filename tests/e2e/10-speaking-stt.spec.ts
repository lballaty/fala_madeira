// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/10-speaking-stt.spec.ts
// Description: S10 Speaking / Pronunciation slice. Uses a browser-level fake SpeechRecognition
//   injected before app startup so the existing web speech adapter resolves as available without
//   product-code changes. This keeps the STT path deterministic: the Repeat-after-me drill scores
//   a mocked transcript and persists a real pronunciation_attempts row for the throwaway user.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test, expect, landOnHome } from './support/fixtures';
import { installMockSpeechRecognition, setMockSpeechTranscript } from './support/mockSpeechRecognition';

test.describe('speaking / pronunciation STT (S10)', () => {
  test('repeat-after-me scores mocked speech and persists pronunciation_attempts', async ({ page, userEvidence, testUser, coverage }) => {
    await installMockSpeechRecognition(page);

    await landOnHome(page);
    await page.getByRole('button', { name: 'Practice' }).first().click();
    await page.getByText('Speaking & Pronunciation', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Speaking & Pronunciation' })).toBeVisible();

    await page.getByRole('button', { name: 'Repeat after me' }).click();
    await expect(page.getByRole('button', { name: 'Speak' })).toBeVisible();

    const phrase = (await page.locator('div.bg-card p').first().textContent())?.trim();
    if (!phrase) {
      throw new Error('Could not read the first repeat-after-me phrase for the mock transcript.');
    }

    const startedAt = new Date().toISOString();
    await setMockSpeechTranscript(page, phrase);

    await page.getByRole('button', { name: 'Speak' }).click();
    await expect(page.getByText(`Heard: “${phrase}”`)).toBeVisible();
    await expect(page.getByText('100%')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next phrase' })).toBeVisible();

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
            entry.score.mode === 'repeat'
          ));

          if (!row || typeof row.score !== 'object' || row.score === null || !('accuracy' in row.score)) {
            return null;
          }

          return `${row.score.mode}|${row.score.accuracy}`;
        },
        { timeout: 12_000, message: 'pronunciation_attempts row was not created from mocked Repeat-after-me STT' },
      )
      .toBe('repeat|1');

    // Deepen practice.speaking.repeat.next_phrase beyond presence: advancing calls next(),
    // which resets the drill to the idle phase for the next phrase — the scored-state
    // "Next phrase" control unmounts and the Speak control is ready again (RepeatAfterMe.tsx).
    await page.getByRole('button', { name: 'Next phrase' }).click();
    await expect(page.getByRole('button', { name: 'Next phrase' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Speak' })).toBeVisible();
    coverage.touch('practice.speaking.repeat.next_phrase', 'outcome-asserted');
  });
});
