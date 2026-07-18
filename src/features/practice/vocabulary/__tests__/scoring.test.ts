// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/__tests__/scoring.test.ts
// Description: EN-18 (WP4) unit tests — the objective score→grade mapping. With a mic: both pass =
//   SUCCESS, one = PARTIAL, neither = FAILURE, per-dimension grades (retrieve/say). Without a mic:
//   comprehension-only PASS/FAIL, no PARTIAL, say dimension ungraded (null).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { describe, it, expect } from 'vitest';
import { scoreCard, PASS_GRADE, FAIL_GRADE } from '../scoring';

describe('scoreCard (EN-18 objective outcome → SM-2 grades)', () => {
  describe('with production (mic attempted)', () => {
    it('both pass → SUCCESS, both dimensions graded good', () => {
      expect(scoreCard({ comprehensionPass: true, productionPass: true })).toEqual({
        outcome: 'success',
        retrieveGrade: PASS_GRADE,
        sayGrade: PASS_GRADE,
      });
    });

    it('comprehension only → PARTIAL (retrieve good, say again)', () => {
      expect(scoreCard({ comprehensionPass: true, productionPass: false })).toEqual({
        outcome: 'partial',
        retrieveGrade: PASS_GRADE,
        sayGrade: FAIL_GRADE,
      });
    });

    it('production only → PARTIAL (retrieve again, say good)', () => {
      expect(scoreCard({ comprehensionPass: false, productionPass: true })).toEqual({
        outcome: 'partial',
        retrieveGrade: FAIL_GRADE,
        sayGrade: PASS_GRADE,
      });
    });

    it('neither → FAILURE (both again)', () => {
      expect(scoreCard({ comprehensionPass: false, productionPass: false })).toEqual({
        outcome: 'failure',
        retrieveGrade: FAIL_GRADE,
        sayGrade: FAIL_GRADE,
      });
    });
  });

  describe('without production (no mic / declined)', () => {
    it('comprehension pass → SUCCESS, say ungraded (null), no PARTIAL', () => {
      expect(scoreCard({ comprehensionPass: true, productionPass: null })).toEqual({
        outcome: 'success',
        retrieveGrade: PASS_GRADE,
        sayGrade: null,
      });
    });

    it('comprehension fail → FAILURE, say ungraded (null)', () => {
      expect(scoreCard({ comprehensionPass: false, productionPass: null })).toEqual({
        outcome: 'failure',
        retrieveGrade: FAIL_GRADE,
        sayGrade: null,
      });
    });
  });
});
