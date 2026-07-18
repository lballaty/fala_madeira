// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/__tests__/comprehension.test.ts
// Description: EN-18 (WP2) unit tests — the typed-meaning comprehension grader must be accent-,
//   case-, and typo-tolerant, accept translation alternates, and reject empties/wrong answers.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { describe, it, expect } from 'vitest';
import { checkComprehension, splitTranslationAlternates } from '../comprehension';

describe('checkComprehension (EN-18 typed meaning)', () => {
  it('passes an exact match (case-insensitive)', () => {
    expect(checkComprehension('Good morning', 'Good morning')).toBe(true);
    expect(checkComprehension('good morning', 'Good morning')).toBe(true);
  });

  it('is accent/diacritic tolerant', () => {
    expect(checkComprehension('cafe', 'café')).toBe(true);
  });

  it('tolerates a small typo within the length budget', () => {
    // "morning" (7) → budget 2; "mornin" is 1 edit away → PASS.
    expect(checkComprehension('mornin', 'morning')).toBe(true);
  });

  it('accepts any slash/comma/or alternate', () => {
    expect(checkComprehension('then', 'So / Then')).toBe(true);
    expect(checkComprehension('so', 'So / Then')).toBe(true);
    expect(checkComprehension('pardon', 'What? / Pardon?')).toBe(true);
    expect(checkComprehension('an', 'a, an')).toBe(true);
  });

  it('fails empty / whitespace input', () => {
    expect(checkComprehension('', 'Good morning')).toBe(false);
    expect(checkComprehension('   ', 'Good morning')).toBe(false);
  });

  it('fails a clearly wrong answer', () => {
    expect(checkComprehension('goodbye', 'Good morning')).toBe(false);
  });

  it('does not fuzzy-pass a too-short near-miss (budget 0 for ≤3 chars)', () => {
    // "cat" vs "car": 1 edit, but length 3 → budget 0 → FAIL (avoids trivial short-word collisions).
    expect(checkComprehension('cat', 'car')).toBe(false);
  });

  it('splitTranslationAlternates normalizes + splits', () => {
    expect(splitTranslationAlternates('So / Then')).toEqual(['so', 'then']);
    expect(splitTranslationAlternates('Thank you')).toEqual(['thank you']);
  });
});
