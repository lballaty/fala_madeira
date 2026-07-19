// File: src/paths/__tests__/structured-start.tb1a.test.ts
// Description: TB-1a §4.1/§7.3 unit tests for the placement-driven structured start point.
//   Exercises the pure initialStructuredMonth(p) map and structured-course.next()'s seed-when-not-
//   resumed logic: a placed learner with no progress starts at the placement-derived month (day 1),
//   while any resume signal (advanced cursor OR ≥1 completion) makes the persisted cursor win
//   regardless of placement (R12/D3). Pure/deterministic — no react, no network.
// Author: claude-tb1a
// Created: 2026-07-19

import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import type { Situation } from '../../content/schema';
import { dimensionSummary } from '../../lib/srs';
import type { PathContext, PathSelection } from '../types';
import { structuredCoursePath, initialStructuredMonth } from '../structured-course';

const NOW = new Date('2026-07-19T12:00:00.000Z');

const situation = (o: Partial<Situation> & Pick<Situation, 'id'>): Situation => ({
  title: `Title ${o.id}`,
  summary: `Summary ${o.id}`,
  tracks: [],
  level: 1,
  cefr: 'A2',
  phrase_patterns: [],
  vocabulary: [],
  ...o,
});

const ctx = (o: Partial<PathContext> = {}): PathContext => ({
  situations: [],
  tracks: [],
  completedSituationIds: new Set<string>(),
  placementLevel: 0,
  mastery: [],
  dimensionSummary: dimensionSummary([], NOW),
  now: NOW,
  ...o,
});

const selection = (o: Partial<PathSelection> = {}): PathSelection => ({
  type: 'structured',
  activeTrackId: null,
  structuredMonth: config.paths.structuredStartMonth, // default (1)
  structuredDay: config.paths.structuredStartDay, // default (1)
  ...o,
});

// One representative situation per month 1..3 (day 1), so we can assert WHICH month next() lands in.
const courseSituations: Situation[] = [
  situation({ id: 'm1d1', level: 0, course: { month: 1, day: 1 } }),
  situation({ id: 'm2d1', level: 1, course: { month: 2, day: 1 } }),
  situation({ id: 'm3d1', level: 2, course: { month: 3, day: 1 } }),
];

describe('initialStructuredMonth(p) — §4.1 D-map', () => {
  it('maps 0→1, 1→2, 2→3, 3→4, 4→5, 5→6', () => {
    expect([0, 1, 2, 3, 4, 5].map(initialStructuredMonth)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('clamps out-of-range inputs into [1, 6]', () => {
    expect(initialStructuredMonth(-3)).toBe(1);
    expect(initialStructuredMonth(9)).toBe(6);
  });
});

describe('structured-course.next() — placement seeds the start when not resumed (§4.1/R12)', () => {
  it('p=2, no progress, untouched cursor → starts at/after Month 3 Day 1 (NOT Day 1 of Month 1)', () => {
    const action = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 2 }),
      selection(),
    );
    expect(action.kind).toBe('situation');
    expect(action.situationId).toBe('m3d1');
  });

  it('p=0, no progress → starts at Month 1 Day 1 (the honest beginner default)', () => {
    const action = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 0 }),
      selection(),
    );
    expect(action.situationId).toBe('m1d1');
  });

  it('two learners (p=0 vs p=2) land at DIFFERENT starts — the reported bug is fixed', () => {
    const p0 = structuredCoursePath.next(ctx({ situations: courseSituations, placementLevel: 0 }), selection());
    const p2 = structuredCoursePath.next(ctx({ situations: courseSituations, placementLevel: 2 }), selection());
    expect(p0.situationId).not.toBe(p2.situationId);
  });

  it('RESUME WINS: an advanced cursor (Month 2) beats placement=0 — cursor wins', () => {
    const action = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 0 }),
      selection({ structuredMonth: 2, structuredDay: 1 }),
    );
    // Placement 0 would seed Month 1, but the advanced cursor is a resume signal → Month 2.
    expect(action.situationId).toBe('m2d1');
  });

  it('RESUME WINS: ≥1 completion beats placement — a p=2 learner who finished M1D1 resumes, not re-seed', () => {
    // With a completion, the cursor is NOT re-seeded to Month 3; the at/after-default scan finds the
    // first uncompleted day (Month 2 here), i.e. the learner keeps their real progress line.
    const action = structuredCoursePath.next(
      ctx({
        situations: courseSituations,
        placementLevel: 2,
        completedSituationIds: new Set(['m1d1']),
      }),
      selection(),
    );
    expect(action.situationId).toBe('m2d1');
  });

  it('placement seed is bounded DOWN by structuredStartCeilingMonth (§5.3.2 hook) — p=2 but ceiling=1 → Month 1', () => {
    const action = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 2, structuredStartCeilingMonth: 1 }),
      selection(),
    );
    expect(action.situationId).toBe('m1d1');
  });
});
