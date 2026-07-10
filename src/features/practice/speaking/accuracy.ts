// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/accuracy.ts
// Description: Pure, deterministic pronunciation-accuracy scoring for the Speaking Coach
//   (docs/CONTENT-ARCHITECTURE.md §3). Compares a speech-recognition transcript against the
//   target European-Portuguese phrase using normalized word-level Levenshtein distance.
//   Normalization is deliberately forgiving (case, diacritics, punctuation) — the engine
//   coaches, it does not police. No imports, no I/O, no Date/random: unit-testable in
//   isolation (input → output only).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

/**
 * Normalize text for forgiving comparison: lowercase, strip diacritics
 * (recognition output and learner expectations differ on accents), drop
 * punctuation, collapse whitespace. Returns the word list.
 */
export const normalizeWords = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

/** Classic Levenshtein edit distance over token sequences (insert/delete/substitute = 1). */
export const levenshtein = (a: readonly string[], b: readonly string[]): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + substitutionCost // substitution / match
      );
    }
    previous = current;
  }
  return previous[b.length];
};

export interface WordAccuracyResult {
  /** 0..1 — 1 = recognized words match the target words exactly (after normalization). */
  accuracy: number;
  /** Normalized target words the comparison ran against. */
  targetWords: string[];
  /** Normalized recognized words. */
  recognizedWords: string[];
  /** Raw word-level edit distance. */
  distance: number;
  /**
   * Target words with no occurrence in the recognized transcript (multiset
   * difference) — a forgiving "listen for these" hint, not a per-word verdict.
   */
  missingWords: string[];
}

/**
 * Normalized word-level accuracy of a recognized transcript vs the target
 * phrase: `1 - levenshtein(targetWords, recognizedWords) / max(len)` clamped
 * to [0, 1]. Empty target + empty transcript = 1 (nothing to say, nothing said).
 */
export const wordAccuracy = (target: string, recognized: string): WordAccuracyResult => {
  const targetWords = normalizeWords(target);
  const recognizedWords = normalizeWords(recognized);

  const longest = Math.max(targetWords.length, recognizedWords.length);
  const distance = levenshtein(targetWords, recognizedWords);
  const accuracy = longest === 0 ? 1 : Math.max(0, Math.min(1, 1 - distance / longest));

  const remaining = [...recognizedWords];
  const missingWords = targetWords.filter((word) => {
    const at = remaining.indexOf(word);
    if (at === -1) return true;
    remaining.splice(at, 1);
    return false;
  });

  return { accuracy, targetWords, recognizedWords, distance, missingWords };
};
