// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/__tests__/buildSessionCards.test.ts
// Description: EN-16 regression. The vocabulary session must scale to the chosen scope — the deck
//   plays every due + new card for the in-scope situations, not a fixed 20/session cap. Proves
//   buildSessionCards' default limit = the total vocabulary words in scope (so a >20-word scope
//   yields >20 cards), that an explicit limit still trims, and that new cards fill after due.
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { describe, it, expect } from 'vitest';
import { buildSessionCards } from '../useVocabularySession';
import type { Situation } from '../../../../content/schema';
import type { MasteryItem } from '../../../../lib/srs';

const NOW = new Date('2026-07-15T12:00:00.000Z');

const situation = (id: string, words: string[]): Situation => ({
  id,
  title: `Situation ${id}`,
  summary: '',
  tracks: [],
  level: 1,
  cefr: 'A2',
  phrase_patterns: [],
  vocabulary: words.map((word) => ({ word, translation: `${word}-en` })),
});

describe('buildSessionCards — scale to scope (EN-16)', () => {
  it('includes ALL new words in scope by default (no fixed 20 cap)', () => {
    // 25 words across two situations — more than the old defaultDueLimit of 20.
    const words = Array.from({ length: 25 }, (_, i) => `w${i}`);
    const situations = [situation('s1', words.slice(0, 13)), situation('s2', words.slice(13))];

    const cards = buildSessionCards([], situations, NOW);

    expect(cards).toHaveLength(25); // every word plays — not capped at 20
    expect(cards.every((c) => c.isNew)).toBe(true);
  });

  it('respects an explicit limit when one is passed', () => {
    const situations = [situation('s1', ['a', 'b', 'c', 'd', 'e'])];
    const cards = buildSessionCards([], situations, NOW, 3);
    expect(cards).toHaveLength(3);
  });

  it('scopes to only the situations passed in (a smaller scope yields fewer cards)', () => {
    const oneLesson = [situation('s1', ['a', 'b', 'c'])];
    expect(buildSessionCards([], oneLesson, NOW)).toHaveLength(3);
  });

  it('is empty when the scope has no vocabulary', () => {
    expect(buildSessionCards([], [situation('s1', [])], NOW)).toHaveLength(0);
    expect(buildSessionCards([] as MasteryItem[], [], NOW)).toHaveLength(0);
  });
});
