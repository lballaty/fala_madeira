// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/scoring.ts
// Description: EN-18 (WP4) — objective score → SM-2 grade mapping for the vocabulary reinforcement
//   quiz. The APP decides the outcome (not the learner) from two objective signals: comprehension
//   (typed meaning) and production (spoken). Comprehension grades the 'retrieve' dimension;
//   production grades the 'say' dimension — each per-dimension so SM-2 schedules each skill on its
//   own (a word you can recognise but not pronounce comes back sooner on the 'say' track). The
//   overall outcome (SUCCESS/PARTIAL/FAILURE) drives the user-facing feedback only. Pure; unit-tested.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { Sm2Grade } from '../../../lib/srs';

export type QuizOutcome = 'success' | 'partial' | 'failure';

/**
 * Per-dimension SM-2 grades from an objective single attempt. A pass is graded "good" (4) rather
 * than "easy" (5) — a correct single attempt is solid, not trivial; a fail is "again" (0), which
 * resets the interval so the word returns soon. Tunable against config.srs (passingGrade=3).
 */
export const PASS_GRADE: Sm2Grade = 4; // "good"
export const FAIL_GRADE: Sm2Grade = 0; // "again"

export interface CardScore {
  /** Feedback-level outcome (for the "✓ meaning · ✗ pronunciation" message). */
  outcome: QuizOutcome;
  /** SM-2 grade for the 'retrieve' dimension (from the typed comprehension answer). */
  retrieveGrade: Sm2Grade;
  /** SM-2 grade for the 'say' dimension (from the spoken answer); null when production wasn't attempted. */
  sayGrade: Sm2Grade | null;
}

export interface ScoreInput {
  comprehensionPass: boolean;
  /** null = production not attempted (no mic / declined / offline) — comprehension-only grading. */
  productionPass: boolean | null;
}

/**
 * Derive the objective outcome + per-dimension grades.
 * - With production (mic): both PASS → SUCCESS · exactly one → PARTIAL · neither → FAILURE.
 * - Without production (productionPass === null): comprehension only → SUCCESS/FAILURE (no PARTIAL),
 *   and the 'say' dimension is not graded (sayGrade === null) so a missing mic never penalises it.
 */
export const scoreCard = ({ comprehensionPass, productionPass }: ScoreInput): CardScore => {
  const retrieveGrade = comprehensionPass ? PASS_GRADE : FAIL_GRADE;

  if (productionPass === null) {
    return {
      outcome: comprehensionPass ? 'success' : 'failure',
      retrieveGrade,
      sayGrade: null,
    };
  }

  const passes = (comprehensionPass ? 1 : 0) + (productionPass ? 1 : 0);
  const outcome: QuizOutcome = passes === 2 ? 'success' : passes === 1 ? 'partial' : 'failure';
  return {
    outcome,
    retrieveGrade,
    sayGrade: productionPass ? PASS_GRADE : FAIL_GRADE,
  };
};
