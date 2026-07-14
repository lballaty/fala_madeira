// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/30-offline-mastery-queue.spec.ts
// Description: Offline write-queue coverage for mastery_items. Grades a known vocabulary card
//   while offline, proves the mastery row has not reached the DB yet, reloads to keep the queued
//   write durable, then reconnects and asserts the queued upsert flushes successfully.
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
    const { error: resetError } = await userEvidence
      .from('mastery_items')
      .delete()
      .eq('user_id', testUser.userId)
      .eq('dimension', 'retrieve');
    if (resetError) throw resetError;

    try {
      await openVocabularyForGreetings(page);
      coverage.touch('practice.vocabulary.tile', 'outcome-asserted');
      const flashcardFront = page.getByRole('button', { name: 'Flashcard — tap to flip' }).first();

      await page.context().setOffline(true);
      await flashcardFront.click();
      coverage.touch('practice.vocabulary.flashcard', 'outcome-asserted');

      const flashcardBack = page.getByRole('button', { name: 'Card back — grade your recall below' }).first();
      const backWord = flashcardBack.locator('p.text-2xl').first();
      await expect(backWord).toBeVisible();
      const cardWord = await backWord.textContent();
      const visibleWord = cardWord?.trim() ?? '';
      expect(SITUATION_WORDS).toContain(visibleWord);
      const gradedItemKey = vocabItemKey(SITUATION_ID, visibleWord);

      await page.getByRole('button', { name: 'Good' }).click();
      coverage.touch('practice.vocabulary.grade_good', 'outcome-asserted');

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
