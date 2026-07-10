// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/coach.test.ts
// Description: Unit tests for the deterministic Coach / Insights engine (src/lib/coach.ts) —
//   the pure §6b core behind the Focus card, session recap, and weekly insight. Covers the four
//   scoring factors, rankFocus scoring/ordering + goal-relevance/avoidance boosts, topFocus,
//   buildSessionRecap (strengths/shaky dedupe + reviewAdded), and buildWeeklyInsight
//   (improved deltas + next focus + headline). Deterministic via a fixed `now`; no mocks
//   (dependency-free by contract — imports only config + srs + schema types).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import {
  buildSessionRecap,
  buildWeeklyInsight,
  dimensionSeverity,
  goalRelevance,
  rankFocus,
  recencyAvoidance,
  reviewUrgency,
  topFocus,
  type CoachSignals,
  type SessionResult,
  type WeeklyHistoryEntry,
} from '../coach';
import { dimensionSummary, type MasteryItem } from '../srs';
import { initialMasteryState } from '../srs';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const masteryItem = (o: Partial<MasteryItem>): MasteryItem => ({
  itemKey: 'vocab:sit-1:w',
  dimension: 'retrieve',
  ...initialMasteryState(),
  ...o,
});

describe('scoring factors', () => {
  it('goalRelevance boosts on-track content and is neutral otherwise', () => {
    expect(goalRelevance(true)).toBe(config.coach.goalRelevanceBoost);
    expect(goalRelevance(false)).toBe(1);
  });

  it('reviewUrgency grows with due count but is capped', () => {
    expect(reviewUrgency(0)).toBe(1);
    expect(reviewUrgency(1)).toBeCloseTo(1 + config.coach.urgencyPerDueItem, 10);
    expect(reviewUrgency(1000)).toBe(1 + config.coach.maxUrgencyBoost);
  });

  it('recencyAvoidance boosts avoided and never-practiced content', () => {
    expect(recencyAvoidance(false, undefined, NOW)).toBeCloseTo(1 + config.coach.neverPracticedBoost, 10);
    expect(recencyAvoidance(true, NOW.toISOString(), NOW)).toBeCloseTo(1 + config.coach.avoidanceBoost, 10);
    // Recently practiced (within staleAfterDays) => no recency boost.
    expect(recencyAvoidance(false, NOW.toISOString(), NOW)).toBe(1);
  });

  it('recencyAvoidance adds a bounded stale boost past the threshold', () => {
    const stale = new Date(NOW.getTime() - 30 * DAY_MS).toISOString();
    const factor = recencyAvoidance(false, stale, NOW);
    expect(factor).toBe(1 + config.coach.maxRecencyBoost);
  });

  it('dimensionSeverity returns neutral-low for an empty dimension', () => {
    const summary = dimensionSummary([], NOW);
    expect(dimensionSeverity(summary, 'hear')).toBe(config.coach.emptyDimensionSeverity);
  });
});

describe('rankFocus', () => {
  it('returns nothing when there are no signals at all', () => {
    const signals: CoachSignals = {
      dimensionSummary: dimensionSummary([], NOW),
      mastery: [],
      situations: [],
      activeTrackId: null,
      now: NOW,
    };
    expect(rankFocus(signals)).toEqual([]);
  });

  it('surfaces a dimension suggestion when items are due', () => {
    const mastery: MasteryItem[] = [
      masteryItem({ itemKey: 'vocab:s1:a', dimension: 'hear', nextReview: null, ease: config.srs.minEase }),
    ];
    const signals: CoachSignals = {
      dimensionSummary: dimensionSummary(mastery, NOW),
      mastery,
      situations: [],
      activeTrackId: null,
      now: NOW,
    };
    const focus = rankFocus(signals);
    const dim = focus.find((f) => f.id === 'dim:hear');
    expect(dim).toBeDefined();
    expect(dim?.action.dimension).toBe('hear');
    expect(dim?.evidence.dueCount).toBe(1);
    expect(dim?.action.engineId).toBe(config.coach.dimensionEngine.hear); // 'listening'
  });

  it('caps output at config.coach.maxSuggestions', () => {
    const mastery: MasteryItem[] = [];
    for (const d of ['hear', 'say', 'retrieve', 'avoid'] as const) {
      mastery.push(masteryItem({ itemKey: `vocab:s-${d}:x`, dimension: d, nextReview: null, ease: config.srs.minEase }));
    }
    // Plenty of situation candidates too.
    const situations = Array.from({ length: 6 }, (_, i) => ({
      situationId: `s${i}`,
      title: `Sit ${i}`,
      avoided: true,
    }));
    const signals: CoachSignals = {
      dimensionSummary: dimensionSummary(mastery, NOW),
      mastery,
      situations,
      activeTrackId: null,
      now: NOW,
    };
    expect(rankFocus(signals).length).toBeLessThanOrEqual(config.coach.maxSuggestions);
  });

  it('goal-relevant situations outrank otherwise-identical off-track ones', () => {
    // Two situations with identical accumulated weakness; one is on the active track.
    const mastery: MasteryItem[] = [
      masteryItem({ itemKey: 'x:on-track:w', dimension: 'retrieve', ease: config.srs.minEase, repetitions: 0, nextReview: null }),
      masteryItem({ itemKey: 'x:off-track:w', dimension: 'retrieve', ease: config.srs.minEase, repetitions: 0, nextReview: null }),
    ];
    const signals: CoachSignals = {
      dimensionSummary: dimensionSummary([], NOW), // no dimension candidates, isolate situations
      mastery,
      situations: [
        { situationId: 'on-track', title: 'On', tracks: ['t1'] },
        { situationId: 'off-track', title: 'Off', tracks: ['t2'] },
      ],
      activeTrackId: 't1',
      now: NOW,
    };
    const focus = rankFocus(signals);
    const onTrack = focus.find((f) => f.id === 'sit:on-track');
    const offTrack = focus.find((f) => f.id === 'sit:off-track');
    expect(onTrack).toBeDefined();
    expect(offTrack).toBeDefined();
    expect(onTrack!.score).toBeGreaterThan(offTrack!.score);
    expect(onTrack!.evidence.goalRelevant).toBe(true);
  });

  it('surfaces an avoided situation with the "you skipped it" framing and simulator route', () => {
    const signals: CoachSignals = {
      dimensionSummary: dimensionSummary([], NOW),
      mastery: [],
      situations: [{ situationId: 'confront', title: 'Neighbour dispute', avoided: true }],
      activeTrackId: null,
      now: NOW,
    };
    const focus = rankFocus(signals);
    const sug = focus.find((f) => f.id === 'sit:confront');
    expect(sug).toBeDefined();
    expect(sug?.title).toMatch(/skipped it/);
    expect(sug?.action.engineId).toBe(config.coach.avoidedEngine); // 'simulator'
    expect(sug?.evidence.avoided).toBe(true);
  });

  it('is deterministic — same input yields same ordering', () => {
    const mastery: MasteryItem[] = [
      masteryItem({ itemKey: 'x:a:w', dimension: 'retrieve', ease: config.srs.minEase, nextReview: null }),
    ];
    const signals: CoachSignals = {
      dimensionSummary: dimensionSummary(mastery, NOW),
      mastery,
      situations: [{ situationId: 'a', title: 'A', avoided: true }],
      activeTrackId: null,
      now: NOW,
    };
    expect(rankFocus(signals)).toEqual(rankFocus(signals));
  });
});

describe('topFocus', () => {
  it('returns null when nothing is suggested', () => {
    expect(
      topFocus({
        dimensionSummary: dimensionSummary([], NOW),
        mastery: [],
        situations: [],
        activeTrackId: null,
        now: NOW,
      }),
    ).toBeNull();
  });

  it('returns the highest-scoring suggestion', () => {
    const signals: CoachSignals = {
      dimensionSummary: dimensionSummary([], NOW),
      mastery: [],
      situations: [{ situationId: 'skip', title: 'Skip', avoided: true }],
      activeTrackId: null,
      now: NOW,
    };
    const top = topFocus(signals);
    expect(top?.id).toBe('sit:skip');
    expect(top).toEqual(rankFocus(signals)[0]);
  });
});

describe('buildSessionRecap', () => {
  it('splits strengths and shaky by passing grade, and counts reviewAdded', () => {
    const results: SessionResult[] = [
      { itemKey: 'a', label: 'A', dimension: 'retrieve', grade: 5, addedToReview: true },
      { itemKey: 'b', label: 'B', dimension: 'retrieve', grade: 1, addedToReview: true },
      { itemKey: 'c', label: 'C', dimension: 'hear', grade: 3 },
    ];
    const recap = buildSessionRecap(results);
    expect(recap.strengths).toEqual(['A', 'C']); // grade >= 3
    expect(recap.shaky).toEqual(['B']);
    expect(recap.reviewAdded).toBe(2);
  });

  it('a label missed on any dimension is shaky, never a strength (dedupe)', () => {
    const results: SessionResult[] = [
      { itemKey: 'w', label: 'obrigado', dimension: 'retrieve', grade: 5 },
      { itemKey: 'w', label: 'obrigado', dimension: 'hear', grade: 1 },
    ];
    const recap = buildSessionRecap(results);
    expect(recap.shaky).toEqual(['obrigado']);
    expect(recap.strengths).toEqual([]);
  });

  it('empty input yields empty arrays (honest, no fabricated feedback)', () => {
    expect(buildSessionRecap([])).toEqual({ strengths: [], shaky: [], reviewAdded: 0 });
  });

  it('caps each column at recapMaxChips', () => {
    const results: SessionResult[] = Array.from({ length: config.coach.recapMaxChips + 3 }, (_, i) => ({
      itemKey: `k${i}`,
      label: `L${i}`,
      dimension: 'retrieve' as const,
      grade: 5,
    }));
    expect(buildSessionRecap(results).strengths).toHaveLength(config.coach.recapMaxChips);
  });
});

describe('buildWeeklyInsight', () => {
  it('reports improved dimensions with deltas and a momentum headline', () => {
    const history: WeeklyHistoryEntry[] = [
      { date: '2026-07-01', avgEaseByDimension: { hear: 2.0, say: 2.4 } },
      { date: '2026-07-08', avgEaseByDimension: { hear: 2.4, say: 2.4 } },
    ];
    const insight = buildWeeklyInsight(history);
    expect(insight.improved).toEqual([{ dimension: 'hear', delta: 0.4 }]);
    expect(insight.headline).toMatch(/hear/);
  });

  it('picks the weakest current dimensions as next focus', () => {
    const history: WeeklyHistoryEntry[] = [
      { date: '2026-07-08', avgEaseByDimension: { hear: 1.5, say: 2.5, retrieve: 2.0 } },
    ];
    const insight = buildWeeklyInsight(history);
    // weakest (lowest ease) first, capped at weeklyNextFocusCount (2): hear then retrieve.
    expect(insight.nextFocus.slice(0, 2)).toEqual(['hear', 'retrieve']);
  });

  it('a single-day history yields no improvement deltas but a build-up headline', () => {
    const insight = buildWeeklyInsight([{ date: '2026-07-08', avgEaseByDimension: { hear: 2.0 } }]);
    expect(insight.improved).toEqual([]);
    expect(insight.headline).toMatch(/builds as you practice/);
  });

  it('empty history is safe', () => {
    const insight = buildWeeklyInsight([]);
    expect(insight.improved).toEqual([]);
    expect(insight.nextFocus).toEqual([]);
  });
});
