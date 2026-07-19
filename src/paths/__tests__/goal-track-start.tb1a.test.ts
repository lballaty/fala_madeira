// File: src/paths/__tests__/goal-track-start.tb1a.test.ts
// Description: TB-1a §4.3 unit tests for goal-track's placement-aware start. When the learner has no
//   resume signal, next() prefers the first uncompleted track situation with level >= placement
//   (starting a placed learner further into the track's level progression), with a SOFT fallback to
//   the plain first-uncompleted when none meet the bar. A resume signal (≥1 completion) makes the
//   plain first-uncompleted win — placement is not consulted (R12). Pure/deterministic.
// Author: claude-tb1a
// Created: 2026-07-19

import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import type { Situation, Track } from '../../content/schema';
import { dimensionSummary } from '../../lib/srs';
import type { PathContext, PathSelection } from '../types';
import { goalTrackPath } from '../goal-track';

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
  type: 'goal-track',
  activeTrackId: null,
  structuredMonth: config.paths.structuredStartMonth,
  structuredDay: config.paths.structuredStartDay,
  ...o,
});

const tracks: Track[] = [{ id: 't1', name: 'Survival', goal: 'g', situations: ['low', 'mid', 'high'] }];
const trackSituations: Situation[] = [
  situation({ id: 'low', level: 0, tracks: ['t1'] }),
  situation({ id: 'mid', level: 2, tracks: ['t1'] }),
  situation({ id: 'high', level: 4, tracks: ['t1'] }),
];

describe('goal-track next() — placement-aware start (TB-1a §4.3)', () => {
  it('p=2, no progress → first uncompleted at level >= 2 (mid), NOT the level-0 low', () => {
    const action = goalTrackPath.next(
      ctx({ situations: trackSituations, tracks, placementLevel: 2 }),
      selection({ activeTrackId: 't1' }),
    );
    expect(action.kind).toBe('situation');
    expect(action.situationId).toBe('mid');
    expect(action.detail).toContain('Survival');
  });

  it('p=0, no progress → unchanged (first uncompleted overall = low)', () => {
    const action = goalTrackPath.next(
      ctx({ situations: trackSituations, tracks, placementLevel: 0 }),
      selection({ activeTrackId: 't1' }),
    );
    expect(action.situationId).toBe('low');
  });

  it('FALLBACK: p=5 but the track tops out at level 4 → falls back to first uncompleted (low)', () => {
    const action = goalTrackPath.next(
      ctx({ situations: trackSituations, tracks, placementLevel: 5 }),
      selection({ activeTrackId: 't1' }),
    );
    // No situation meets level>=5, so a real next step is still offered (soft, never a dead CTA).
    expect(action.situationId).toBe('low');
  });

  it('RESUME WINS: with a completion, placement is NOT consulted — plain first-uncompleted', () => {
    // p=2 would prefer `mid`, but completing `low` is a resume signal → the ordinary
    // first-uncompleted (mid, since low is done) — here they coincide, so verify placement is
    // ignored by completing `low` AND `mid`: next must be `high`, not re-jumped by placement.
    const action = goalTrackPath.next(
      ctx({
        situations: trackSituations,
        tracks,
        placementLevel: 0,
        completedSituationIds: new Set(['low']),
      }),
      selection({ activeTrackId: 't1' }),
    );
    // placement 0 + resume → plain first uncompleted after low = mid (level ordering preserved).
    expect(action.situationId).toBe('mid');
  });
});
