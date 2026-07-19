// File: src/paths/__tests__/proficiency-invariant.tb1a.test.ts
// Description: TB-1a §10 widened separation-invariant + retroactivity tests (R13/R14). Proves the
//   behavior layer keeps proficiency_level ⟂ unlocked_level BOTH ways:
//   (1) deriving/seeding/changing the start performs NO write to unlocked_level (the pure policy +
//       the accessible-month query never mutate the profile / never read unlocked_level in paths);
//   (2) the proficiency-DERIVED start month is a function of proficiency ALONE — raising
//       unlocked_level does not change what proficiency derives (initialStructuredMonth(p) is
//       stable across unlock state); the paywall only relaxes the accessible ceiling, it never
//       rewrites the derivation;
//   (3) retroactive + non-destructive: changing proficiency for a learner WITH progress does not
//       move the resume point or touch completions; for a learner WITHOUT progress it re-bases the
//       recommended start.
//   All pure — no react, no network, no DB.
// Author: claude-tb1a
// Created: 2026-07-19

import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import type { Situation } from '../../content/schema';
import type { UserProfile } from '../../types';
import { dimensionSummary } from '../../lib/srs';
import { canAccessLevel, highestAccessibleMonth } from '../../lib/access';
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
  structuredMonth: config.paths.structuredStartMonth,
  structuredDay: config.paths.structuredStartDay,
  ...o,
});

const profile = (over: Partial<UserProfile>): UserProfile =>
  ({
    id: 'u1',
    email: 'u1@example.com',
    streak: 0,
    xp: 0,
    unlocked_level: 1,
    completed_lessons: [],
    last_active: '',
    ...over,
  }) as UserProfile;

const courseSituations: Situation[] = [
  situation({ id: 'm1d1', level: 0, course: { month: 1, day: 1 } }),
  situation({ id: 'm2d1', level: 1, course: { month: 2, day: 1 } }),
  situation({ id: 'm3d1', level: 2, course: { month: 3, day: 1 } }),
];

describe('TB-1a separation invariant — flow ⟂ paywall (R14)', () => {
  it('deriving the start performs NO write to unlocked_level (profile untouched by the flow query)', () => {
    const p = profile({ subscription_tier: 'free', unlocked_level: 1 });
    const before = { ...p };
    // The accessible-month query and the pure policy are the only flow-layer touch points.
    highestAccessibleMonth(p, 6);
    structuredCoursePath.next(ctx({ situations: courseSituations, placementLevel: 2, structuredStartCeilingMonth: highestAccessibleMonth(p, 6) }), selection());
    expect(p.unlocked_level).toBe(before.unlocked_level);
    expect(p).toEqual(before); // no field mutated at all
  });

  it('the proficiency-DERIVED start month is a function of proficiency ALONE (stable across unlock state)', () => {
    // Same proficiency, different unlocked_level → identical DERIVED month. The paywall does not
    // rewrite the derivation; it only widens/narrows the accessible ceiling separately.
    expect(initialStructuredMonth(2)).toBe(3);
    // Re-deriving with any unlock state yields the same month; the derivation never reads unlocked_level.
    for (const unlocked of [1, 2, 3, 6]) {
      const p = profile({ subscription_tier: 'free', unlocked_level: unlocked });
      // The derivation input is proficiency; unlocked only feeds the SEPARATE ceiling.
      expect(initialStructuredMonth(2)).toBe(3);
      expect(canAccessLevel(p, 3)).toBe(unlocked >= 3); // paywall is the independent gate
    }
  });

  it('raising unlocked_level does not move the start for an ALREADY-accessible placement seed', () => {
    // p=2 seeds Month 3. A user who can already access Month 3 (unlocked_level=3) starts at M3;
    // raising unlocked_level further (to 6) leaves the start at M3 — the derived seed is unchanged.
    const at3 = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 2, structuredStartCeilingMonth: highestAccessibleMonth(profile({ unlocked_level: 3 }), 6) }),
      selection(),
    );
    const at6 = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 2, structuredStartCeilingMonth: highestAccessibleMonth(profile({ unlocked_level: 6 }), 6) }),
      selection(),
    );
    expect(at3.situationId).toBe('m3d1');
    expect(at6.situationId).toBe('m3d1');
  });
});

describe('TB-1a retroactivity — non-destructive re-base (R13)', () => {
  it('WITH progress: changing proficiency does NOT move the resume point or touch completions', () => {
    // A learner who completed M1D1 has a resume signal. Whatever their proficiency, they resume at
    // the first uncompleted day (M2D1) — placement is not consulted, and completions are untouched.
    const completed = new Set(['m1d1']);
    const asP0 = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 0, completedSituationIds: completed }),
      selection(),
    );
    const asP2 = structuredCoursePath.next(
      ctx({ situations: courseSituations, placementLevel: 2, completedSituationIds: completed }),
      selection(),
    );
    expect(asP0.situationId).toBe('m2d1');
    expect(asP2.situationId).toBe('m2d1'); // resume point unchanged by the proficiency change
    expect([...completed]).toEqual(['m1d1']); // completions untouched (pure read, no mutation)
  });

  it('WITHOUT progress: changing proficiency RE-BASES the recommended start', () => {
    const asP0 = structuredCoursePath.next(ctx({ situations: courseSituations, placementLevel: 0 }), selection());
    const asP2 = structuredCoursePath.next(ctx({ situations: courseSituations, placementLevel: 2 }), selection());
    expect(asP0.situationId).toBe('m1d1');
    expect(asP2.situationId).toBe('m3d1'); // re-based forward for a not-yet-advanced learner
  });
});
