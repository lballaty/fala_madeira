// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/paths/structured-course.ts
// Description: Structured Course path (docs/CONTENT-ARCHITECTURE.md §5, path type 1) — the
//   built-in month-by-month calendar curriculum (the original ~168-lesson / 6-month path),
//   RETAINED as a first-class option, NOT removed. An ordered LearningPath over the seed pack's
//   Situation.course {month, day} slots (src/content/schema.ts CourseSlot). Progress comes from
//   the completed-situation set (user_situation_progress, §5); next() advances the cursor to the
//   first uncompleted day and renders "Continue Day N". Ordering is SOFT: situations without a
//   course slot sort last, and nothing is hard-gated — the learner may jump to any later day
//   (§5/§12). sessionPlan() returns null (the daily-session composer is Adaptive Guided's job).
//   Pure/deterministic on context.now — exercised directly by the unit-tests step.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import type { Situation } from '../content/schema';
import type {
  LearningPath,
  NextAction,
  PathContext,
  PathDescription,
  PathSelection,
  SessionSegment,
} from './types';

/** The structured curriculum spans 6 months (seed pack: 6 × 28 days — §2). */
const MIN_STRUCTURED_MONTH = 1;
const MAX_STRUCTURED_MONTH = 6;

/**
 * TB-1a §4.1 (D-map): map effective proficiency `p` to the initial structured start MONTH
 * (day 1 of that month). Derived from the empirical month↔level table (§2): p=0→M1 (L0/L1),
 * p=1→M2, p=2→M3 … p=5→M6, expressed as `clamp(p + 1, 1, 6)`. Pure/deterministic — this is
 * only a RECOMMENDED start, never a hard gate. The accessible-content bound (§5.3.2, R11) is
 * applied in the WIRING layer via context.structuredStartCeilingMonth (paths stay paywall-blind).
 */
export const initialStructuredMonth = (p: number): number =>
  Math.min(MAX_STRUCTURED_MONTH, Math.max(MIN_STRUCTURED_MONTH, Math.floor(p) + 1));

/** Sort key for a situation's course slot; slot-less situations sort after all slotted ones. */
const courseKey = (s: Situation): number => {
  if (!s.course) return Number.MAX_SAFE_INTEGER;
  // month is the coarse ordering; day is the absolute in-course day (already monotonic in
  // the seed pack) so day alone is a stable tiebreak within and across months.
  return s.course.month * 1_000_000 + s.course.day;
};

/** Situations that carry a course slot, in strict month/day order (the calendar curriculum). */
const orderedCourseSituations = (context: PathContext): Situation[] =>
  context.situations
    .filter((s) => s.course)
    .slice()
    .sort((a, b) => courseKey(a) - courseKey(b) || a.id.localeCompare(b.id));

export const structuredCoursePath: LearningPath = {
  type: 'structured',

  describe(): PathDescription {
    return {
      type: 'structured',
      title: 'Structured course',
      tagline: 'Month-by-month, day-by-day. The app leads.',
      posture: 'tutor',
    };
  },

  order(context: PathContext): Situation[] {
    // Course-slotted situations first (in calendar order), then everything else (soft,
    // never a gate) so the Learn "Structured course" list still surfaces stray content.
    const slotted = orderedCourseSituations(context);
    const slottedIds = new Set(slotted.map((s) => s.id));
    const rest = context.situations.filter((s) => !slottedIds.has(s.id));
    return [...slotted, ...rest];
  },

  next(context: PathContext, selection: PathSelection): NextAction {
    const ordered = orderedCourseSituations(context);

    // TB-1a §4.1/§5.2 — RESUME-VS-INITIAL precedence (D3/R12). A resume signal exists when the
    // learner has advanced past the untouched default cursor (1,1) OR completed ≥1 situation; in
    // that case the persisted cursor wins and placement is NOT consulted. Only for a brand-new,
    // not-yet-advanced learner do we SEED the start month from placement (§4.1). The day stays 1
    // (start of the seeded month) — the at/after-cursor scan below then finds the first uncompleted
    // day, unchanged. Bounded DOWN to the highest accessible month by the wiring layer's
    // context.structuredStartCeilingMonth (§5.3.2, R11) — paths never read unlocked_level.
    const isUntouchedCursor =
      selection.structuredMonth === MIN_STRUCTURED_MONTH && selection.structuredDay === 1;
    const isResume = !isUntouchedCursor || context.completedSituationIds.size > 0;

    let effectiveMonth = selection.structuredMonth;
    let effectiveDay = selection.structuredDay;
    if (!isResume) {
      const ceiling = context.structuredStartCeilingMonth ?? MAX_STRUCTURED_MONTH;
      const seededMonth = Math.min(initialStructuredMonth(context.placementLevel), ceiling);
      // max(cursorMonth, seed) keeps the derivation monotonic — never moves a placed learner
      // backward from a (here, default) cursor.
      effectiveMonth = Math.max(selection.structuredMonth, seededMonth);
      effectiveDay = effectiveMonth === selection.structuredMonth ? selection.structuredDay : 1;
    }

    // The next day is the first course situation the learner has not completed at/after
    // the effective cursor; falling back to the very first uncompleted day, then day 1.
    const cursorKey = effectiveMonth * 1_000_000 + effectiveDay;
    const atOrAfterCursor = ordered.filter((s) => courseKey(s) >= cursorKey);
    const pool = atOrAfterCursor.length > 0 ? atOrAfterCursor : ordered;
    const nextSituation =
      pool.find((s) => !context.completedSituationIds.has(s.id)) ?? pool[0] ?? ordered[0] ?? null;

    if (!nextSituation || !nextSituation.course) {
      // No course content loaded — degrade to a free-style prompt rather than a dead CTA.
      return { kind: 'free', label: 'Browse the course', situationId: null, engineId: null };
    }

    return {
      kind: 'situation',
      label: `Continue Day ${nextSituation.course.day}`,
      situationId: nextSituation.id,
      // Structured Course opens the situation in Listening (Hear → … core loop entry, §5);
      // the situation browser then lets the learner switch lens freely.
      engineId: 'listening',
      detail: nextSituation.title,
    };
  },

  sessionPlan(): SessionSegment[] | null {
    return null; // daily-session composition is Adaptive Guided's responsibility (§5).
  },
};
