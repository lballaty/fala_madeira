// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/paths/__tests__/paths.test.ts
// Description: Unit tests for the four sequencing policies (src/paths/{structured-course,
//   goal-track,adaptive-guided,free}.ts). Exercises order() / next() / sessionPlan() against a
//   small fake content+context (pure, deterministic on context.now). Asserts: structured-course
//   calendar ordering + "Continue Day N" cursor advance; goal-track level ordering + active-track
//   scoping; adaptive-guided daily-session composer segment shape + count matching
//   config.dailySession.template, and weakness/goal-biased situation recommendation; free
//   pass-through + browse CTA. No mocks — the policies import only config + schema/srs types.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import type { Situation, Track } from '../../content/schema';
import { dimensionSummary, initialMasteryState, type MasteryItem } from '../../lib/srs';
import type { PathContext, PathSelection } from '../types';
import { structuredCoursePath } from '../structured-course';
import { goalTrackPath } from '../goal-track';
import { adaptiveGuidedPath } from '../adaptive-guided';
import { freePath } from '../free';

const NOW = new Date('2026-07-10T12:00:00.000Z');

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

const masteryItem = (o: Partial<MasteryItem> & Pick<MasteryItem, 'itemKey'>): MasteryItem => ({
  dimension: 'retrieve',
  ...initialMasteryState(),
  ...o,
});

const ctx = (o: Partial<PathContext> = {}): PathContext => ({
  situations: [],
  tracks: [],
  completedSituationIds: new Set<string>(),
  placementLevel: 1,
  mastery: [],
  dimensionSummary: dimensionSummary([], NOW),
  now: NOW,
  ...o,
});

const selection = (o: Partial<PathSelection> = {}): PathSelection => ({
  type: 'adaptive-guided',
  activeTrackId: null,
  structuredMonth: config.paths.structuredStartMonth,
  structuredDay: config.paths.structuredStartDay,
  ...o,
});

// A small course: 3 slotted day situations (out of authored order) + 1 slot-less situation.
const courseSituations: Situation[] = [
  situation({ id: 'd2', course: { month: 1, day: 2 } }),
  situation({ id: 'd1', course: { month: 1, day: 1 } }),
  situation({ id: 'm2d1', course: { month: 2, day: 1 } }),
  situation({ id: 'loose' }), // no course slot
];

describe('structuredCoursePath', () => {
  it('order() sorts slotted situations by month/day, slot-less last', () => {
    const ordered = structuredCoursePath.order(ctx({ situations: courseSituations }), selection());
    expect(ordered.map((s) => s.id)).toEqual(['d1', 'd2', 'm2d1', 'loose']);
  });

  it('next() points at the first uncompleted day with a "Continue Day N" label', () => {
    const action = structuredCoursePath.next(
      ctx({ situations: courseSituations, completedSituationIds: new Set(['d1']) }),
      selection(),
    );
    expect(action.kind).toBe('situation');
    expect(action.situationId).toBe('d2');
    expect(action.label).toBe('Continue Day 2');
    expect(action.engineId).toBe('listening');
  });

  it('next() degrades to a free browse prompt when no course content is loaded', () => {
    const action = structuredCoursePath.next(ctx({ situations: [situation({ id: 'x' })] }), selection());
    expect(action.kind).toBe('free');
    expect(action.situationId).toBeNull();
  });

  it('sessionPlan() returns null (composition is Adaptive Guided\'s job)', () => {
    expect(structuredCoursePath.sessionPlan(ctx(), selection())).toBeNull();
  });
});

describe('goalTrackPath', () => {
  const tracks: Track[] = [
    { id: 't1', name: 'Survival', goal: 'g', situations: ['a', 'b'] },
  ];
  const trackSituations: Situation[] = [
    situation({ id: 'b', level: 1, tracks: ['t1'] }),
    situation({ id: 'a', level: 2, tracks: ['t1'] }),
    situation({ id: 'off', level: 1, tracks: ['t2'] }),
  ];

  it('order() sorts the active track by level first, then curation order, off-track last', () => {
    const ordered = goalTrackPath.order(
      ctx({ situations: trackSituations, tracks }),
      selection({ activeTrackId: 't1' }),
    );
    // level 1 (b) before level 2 (a); off-track 'off' trails.
    expect(ordered.map((s) => s.id)).toEqual(['b', 'a', 'off']);
  });

  it('next() recommends the first uncompleted track situation and reflects the picked track (TB-11b)', () => {
    const action = goalTrackPath.next(
      ctx({ situations: trackSituations, tracks, completedSituationIds: new Set(['b']) }),
      selection({ activeTrackId: 't1' }),
    );
    expect(action.kind).toBe('situation');
    expect(action.situationId).toBe('a');
    expect(action.engineId).toBe('listening');
    // The CTA detail must carry the chosen track's name so Home reflects WHAT was picked.
    expect(action.detail).toContain('Survival');
  });

  it('next() prompts to CHOOSE A GOAL (not tracks[0] masquerade) when goal-track is active but no goal is chosen — TB-11b', () => {
    // Tracks ARE loaded; the learner just has not picked one. Must NOT silently fall back to
    // tracks[0] (which is literally seeded "Structured Course") and label it "Continue your track".
    const action = goalTrackPath.next(
      ctx({ situations: trackSituations, tracks }),
      selection({ type: 'goal-track', activeTrackId: null }),
    );
    expect(action.kind).toBe('choose-goal');
    expect(action.situationId).toBeNull();
    expect(action.label).toBe('Choose your goal');
  });

  it('order() passes through all situations (no tracks[0] fallback) when no goal is chosen — TB-11b', () => {
    const ordered = goalTrackPath.order(
      ctx({ situations: trackSituations, tracks }),
      selection({ type: 'goal-track', activeTrackId: null }),
    );
    // Every loaded situation is still reachable; we do NOT scope to an arbitrary first track.
    expect(new Set(ordered.map((s) => s.id))).toEqual(new Set(['b', 'a', 'off']));
  });

  it('next() prompts to choose a goal when no tracks are loaded either', () => {
    const action = goalTrackPath.next(ctx({ situations: [], tracks: [] }), selection({ type: 'goal-track' }));
    expect(action.kind).toBe('choose-goal');
  });

  it('sessionPlan() returns null', () => {
    expect(goalTrackPath.sessionPlan(ctx(), selection())).toBeNull();
  });
});

describe('adaptiveGuidedPath', () => {
  const situations: Situation[] = [
    situation({ id: 's-near', level: 1 }),
    situation({ id: 's-far', level: 5 }),
  ];

  it('next() advertises a session CTA with the total template minutes', () => {
    const total = config.dailySession.template.reduce((sum, seg) => sum + seg.minutes, 0);
    const action = adaptiveGuidedPath.next(ctx({ situations }), selection());
    expect(action.kind).toBe('session');
    expect(action.detail).toBe(`~${total} min`);
    expect(action.engineId).toBeNull();
  });

  it('sessionPlan() composes one segment per config template entry, in order', () => {
    const plan = adaptiveGuidedPath.sessionPlan(ctx({ situations }), selection());
    expect(plan).not.toBeNull();
    expect(plan!).toHaveLength(config.dailySession.template.length);
    expect(plan!.map((s) => s.engineId)).toEqual(config.dailySession.template.map((s) => s.engineId));
    expect(plan!.map((s) => s.minutes)).toEqual(config.dailySession.template.map((s) => s.minutes));
    expect(plan!.map((s) => s.label)).toEqual(config.dailySession.template.map((s) => s.label));
  });

  it('sessionPlan() pins every segment to the recommended situation', () => {
    // 's-near' is at the placement level (1) so it outscores 's-far'.
    const plan = adaptiveGuidedPath.sessionPlan(ctx({ situations, placementLevel: 1 }), selection());
    expect(new Set(plan!.map((s) => s.situationId))).toEqual(new Set(['s-near']));
  });

  it('order() biases toward accumulated weakness on a situation', () => {
    const weakMastery: MasteryItem[] = [
      masteryItem({ itemKey: 'vocab:s-far:w', dimension: 'retrieve', ease: config.srs.minEase, repetitions: 0, nextReview: null }),
    ];
    // Give s-far enough weakness to overcome the placement-proximity advantage of s-near.
    const heavy = Array.from({ length: 4 }, (_, i) =>
      masteryItem({ itemKey: `vocab:s-far:w${i}`, dimension: 'retrieve', ease: config.srs.minEase, nextReview: null }),
    );
    const ordered = adaptiveGuidedPath.order(
      ctx({ situations, mastery: [...weakMastery, ...heavy], placementLevel: 1 }),
      selection(),
    );
    expect(ordered[0].id).toBe('s-far');
  });

  it('goal relevance and coach top-focus steer the recommended situation', () => {
    // A situation on the active track should be recommended (Coach top focus points at it).
    const trackSituations: Situation[] = [
      situation({ id: 'goal', level: 5, tracks: ['t1'] }),
      situation({ id: 'plain', level: 1 }),
    ];
    const mastery: MasteryItem[] = [
      masteryItem({ itemKey: 'vocab:goal:w', dimension: 'retrieve', ease: config.srs.minEase, nextReview: null }),
    ];
    const plan = adaptiveGuidedPath.sessionPlan(
      ctx({ situations: trackSituations, mastery, dimensionSummary: dimensionSummary(mastery, NOW), placementLevel: 1 }),
      selection({ activeTrackId: 't1' }),
    );
    expect(plan!.every((s) => s.situationId === 'goal')).toBe(true);
  });
});

describe('freePath', () => {
  it('order() is a pass-through (repository order preserved)', () => {
    const situations = [situation({ id: 'z' }), situation({ id: 'a' })];
    expect(freePath.order(ctx({ situations }), selection()).map((s) => s.id)).toEqual(['z', 'a']);
  });

  it('next() routes to the free browse surface, prescribing nothing', () => {
    const action = freePath.next(ctx(), selection());
    expect(action.kind).toBe('free');
    expect(action.situationId).toBeNull();
    expect(action.engineId).toBeNull();
  });

  it('sessionPlan() returns null', () => {
    expect(freePath.sessionPlan(ctx(), selection())).toBeNull();
  });
});
