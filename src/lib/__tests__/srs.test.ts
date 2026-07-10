// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/srs.test.ts
// Description: Unit tests for the pure SM-2 + dimension-weakness core (src/lib/srs.ts) — a
//   fatal-gate module the plan calls out explicitly. Covers gradeItem (ease floor 1.3, interval
//   ladder 1/6/round(interval*ease), grade<3 reset), isDue, weaknessScore, selectDueItems
//   ordering + dimension weighting (weight 0 excludes), and dimensionSummary shape (all 4
//   dimensions always present). Deterministic via a fixed `now`; no mocks (dependency-free by
//   contract, it only imports config + schema types).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import {
  dimensionSummary,
  gradeItem,
  initialMasteryState,
  isDue,
  selectDueItems,
  weaknessScore,
  type MasteryItem,
  type MasteryState,
  type Sm2Grade,
} from '../srs';
import { REVIEW_DIMENSIONS, type ReviewDimension } from '../../content/schema';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const state = (overrides: Partial<MasteryState> = {}): MasteryState => ({
  ...initialMasteryState(),
  ...overrides,
});

const item = (overrides: Partial<MasteryItem> = {}): MasteryItem => ({
  itemKey: 'vocab:sit-1:word',
  dimension: 'retrieve',
  ...initialMasteryState(),
  ...overrides,
});

describe('gradeItem — SM-2 transition', () => {
  it('first successful repetition sets a 1-day interval', () => {
    const next = gradeItem(initialMasteryState(), 5, NOW);
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBe(config.srs.firstIntervalDays); // 1
    expect(next.nextReview).toBe(new Date(NOW.getTime() + 1 * DAY_MS).toISOString());
  });

  it('second consecutive success sets the 6-day interval', () => {
    const after1 = gradeItem(initialMasteryState(), 5, NOW);
    const after2 = gradeItem(after1, 5, NOW);
    expect(after2.repetitions).toBe(2);
    expect(after2.intervalDays).toBe(config.srs.secondIntervalDays); // 6
  });

  it('third+ success uses round(interval * ease)', () => {
    const s = state({ repetitions: 2, intervalDays: 6, ease: 2.5 });
    const next = gradeItem(s, 5, NOW);
    expect(next.repetitions).toBe(3);
    // ease' = max(1.3, 2.5 + 0.1 - 0) = 2.6 ; round(6 * 2.6) = round(15.6) = 16
    expect(next.ease).toBeCloseTo(2.6, 10);
    expect(next.intervalDays).toBe(16);
  });

  it('failed recall (grade < passingGrade) resets repetitions and interval', () => {
    const s = state({ repetitions: 5, intervalDays: 40, ease: 2.5 });
    const next = gradeItem(s, 1, NOW);
    expect(next.repetitions).toBe(0);
    expect(next.intervalDays).toBe(config.srs.firstIntervalDays); // 1
    expect(next.lastGrade).toBe(1);
  });

  it('floors the ease factor at config.srs.minEase (1.3)', () => {
    // Repeated grade-0 failures drive ease down; it must never fall below 1.3.
    let s = state({ ease: 1.3 });
    for (let i = 0; i < 5; i++) s = gradeItem(s, 0 as Sm2Grade, NOW);
    expect(s.ease).toBe(config.srs.minEase);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('a perfect grade nudges ease up by 0.1', () => {
    const next = gradeItem(state({ ease: 2.5 }), 5, NOW);
    expect(next.ease).toBeCloseTo(2.6, 10);
  });
});

describe('isDue', () => {
  it('is due when never reviewed (nextReview null)', () => {
    expect(isDue({ nextReview: null }, NOW)).toBe(true);
  });

  it('is due when nextReview is in the past', () => {
    expect(isDue({ nextReview: new Date(NOW.getTime() - DAY_MS).toISOString() }, NOW)).toBe(true);
  });

  it('is NOT due when nextReview is in the future', () => {
    expect(isDue({ nextReview: new Date(NOW.getTime() + DAY_MS).toISOString() }, NOW)).toBe(false);
  });

  it('is due at exactly nextReview (<=)', () => {
    expect(isDue({ nextReview: NOW.toISOString() }, NOW)).toBe(true);
  });
});

describe('weaknessScore', () => {
  it('a brand-new item scores 2 (max ease-weakness + max repetition-weakness)', () => {
    // ease = initialEase => easeComponent 0; repetitions 0 => repetitionComponent 1... but a
    // brand new item has ease = initialEase so easeComponent = 0, repetition = 1 => 1.
    const fresh = weaknessScore(initialMasteryState());
    expect(fresh).toBeCloseTo(1, 10);
  });

  it('lowest ease + zero reps scores close to 2 (weakest)', () => {
    const weak = weaknessScore(state({ ease: config.srs.minEase, repetitions: 0 }));
    expect(weak).toBeCloseTo(2, 10);
  });

  it('higher repetitions lower the score (stronger)', () => {
    const few = weaknessScore(state({ ease: 2.5, repetitions: 1 }));
    const many = weaknessScore(state({ ease: 2.5, repetitions: 9 }));
    expect(many).toBeLessThan(few);
  });
});

describe('selectDueItems', () => {
  it('returns only due items, weakest+most-overdue first', () => {
    const items: MasteryItem[] = [
      item({ itemKey: 'a', dimension: 'retrieve', nextReview: null, ease: 2.5, repetitions: 3 }),
      item({ itemKey: 'b', dimension: 'retrieve', nextReview: null, ease: config.srs.minEase, repetitions: 0 }),
      // not due
      item({ itemKey: 'c', dimension: 'retrieve', nextReview: new Date(NOW.getTime() + DAY_MS).toISOString() }),
    ];
    const due = selectDueItems(items, { now: NOW });
    expect(due.map((i) => i.itemKey)).toEqual(['b', 'a']); // b is weaker => first
  });

  it('respects the limit', () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ itemKey: `k${i}`, nextReview: null }));
    expect(selectDueItems(items, { now: NOW, limit: 2 })).toHaveLength(2);
  });

  it('dimension weight 0 excludes that dimension entirely', () => {
    const items: MasteryItem[] = [
      item({ itemKey: 'h', dimension: 'hear', nextReview: null }),
      item({ itemKey: 's', dimension: 'say', nextReview: null }),
    ];
    const due = selectDueItems(items, { now: NOW, dimensionWeights: { hear: 0 } });
    expect(due.map((i) => i.dimension)).toEqual(['say']);
  });

  it('dimension weighting biases ordering toward the boosted dimension', () => {
    // Two equally-weak, equally-due items in different dimensions; boosting 'hear' should
    // put the hear item first even though tie-break on itemKey would otherwise favor 'say'.
    const items: MasteryItem[] = [
      item({ itemKey: 'z-hear', dimension: 'hear', nextReview: null }),
      item({ itemKey: 'a-say', dimension: 'say', nextReview: null }),
    ];
    const unweighted = selectDueItems(items, { now: NOW });
    expect(unweighted[0].itemKey).toBe('a-say'); // tie-break on itemKey
    const weighted = selectDueItems(items, { now: NOW, dimensionWeights: { hear: 3 } });
    expect(weighted[0].dimension).toBe('hear');
  });

  it('ties break deterministically on itemKey then dimension', () => {
    const items: MasteryItem[] = [
      item({ itemKey: 'b', dimension: 'retrieve', nextReview: null }),
      item({ itemKey: 'a', dimension: 'retrieve', nextReview: null }),
    ];
    expect(selectDueItems(items, { now: NOW }).map((i) => i.itemKey)).toEqual(['a', 'b']);
  });
});

describe('dimensionSummary', () => {
  it('always contains all 4 dimensions even when empty', () => {
    const summary = dimensionSummary([], NOW);
    for (const d of REVIEW_DIMENSIONS) {
      expect(summary[d]).toBeDefined();
      expect(summary[d].count).toBe(0);
      expect(summary[d].dueCount).toBe(0);
      expect(summary[d].avgEase).toBe(config.srs.initialEase);
      expect(summary[d].weakest).toEqual([]);
    }
  });

  it('computes per-dimension count, avgEase, dueCount and weakest ordering', () => {
    const items: MasteryItem[] = [
      item({ itemKey: 'k1', dimension: 'hear', ease: 2.0, repetitions: 1, nextReview: null }),
      item({ itemKey: 'k2', dimension: 'hear', ease: 2.5, repetitions: 5, nextReview: new Date(NOW.getTime() + DAY_MS).toISOString() }),
      item({ itemKey: 'k3', dimension: 'say', ease: 1.5, repetitions: 0, nextReview: null }),
    ];
    const summary = dimensionSummary(items, NOW);
    expect(summary.hear.count).toBe(2);
    expect(summary.hear.avgEase).toBeCloseTo((2.0 + 2.5) / 2, 10);
    expect(summary.hear.dueCount).toBe(1); // k1 due (null), k2 in future
    // weakest ordered by weaknessScore desc: k1 (lower ease, fewer reps) before k2.
    expect(summary.hear.weakest[0].itemKey).toBe('k1');
    expect(summary.say.count).toBe(1);
    expect(summary.avoid.count).toBe(0);
  });

  it('caps weakest at the requested count', () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      item({ itemKey: `k${i}`, dimension: 'retrieve' as ReviewDimension, nextReview: null }),
    );
    const summary = dimensionSummary(items, NOW, 2);
    expect(summary.retrieve.weakest).toHaveLength(2);
  });
});
