// File: /Users/liborballaty/.../src/features/practice/speaking/__tests__/accuracy.test.ts
// Description: Unit tests for the pure pronunciation-accuracy scoring (speaking/accuracy.ts):
//   normalizeWords (case/diacritic/punctuation folding), levenshtein token distance, and
//   wordAccuracy normalization + missingWords multiset difference. No imports/I/O in the module,
//   so no mocks — input -> output only.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import { levenshtein, normalizeWords, wordAccuracy } from '../accuracy';

describe('normalizeWords', () => {
  it('lowercases, strips diacritics and punctuation, splits on whitespace', () => {
    expect(normalizeWords('Bom dia, café!')).toEqual(['bom', 'dia', 'cafe']);
  });

  it('drops empty tokens and collapses whitespace', () => {
    expect(normalizeWords('  olá   —  tudo  bem ?  ')).toEqual(['ola', 'tudo', 'bem']);
  });

  it('empty string yields an empty list', () => {
    expect(normalizeWords('')).toEqual([]);
  });
});

describe('levenshtein', () => {
  it('is 0 for identical token sequences', () => {
    expect(levenshtein(['a', 'b'], ['a', 'b'])).toBe(0);
  });

  it('counts a single substitution as 1', () => {
    expect(levenshtein(['a', 'b'], ['a', 'c'])).toBe(1);
  });

  it('handles empty inputs as the length of the other', () => {
    expect(levenshtein([], ['a', 'b', 'c'])).toBe(3);
    expect(levenshtein(['a'], [])).toBe(1);
  });
});

describe('wordAccuracy', () => {
  it('is 1.0 for an exact (accent/case-insensitive) match', () => {
    const r = wordAccuracy('Bom dia', 'bom DIA');
    expect(r.accuracy).toBe(1);
    expect(r.distance).toBe(0);
    expect(r.missingWords).toEqual([]);
  });

  it('empty target + empty recognized = 1 (nothing to say, nothing said)', () => {
    expect(wordAccuracy('', '').accuracy).toBe(1);
  });

  it('reports missing target words (multiset difference)', () => {
    const r = wordAccuracy('um café por favor', 'um favor');
    expect(r.missingWords).toEqual(['cafe', 'por']);
    expect(r.accuracy).toBeGreaterThan(0);
    expect(r.accuracy).toBeLessThan(1);
  });

  it('clamps accuracy to [0, 1]', () => {
    const r = wordAccuracy('sim', 'completely different words here that are longer');
    expect(r.accuracy).toBeGreaterThanOrEqual(0);
    expect(r.accuracy).toBeLessThanOrEqual(1);
  });

  it('accuracy = 1 - distance/max(len)', () => {
    // target 3 words, recognized matches 2 => distance 1, longest 3 => 1 - 1/3.
    const r = wordAccuracy('a b c', 'a b');
    expect(r.accuracy).toBeCloseTo(1 - 1 / 3, 10);
  });
});
