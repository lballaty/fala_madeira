// File: /Users/liborballaty/.../src/features/phrases/__tests__/vocabSearch.test.ts
// Description: Unit tests for the pure inventory vocab matcher (phrases/vocabSearch.ts, tracker
//   EN-10): bidirectional lookup (PT→EN and EN→PT), diacritic-insensitive matching
//   ("cafe" finds "café"), bounded fuzzy fallback (a close typo resolves; a far one does not),
//   and a miss returning [] so the caller falls back to the AI path. Builds the index from
//   synthetic Situations — no network, no mocks, deterministic.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { describe, expect, it } from 'vitest';
import type { Situation } from '../../../content';
import {
  boundedLevenshtein,
  buildVocabIndex,
  fuzzyThresholdForLength,
  matchToResult,
  searchVocabInventory,
} from '../vocabSearch';

// Minimal Situation fixtures — only fields the index reads are populated.
const situation = (id: string, title: string, vocab: Array<{ word: string; translation: string; pronunciation?: string; note?: string }>): Situation =>
  ({
    id,
    title,
    summary: '',
    tracks: [],
    level: 0,
    cefr: 'A1',
    phrase_patterns: [],
    vocabulary: vocab,
  } as unknown as Situation);

const index = buildVocabIndex([
  situation('s1', 'Ordering coffee', [
    { word: 'café', translation: 'coffee', pronunciation: 'kuh-FEH', note: 'A staple order.' },
    { word: 'chá', translation: 'tea' },
  ]),
  situation('s2', 'Greetings', [
    { word: 'obrigado', translation: 'thank you' },
  ]),
]);

describe('buildVocabIndex', () => {
  it('flattens vocabulary with pre-normalized bidirectional keys', () => {
    expect(index).toHaveLength(3);
    const cafe = index.find((e) => e.pt === 'café');
    expect(cafe?.ptKey).toBe('cafe');
    expect(cafe?.enKey).toBe('coffee');
  });

  it('skips rows with no searchable text', () => {
    const empty = buildVocabIndex([situation('s3', 'Empty', [{ word: '', translation: '' }])]);
    expect(empty).toHaveLength(0);
  });
});

describe('searchVocabInventory — diacritics + bidirectional', () => {
  it('finds "café" from the diacritic-free query "cafe" (PT→EN)', () => {
    const [top] = searchVocabInventory(index, 'cafe');
    expect(top.entry.pt).toBe('café');
    expect(top.direction).toBe('pt->en');
    expect(top.exact).toBe(true);
    expect(matchToResult(top).translation).toBe('coffee');
  });

  it('matches an accented query against the same key ("café" → café)', () => {
    const [top] = searchVocabInventory(index, 'café');
    expect(top.entry.en).toBe('coffee');
    expect(top.exact).toBe(true);
  });

  it('resolves the English side back to Portuguese (EN→PT)', () => {
    const [top] = searchVocabInventory(index, 'thank you');
    expect(top.direction).toBe('en->pt');
    expect(matchToResult(top).translation).toBe('obrigado');
  });
});

describe('searchVocabInventory — fuzzy fallback', () => {
  it('resolves a close-but-not-exact typo ("coffe" → coffee)', () => {
    const matches = searchVocabInventory(index, 'coffe');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].entry.en).toBe('coffee');
    expect(matches[0].exact).toBe(false);
    expect(matches[0].distance).toBe(1);
  });

  it('resolves an accented-word typo ("obrigadu" → obrigado)', () => {
    const [top] = searchVocabInventory(index, 'obrigadu');
    expect(top.entry.pt).toBe('obrigado');
    expect(top.exact).toBe(false);
  });

  it('prefers an exact hit over a fuzzy one when both exist', () => {
    const withNear = buildVocabIndex([
      situation('s4', 'Near pair', [
        { word: 'coffee', translation: 'exact-en' }, // exact PT-key match for query "coffee"
        { word: 'coffed', translation: 'fuzzy-en' }, // distance 1 from "coffee"
      ]),
    ]);
    const [top] = searchVocabInventory(withNear, 'coffee');
    expect(top.exact).toBe(true);
    expect(top.entry.pt).toBe('coffee');
  });
});

describe('searchVocabInventory — misses (caller falls back to AI)', () => {
  it('returns [] for a word not in the inventory', () => {
    expect(searchVocabInventory(index, 'helicopter')).toEqual([]);
  });

  it('returns [] for a far-off near-miss beyond the fuzzy budget', () => {
    // "cat" vs "chá"/"tea"/… — length<=3 keys tolerate 0 edits, so no fuzzy hit.
    expect(searchVocabInventory(index, 'cat')).toEqual([]);
  });

  it('returns [] for an empty or whitespace-only query', () => {
    expect(searchVocabInventory(index, '')).toEqual([]);
    expect(searchVocabInventory(index, '   ')).toEqual([]);
  });
});

describe('boundedLevenshtein + fuzzyThresholdForLength', () => {
  it('computes small edit distances and short-circuits past the budget', () => {
    expect(boundedLevenshtein('coffee', 'coffee', 2)).toBe(0);
    expect(boundedLevenshtein('coffe', 'coffee', 2)).toBe(1);
    expect(boundedLevenshtein('abc', 'xyz', 1)).toBe(2); // exceeds max → max+1
  });

  it('scales the fuzzy budget with key length', () => {
    expect(fuzzyThresholdForLength(3)).toBe(0);
    expect(fuzzyThresholdForLength(5)).toBe(1);
    expect(fuzzyThresholdForLength(9)).toBe(2);
  });
});
