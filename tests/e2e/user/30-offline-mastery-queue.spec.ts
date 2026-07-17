// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/30-offline-mastery-queue.spec.ts
// Description: Offline write-queue coverage for mastery_items. Grades a known vocabulary card
//   while offline (EN-18 objective quiz: type the correct meaning → skip the mic step →
//   comprehension PASS → 'retrieve' grade), proves the mastery row has not reached the DB yet,
//   reloads to keep the queued write durable, then reconnects and asserts the queued upsert flushes.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';
import { vocabItemKey } from '../../../src/features/practice/vocabulary/itemKeys';

const SITUATION_TITLE = 'Greetings & Presence';
const SITUATION_ID = 'sit-d1-greetings-presence';
const SITUATION_WORDS = ['Bom dia', 'Boa tarde', 'Boa noite', 'Tudo bem?', 'Obrigado/a'];

async function openVocabularyForGreetings(page: Parameters<typeof landOnHome>[0]) {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Practice' }).first().click();
  await page.getByRole('button', { name: 'Browse situations' }).click();
  await expect(page.getByText(/Any track, any level, any situation/i)).toBeVisible();

  const situationCard = page.locator('div').filter({ hasText: SITUATION_TITLE }).first();
  await situationCard.getByRole('button', { name: new RegExp(SITUATION_TITLE) }).click();
  await situationCard.getByRole('button', { name: 'Vocabulary Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();
}

test.describe('offline mastery queue', () => {
  test('offline vocabulary grading flushes the queued mastery write after reconnect', async ({ page, userEvidence, testUser, coverage }) => {
    // Expose the expected meaning on the answer input so the typed grade is deterministic.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('fm:e2e', '1');
      } catch {
        /* ignore */
      }
    });

    const { error: resetError } = await userEvidence
      .from('mastery_items')
      .delete()
      .eq('user_id', testUser.userId)
      .eq('dimension', 'retrieve');
    if (resetError) throw resetError;

    try {
      await openVocabularyForGreetings(page);
      coverage.touch('practice.vocabulary.tile', 'outcome-asserted');

      // Let the first card render ONLINE (the session refreshes mastery over the network), then
      // read the word + its expected meaning before going offline.
      const input = page.getByTestId('vocab-answer-input');
      await expect(input).toBeVisible({ timeout: 20_000 });
      const visibleWord = (await page.getByTestId('vocab-word').first().textContent())?.trim() ?? '';
      expect(SITUATION_WORDS).toContain(visibleWord);
      const gradedItemKey = vocabItemKey(SITUATION_ID, visibleWord);
      const expected = (await input.getAttribute('data-answer')) ?? '';
      expect(expected, 'data-answer hint must be exposed under fm:e2e').toBeTruthy();
      // A translation may list alternates ("Good evening/night"); the grader accepts any ONE, so
      // type the first alternate rather than the whole string.
      const answer = expected.split(/[/,;|]| or /i)[0].trim();

      // Grade the card while OFFLINE: type the correct meaning → Check → skip the mic step so the
      // grade is comprehension-only (retrieve, PASS_GRADE=4).
      await page.context().setOffline(true);
      await input.fill(answer);
      await page.getByTestId('vocab-check').click();
      const sayButton = page.getByTestId('vocab-say');
      if (await sayButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.getByTestId('vocab-skip-speaking').click();
      }
      await expect(page.getByTestId('vocab-feedback')).toBeVisible({ timeout: 10_000 });
      coverage.touch('practice.vocabulary.check', 'outcome-asserted');

      await expect
        .poll(
          async () => {
            const { data } = await userEvidence
              .from('mastery_items')
              .select('item_key')
              .eq('user_id', testUser.userId)
              .eq('item_key', gradedItemKey)
              .eq('dimension', 'retrieve')
              .maybeSingle();
            return data?.item_key ?? null;
          },
          { timeout: 3_000, message: 'mastery_items write unexpectedly reached the DB while offline' },
        )
        .toBeNull();

      await page.reload();
      await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible();

      await page.context().setOffline(false);

      await expect
        .poll(
          async () => {
            const { data } = await userEvidence
              .from('mastery_items')
              .select('item_key, dimension, last_grade')
              .eq('user_id', testUser.userId)
              .eq('item_key', gradedItemKey)
              .eq('dimension', 'retrieve')
              .maybeSingle();
            return data ? `${data.item_key}|${data.dimension}|${data.last_grade}` : null;
          },
          { timeout: 15_000, message: 'queued mastery_items write did not flush after reconnect' },
        )
        .toBe(`${gradedItemKey}|retrieve|4`);
    } finally {
      await userEvidence.from('mastery_items').delete().eq('user_id', testUser.userId).eq('dimension', 'retrieve');
    }
  });
});
