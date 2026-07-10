// File: /Users/liborballaty/.../src/features/phrases/__tests__/search.test.ts
// Description: Unit tests for the pure Phrase Library search helpers (phrases/search.ts):
//   normalizeForSearch (accent/case folding + whitespace collapse) and matchesQuery
//   (multi-token AND substring; blank query matches everything). Dependency-free module,
//   no mocks needed.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeForSearch } from '../search';

describe('normalizeForSearch', () => {
  it('lowercases, strips diacritics, and collapses whitespace', () => {
    expect(normalizeForSearch('  Café   Amanhã ')).toBe('cafe amanha');
  });
});

describe('matchesQuery', () => {
  const haystack = normalizeForSearch('Bom dia, quero um café');

  it('matches accent-insensitively', () => {
    expect(matchesQuery(haystack, 'cafe')).toBe(true);
    expect(matchesQuery(haystack, 'café')).toBe(true);
  });

  it('requires every query token to be present (AND semantics)', () => {
    expect(matchesQuery(haystack, 'quero cafe')).toBe(true);
    expect(matchesQuery(haystack, 'quero chá')).toBe(false);
  });

  it('an empty or blank query matches everything', () => {
    expect(matchesQuery(haystack, '')).toBe(true);
    expect(matchesQuery(haystack, '   ')).toBe(true);
  });

  it('does substring matching within words', () => {
    expect(matchesQuery(haystack, 'di')).toBe(true); // in "dia"
  });
});
