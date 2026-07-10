// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/srs.ts
// Description: Pure SM-2 spaced-repetition core with the 4-dimension adaptive weakness model
//   (docs/CONTENT-ARCHITECTURE.md §6: hear | say | retrieve | avoid). SM-2 scheduling is the
//   substrate; the dimension model steers selection — review what the learner cannot hear,
//   cannot say, or cannot retrieve quickly. Exposes gradeItem (classic SM-2 transition),
//   selectDueItems (overdue-ness × weakness × per-dimension weighting, so the Coach/daily
//   session can target 'hear' or 'say'), and dimensionSummary (the Coach's §6b signal input).
//   DEPENDENCY-FREE BY CONTRACT: no supabase/react imports — the unit-tests step tests this
//   module directly. All time-dependent functions take `now` as a parameter (no Date.now()
//   inside), so every function here is deterministic. Persistence lives in
//   src/hooks/useDueItems.ts against the mastery_items table (supabase/migrations/00006).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { config } from '../config';
import { REVIEW_DIMENSIONS, type ReviewDimension } from '../content/schema';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** SM-2 recall grade: 0 = blackout/avoided … 5 = perfect instant recall. */
export type Sm2Grade = 0 | 1 | 2 | 3 | 4 | 5;

/** Scheduling state of one (item, dimension) pair — mirrors mastery_items columns. */
export interface MasteryState {
  /** SM-2 ease factor (EF), floored at config.srs.minEase. */
  ease: number;
  /** Current inter-review interval in days. */
  intervalDays: number;
  /** Consecutive successful repetitions (resets on grade < passingGrade). */
  repetitions: number;
  /** ISO timestamp of the next scheduled review; null = never reviewed (always due). */
  nextReview: string | null;
  /** Last recorded grade, null before the first review. */
  lastGrade: number | null;
}

/** A mastery item as steered by the dimension model (one mastery_items row). */
export interface MasteryItem extends MasteryState {
  /** Content pointer: vocab word, pattern id, review-item id, situation id, … */
  itemKey: string;
  dimension: ReviewDimension;
}

/** Per-dimension steering weights for selectDueItems (missing dimension = weight 1). */
export type DimensionWeights = Partial<Record<ReviewDimension, number>>;

export interface SelectDueOptions {
  /** Max items to return. Defaults to config.srs.defaultDueLimit. */
  limit?: number;
  /** Reference time for due-ness/overdue-ness — pass explicitly (determinism). */
  now: Date;
  /**
   * Per-dimension multipliers so callers (Coach, daily-session builder) can target a
   * dimension: e.g. { hear: 2 } biases selection toward listening weaknesses. A weight
   * of 0 excludes the dimension entirely.
   */
  dimensionWeights?: DimensionWeights;
}

/** The Coach's §6b per-dimension signal (input to focus-suggestion ranking). */
export interface DimensionSummaryEntry {
  /** Items tracked in this dimension. */
  count: number;
  /** Mean ease across the dimension; config.srs.initialEase (neutral) when count is 0. */
  avgEase: number;
  /** Items due at `now` (including never-reviewed items). */
  dueCount: number;
  /** The weakest items (highest weaknessScore first), capped at summaryWeakestCount. */
  weakest: MasteryItem[];
}

export type DimensionSummary = Record<ReviewDimension, DimensionSummaryEntry>;

/** Fresh scheduling state for an item seen for the first time (matches DB defaults). */
export const initialMasteryState = (): MasteryState => ({
  ease: config.srs.initialEase,
  intervalDays: 0,
  repetitions: 0,
  nextReview: null,
  lastGrade: null,
});

/**
 * Classic SM-2 transition. Pure and deterministic — `now` is a parameter.
 *
 * - ease' = max(minEase, ease + 0.1 − (5 − grade) × (0.08 + (5 − grade) × 0.02))
 * - grade < passingGrade: repetitions reset to 0, interval back to firstIntervalDays
 * - otherwise: interval ladder firstIntervalDays → secondIntervalDays → interval × ease'
 */
export const gradeItem = (state: MasteryState, grade: Sm2Grade, now: Date): MasteryState => {
  const ease = Math.max(
    config.srs.minEase,
    state.ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)
  );

  let repetitions: number;
  let intervalDays: number;
  if (grade < config.srs.passingGrade) {
    repetitions = 0;
    intervalDays = config.srs.firstIntervalDays;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = config.srs.firstIntervalDays;
    else if (repetitions === 2) intervalDays = config.srs.secondIntervalDays;
    else intervalDays = Math.max(1, Math.round(state.intervalDays * ease));
  }

  return {
    ease,
    intervalDays,
    repetitions,
    nextReview: new Date(now.getTime() + intervalDays * MS_PER_DAY).toISOString(),
    lastGrade: grade,
  };
};

/** An item is due when it has never been reviewed or its next_review has passed. */
export const isDue = (item: Pick<MasteryState, 'nextReview'>, now: Date): boolean =>
  item.nextReview === null || new Date(item.nextReview).getTime() <= now.getTime();

/**
 * Dimension-weakness score in (0, 2]: lower ease + lower repetitions = weaker (§6).
 * Ease component normalizes (initialEase − ease) over the [minEase, initialEase] band;
 * repetition component is 1/(1 + repetitions), so brand-new items score 1 from it.
 */
export const weaknessScore = (item: MasteryState): number => {
  const easeBand = config.srs.initialEase - config.srs.minEase;
  const easeComponent = Math.min(
    1,
    Math.max(0, (config.srs.initialEase - item.ease) / easeBand)
  );
  const repetitionComponent = 1 / (1 + item.repetitions);
  return easeComponent + repetitionComponent;
};

/** Overdue-ness ≥ 1: 1 at exactly-due (or never-reviewed), growing per interval overdue. */
const overdueFactor = (item: MasteryState, now: Date): number => {
  if (item.nextReview === null) return 1;
  const overdueMs = now.getTime() - new Date(item.nextReview).getTime();
  const horizonMs = Math.max(item.intervalDays, 1) * MS_PER_DAY;
  return 1 + Math.max(0, overdueMs / horizonMs);
};

/** Selection priority: overdue-ness × dimension weakness × caller-supplied dimension weight. */
export const reviewPriority = (
  item: MasteryItem,
  now: Date,
  dimensionWeights?: DimensionWeights
): number =>
  overdueFactor(item, now) * weaknessScore(item) * (dimensionWeights?.[item.dimension] ?? 1);

/**
 * Due-item selection steered by the dimension model (§6): filters to due items, orders by
 * reviewPriority (weakest and most overdue first, biased by dimensionWeights), returns the
 * top `limit`. Deterministic: ties break on itemKey then dimension.
 */
export const selectDueItems = (items: MasteryItem[], opts: SelectDueOptions): MasteryItem[] => {
  const limit = opts.limit ?? config.srs.defaultDueLimit;
  return items
    .filter(
      item => isDue(item, opts.now) && (opts.dimensionWeights?.[item.dimension] ?? 1) > 0
    )
    .map(item => ({ item, priority: reviewPriority(item, opts.now, opts.dimensionWeights) }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.item.itemKey.localeCompare(b.item.itemKey) ||
        a.item.dimension.localeCompare(b.item.dimension)
    )
    .slice(0, limit)
    .map(entry => entry.item);
};

/**
 * Per-dimension mastery rollup — the Coach's §6b "SRS mastery across the 4 dimensions"
 * signal. Every dimension is present in the result even when it has no items yet
 * (count 0, avgEase neutral, empty weakest), so the Coach never branches on missing keys.
 */
export const dimensionSummary = (
  items: MasteryItem[],
  now: Date,
  weakestCount: number = config.srs.summaryWeakestCount
): DimensionSummary => {
  const summary = {} as DimensionSummary;
  for (const dimension of REVIEW_DIMENSIONS) {
    const dimensionItems = items.filter(item => item.dimension === dimension);
    const count = dimensionItems.length;
    summary[dimension] = {
      count,
      avgEase:
        count === 0
          ? config.srs.initialEase
          : dimensionItems.reduce((sum, item) => sum + item.ease, 0) / count,
      dueCount: dimensionItems.filter(item => isDue(item, now)).length,
      weakest: [...dimensionItems]
        .sort(
          (a, b) =>
            weaknessScore(b) - weaknessScore(a) || a.itemKey.localeCompare(b.itemKey)
        )
        .slice(0, weakestCount),
    };
  }
  return summary;
};
