// File: /Users/liborballaty/.../src/features/practice/vocabulary/__tests__/itemKeys.test.ts
// Description: Unit tests for the vocabulary mastery item_key convention (vocabulary/itemKeys.ts):
//   vocabItemKey build, parseVocabItemKey (round-trip, first-':'-after-prefix split, malformed
//   rejection), isVocabItemKey, and countVocabularyDue (namespace + dimension + due filter).
//   Imports only srs (dependency-free) + schema types, so no mocks are required.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import { initialMasteryState, type MasteryItem } from '../../../../lib/srs';
import {
  countVocabularyDue,
  isVocabItemKey,
  parseVocabItemKey,
  vocabItemKey,
} from '../itemKeys';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const item = (o: Partial<MasteryItem> & Pick<MasteryItem, 'itemKey'>): MasteryItem => ({
  dimension: 'retrieve',
  ...initialMasteryState(),
  ...o,
});

describe('vocabItemKey / parseVocabItemKey', () => {
  it('builds and round-trips a key', () => {
    const key = vocabItemKey('sit-1', 'café');
    expect(key).toBe('vocab:sit-1:café');
    expect(parseVocabItemKey(key)).toEqual({ situationId: 'sit-1', word: 'café' });
  });

  it('splits on the first ":" after the prefix so words containing ":" round-trip', () => {
    const key = vocabItemKey('sit-1', 'a:b');
    expect(parseVocabItemKey(key)).toEqual({ situationId: 'sit-1', word: 'a:b' });
  });

  it('returns null for non-vocab or malformed keys', () => {
    expect(parseVocabItemKey('pattern:sit:x')).toBeNull();
    expect(parseVocabItemKey('vocab:sit-1')).toBeNull(); // no word segment
    expect(parseVocabItemKey('vocab:sit-1:')).toBeNull(); // empty word
    expect(parseVocabItemKey('vocab::word')).toBeNull(); // empty situation
  });

  it('isVocabItemKey mirrors parse success', () => {
    expect(isVocabItemKey('vocab:s:w')).toBe(true);
    expect(isVocabItemKey('other:s:w')).toBe(false);
  });
});

describe('countVocabularyDue', () => {
  it('counts only due vocab items in the retrieve/hear dimensions', () => {
    const items: MasteryItem[] = [
      item({ itemKey: 'vocab:s:a', dimension: 'retrieve', nextReview: null }), // due, counts
      item({ itemKey: 'vocab:s:b', dimension: 'hear', nextReview: null }), // due, counts
      item({ itemKey: 'vocab:s:c', dimension: 'say', nextReview: null }), // wrong dimension
      item({ itemKey: 'pattern:s:d', dimension: 'retrieve', nextReview: null }), // wrong namespace
      item({ itemKey: 'vocab:s:e', dimension: 'retrieve', nextReview: new Date(NOW.getTime() + DAY_MS).toISOString() }), // not due
    ];
    expect(countVocabularyDue(items, NOW)).toBe(2);
  });

  it('is 0 for an empty list', () => {
    expect(countVocabularyDue([], NOW)).toBe(0);
  });
});
