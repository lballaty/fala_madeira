// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/session/useDailySession.ts
// Description: Daily-session slice (docs/CONTENT-ARCHITECTURE.md §5). Uses the shared usePathContext
//   (situations + tracks + completed-situation set + SRS mastery/dimensionSummary) and asks the
//   Adaptive Guided path (src/paths) to compose the ~30-min sessionPlan — an ordered list of
//   {engineId, situationId, minutes, label}. Owns segment navigation (advance / skip — no gates, §5)
//   and an after-session recap stub the coach step enriches later (see the // COACH SIGNAL seam).
//   Pure composition logic lives in src/paths (unit-testable); this hook is the react/data wiring.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import type { PracticalLevel } from '../../content/schema';
import { getPath, type PathSelection, type SessionSegment } from '../../paths';
import { buildSessionRecap, type SessionResult } from '../../lib/coach';
import type { MasteryItem } from '../../lib/srs';
import { usePathContext } from './usePathContext';

/**
 * After-session recap (§6b). The coach step (src/lib/coach.buildSessionRecap) fills
 * strengths/shaky/reviewAdded from the session's graded results, derived here by diffing the
 * mastery snapshot taken at session start against the live mastery rows at recap time (§6b —
 * "review items added" + strong/shaky). SessionRecap.tsx renders the model.
 */
export interface SessionRecap {
  /** Segments the learner actually advanced through. */
  segmentsCompleted: number;
  /** Total planned segments. */
  segmentsTotal: number;
  /** Sum of the planned minutes across all segments (the "~N min" headline). */
  plannedMinutes: number;
  // COACH SIGNAL (§6b): filled from the mastery deltas accumulated across this session — items
  // whose SM-2 state changed during the session are the graded results the coach aggregates into
  // strong-today / still-shaky / added-to-review. Honest empty state when nothing was graded.
  strengths: string[];
  shaky: string[];
  reviewAdded: number;
}

interface DailySessionDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  selection: PathSelection;
  /** Placement level (§5). Defaults to L1 daily-function when the profile has none. */
  placementLevel?: PracticalLevel;
}

export type DailySessionPhase = 'loading' | 'active' | 'recap';

export const useDailySession = ({ supabase, user, selection, placementLevel }: DailySessionDeps) => {
  const { context, isReady } = usePathContext({ supabase, user, placementLevel });

  const [plan, setPlan] = useState<SessionSegment[] | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [phase, setPhase] = useState<DailySessionPhase>('loading');

  // Compose the plan ONCE per content-load (pin it so it never shuffles mid-session). State is
  // set inside a promise callback (not synchronously in the effect body) per the repo's
  // react-hooks/set-state-in-effect pattern (see useDueItems / useVocabularySession).
  useEffect(() => {
    if (!isReady || plan !== null) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const composed = getPath('adaptive-guided').sessionPlan(context, selection) ?? [];
      setPlan(composed);
      setSegmentIndex(0);
      setPhase('active');
      logger.info('SESSION_COMPOSED', `daily session composed (${composed.length} segments)`, {
        category: 'USER_ACTION',
        details: {
          segments: composed.map((s) => ({ engineId: s.engineId, situationId: s.situationId, minutes: s.minutes })),
        },
      });
    });
    return () => {
      cancelled = true;
    };
    // context changes on every mastery tick; we intentionally compose only on the first ready
    // snapshot (the guard `plan !== null` pins it) so the session stays stable once started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, plan, selection]);

  const plannedMinutes = useMemo(
    () => config.dailySession.template.reduce((sum, seg) => sum + seg.minutes, 0),
    []
  );

  // COACH SIGNAL (§6b): snapshot each mastery item's SM-2 state (keyed by item:dimension) the
  // moment the session becomes active. The session engines grade items as the learner works; at
  // recap we diff this baseline against the live rows to recover the session's graded results
  // (the engines report completion via onExit, not results, so the mastery delta IS the signal).
  // State (not a ref) so the diff is render-safe and recomputes when the snapshot lands.
  const [baseline, setBaseline] = useState<Map<string, MasteryItem> | null>(null);
  useEffect(() => {
    if (phase !== 'active' || baseline !== null) return;
    let cancelled = false;
    // State set inside a promise callback (not synchronously in the effect body) per the repo's
    // react-hooks/set-state-in-effect pattern (mirrors the plan-composition effect above).
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setBaseline(
        new Map(context.mastery.map((item) => [`${item.itemKey}:${item.dimension}`, item]))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [phase, baseline, context.mastery]);

  // Reconstruct the session's graded results from the mastery delta (items whose nextReview /
  // lastGrade changed vs the baseline snapshot). A brand-new item (not in the baseline) that now
  // carries a grade counts as a newly-added review item.
  const sessionResults = useMemo((): SessionResult[] => {
    if (!baseline || phase !== 'recap') return [];
    const results: SessionResult[] = [];
    for (const item of context.mastery) {
      const key = `${item.itemKey}:${item.dimension}`;
      const before = baseline.get(key);
      const changed =
        before === undefined
          ? item.lastGrade !== null
          : before.nextReview !== item.nextReview || before.lastGrade !== item.lastGrade;
      if (!changed || item.lastGrade === null) continue;
      results.push({
        itemKey: item.itemKey,
        label: item.itemKey.split(':').pop() || item.itemKey,
        dimension: item.dimension,
        grade: item.lastGrade,
        // New (not previously scheduled) OR moved to a longer interval = added/rescheduled review.
        addedToReview: before === undefined || before.nextReview !== item.nextReview,
      });
    }
    return results;
  }, [phase, baseline, context.mastery]);

  const recapModel = useMemo(() => buildSessionRecap(sessionResults), [sessionResults]);

  const segment = plan && phase === 'active' ? (plan[segmentIndex] ?? null) : null;

  /** Advance to the next segment; finishing the last one ends the session at the recap (no gates). */
  const advance = useCallback(() => {
    setSegmentIndex((i) => {
      if (!plan) return i;
      const next = i + 1;
      if (next >= plan.length) {
        setPhase('recap');
        return i;
      }
      return next;
    });
  }, [plan]);

  /** Skip is behaviorally identical to advance (§5: skip any segment; the plan adapts either way). */
  const skip = advance;

  const recap: SessionRecap = useMemo(
    () => ({
      segmentsCompleted: phase === 'recap' ? (plan?.length ?? 0) : segmentIndex,
      segmentsTotal: plan?.length ?? 0,
      plannedMinutes,
      // COACH SIGNAL (§6b) — real aggregation from the session's mastery delta.
      strengths: recapModel.strengths,
      shaky: recapModel.shaky,
      reviewAdded: recapModel.reviewAdded,
    }),
    [phase, plan, segmentIndex, plannedMinutes, recapModel]
  );

  return {
    phase,
    plan,
    segment,
    segmentIndex,
    plannedMinutes,
    advance,
    skip,
    recap,
  };
};
