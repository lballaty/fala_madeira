// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/__tests__/dedupeByWord.test.ts
// Description: EN-18 (WP6) unit test — the quiz asks each word ONCE (comprehension + production in a
//   single card), so the session queue must collapse to one card per item_key. Proves dedupeByWord
//   keeps the first (highest-priority) occurrence and preserves order.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { describe, it, expect } from 'vitest';
import { dedupeByWord, type VocabCard } from '../useVocabularySession';

const card = (itemKey: string, dimension: VocabCard['dimension'], isNew = false): VocabCard => ({
  itemKey,
  dimension,
  variant: isNew ? 'introduce' : dimension === 'hear' ? 'hear' : 'retrieve',
  isNew,
  situationId: 's1',
  entry: { word: itemKey, translation: `${itemKey}-en` },
});

describe('dedupeByWord (EN-18 one card per word)', () => {
  it('keeps the first occurrence of a repeated item_key (retrieve before hear)', () => {
    const queue = [
      card('vocab:s1:a', 'retrieve'),
      card('vocab:s1:b', 'retrieve'),
      card('vocab:s1:a', 'hear'), // same word, lower-priority dimension → dropped
    ];
    const out = dedupeByWord(queue);
    expect(out.map((c) => c.itemKey)).toEqual(['vocab:s1:a', 'vocab:s1:b']);
    expect(out[0].dimension).toBe('retrieve');
  });

  it('preserves order and passes through an already-unique queue', () => {
    const queue = [card('vocab:s1:x', 'retrieve'), card('vocab:s1:y', 'retrieve', true)];
    expect(dedupeByWord(queue)).toEqual(queue);
  });

  it('returns empty for an empty queue', () => {
    expect(dedupeByWord([])).toEqual([]);
  });
});
