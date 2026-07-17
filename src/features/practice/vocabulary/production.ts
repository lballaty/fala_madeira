// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/production.ts
// Description: EN-18 (WP3) — objective PRODUCTION grader for the vocabulary reinforcement quiz.
//   After the typed-comprehension step, the learner is asked to SAY the Portuguese word; this
//   grades it objectively via pt-PT speech recognition (platform.speech). The pure matcher
//   (matchesSpokenWord) reuses the EN-10 fuzzy machinery so recognition wobble, accents, and a
//   surrounding phrase ("...mercado...") still resolve; checkProduction is the thin async wrapper
//   that runs one-shot recognition and maps typed PlatformError codes to a PASS / FAIL / SKIPPED
//   result the UI renders. Mic-unavailable / permission-denied → SKIPPED (comprehension-only
//   grading, no PARTIAL); no-speech / timeout → a retryable FAIL. Never throws.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { config } from '../../../config';
import { errorMessage } from '../../../lib/logger';
import { platform, PlatformError } from '../../../platform';
import { normalizeForSearch } from '../../phrases/search';
import { boundedLevenshtein, fuzzyThresholdForLength } from '../../phrases/vocabSearch';

/**
 * Grade a spoken transcript against the card's Portuguese word. PASS when, after normalization
 * (case/accent/whitespace-folded via EN-10's normalizeForSearch):
 *  - the whole transcript equals the word, OR
 *  - a single-word target appears as one of the spoken tokens (the recognizer often returns a
 *    surrounding phrase), OR a multi-word target appears as a contiguous substring, OR
 *  - the transcript (or any token) is within the bounded-Levenshtein budget for the word's length
 *    (≤3 chars → 0 typos, 4–6 → 1, 7+ → 2) — so recognition wobble on longer words still counts.
 * Empty transcript or empty word is always FAIL.
 */
export const matchesSpokenWord = (transcript: string, word: string): boolean => {
  const target = normalizeForSearch(word ?? '');
  const spoken = normalizeForSearch(transcript ?? '');
  if (!target || !spoken) return false;
  if (spoken === target) return true;

  const tokens = spoken.split(' ').filter((t) => t.length > 0);
  if (target.includes(' ')) {
    if (spoken.includes(target)) return true;
  } else if (tokens.includes(target)) {
    return true;
  }

  const budget = fuzzyThresholdForLength(target.length);
  if (budget <= 0) return false;
  if (boundedLevenshtein(spoken, target, budget) <= budget) return true;
  return tokens.some((tok) => boundedLevenshtein(tok, target, budget) <= budget);
};

/** Why a production attempt did not yield a PASS — drives the UI's retry vs skip affordance. */
export type ProductionFailReason = 'mismatch' | 'no-speech' | 'timeout' | 'error';
export type ProductionSkipReason = 'unavailable' | 'permission-denied';

export type ProductionResult =
  | { outcome: 'pass'; transcript: string }
  | { outcome: 'fail'; reason: ProductionFailReason; transcript: string | null; message: string }
  | { outcome: 'skipped'; reason: ProductionSkipReason; message: string };

/** True when spoken production can be graded on this device (mic + recognition present). */
export const isProductionAvailable = (): boolean => platform.speech.isAvailable();

const RETRYABLE_MESSAGE = "Didn't catch that — get a little closer to the mic and try again.";

/**
 * Run one spoken-production attempt for a Portuguese word and grade it objectively.
 * - No recognition on this device → SKIPPED('unavailable') (the caller grades comprehension-only).
 * - permission-denied → SKIPPED('permission-denied') (mic was refused; never a penalty).
 * - no-speech / timeout → retryable FAIL (the caller offers "try again" then lets them move on).
 * - any other error → FAIL('error') with a friendly message.
 * Never throws — always resolves to a ProductionResult.
 */
export const checkProduction = async (word: string): Promise<ProductionResult> => {
  if (!platform.speech.isAvailable()) {
    return {
      outcome: 'skipped',
      reason: 'unavailable',
      message: 'Speech recognition is not available on this device — grading comprehension only.',
    };
  }
  try {
    const transcript = await platform.speech.recognize({
      language: config.vocabulary.recognitionLanguage,
      timeoutMs: config.vocabulary.recognizeTimeoutMs,
    });
    return matchesSpokenWord(transcript, word)
      ? { outcome: 'pass', transcript }
      : {
          outcome: 'fail',
          reason: 'mismatch',
          transcript,
          message: 'Not quite — listen again, then say it once more.',
        };
  } catch (err) {
    if (err instanceof PlatformError) {
      switch (err.code) {
        case 'unavailable':
        case 'not-implemented':
          return {
            outcome: 'skipped',
            reason: 'unavailable',
            message: 'Speech recognition is not available on this device — grading comprehension only.',
          };
        case 'permission-denied':
          return {
            outcome: 'skipped',
            reason: 'permission-denied',
            message: 'Microphone access was denied — grading comprehension only. Allow it to practise speaking.',
          };
        case 'no-speech':
          return { outcome: 'fail', reason: 'no-speech', transcript: null, message: RETRYABLE_MESSAGE };
        case 'timeout':
          return { outcome: 'fail', reason: 'timeout', transcript: null, message: RETRYABLE_MESSAGE };
        default:
          return {
            outcome: 'fail',
            reason: 'error',
            transcript: null,
            message: errorMessage(err) || 'Listening failed — try again.',
          };
      }
    }
    return {
      outcome: 'fail',
      reason: 'error',
      transcript: null,
      message: errorMessage(err) || 'Listening failed — try again.',
    };
  }
};
