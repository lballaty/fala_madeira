// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/comprehension.ts
// Description: EN-18 (WP2) — objective comprehension grader for the vocabulary reinforcement quiz.
//   The learner is shown the Portuguese word and TYPES the English meaning; this decides PASS/FAIL
//   objectively (the app, not the learner). Reuses the EN-10 fuzzy machinery (normalizeForSearch +
//   boundedLevenshtein) so answers are accent-, case-, and typo-tolerant, and accepts any of the
//   slash/comma-separated alternates a translation may list (e.g. "So / Then", "What? / Pardon?").
//   Pure + dependency-light for unit testing; no UI, no network.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { normalizeForSearch } from '../../phrases/search';
import { boundedLevenshtein, fuzzyThresholdForLength } from '../../phrases/vocabSearch';

/** Split a translation into its acceptable alternates (e.g. "So / Then", "a, an"). */
export const splitTranslationAlternates = (translation: string): string[] =>
  translation
    .split(/[/,;|]|\bor\b/i)
    .map((part) => normalizeForSearch(part))
    .filter((part) => part.length > 0);

/**
 * Grade a typed English answer against the card's known translation. PASS when the normalized input
 * matches any alternate exactly, or within the bounded-Levenshtein budget for that alternate's
 * length (fuzzyThresholdForLength: ≤3 chars → 0 typos, 4–6 → 1, 7+ → 2). Empty/whitespace input is
 * always FAIL. Comparison is one-directional here (typed meaning vs the known EN translation) — the
 * PT word is shown, the learner supplies the meaning.
 */
export const checkComprehension = (typed: string, translation: string): boolean => {
  const q = normalizeForSearch(typed ?? '');
  if (!q) return false;
  const candidates = splitTranslationAlternates(translation ?? '');
  return candidates.some((cand) => {
    if (cand === q) return true;
    const budget = fuzzyThresholdForLength(cand.length);
    return budget > 0 && boundedLevenshtein(q, cand, budget) <= budget;
  });
};
