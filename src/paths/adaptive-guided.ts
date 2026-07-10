// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/paths/adaptive-guided.ts
// Description: Adaptive Guided path (docs/CONTENT-ARCHITECTURE.md §5, path type 3) — the DEFAULT
//   tutor posture and the daily-session COMPOSER. sessionPlan() builds the ~30-min session
//   (listening warmup → shadowing → pattern drill → roleplay → review → mission) from the
//   CONFIGURABLE template in config.dailySession.template (durations + segments = data, not code),
//   and chooses the situation it recommends from placement + active track + weaknesses
//   (SRS dimensionSummary, §6) + SRS-due (mastery_items). Returns an ordered list of
//   {engineId, situationId, minutes, label} the DailySessionView sequences straight into the
//   existing practice engines (via the registry). next() surfaces "Start today's session · ~30 min"
//   — the app leads. Pure/deterministic on context.now (no Date.now() inside) so the unit-tests
//   step can assert the composed plan shape. Ordering is weakness-first but SOFT — never a gate.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { config } from '../config';
import type { Situation } from '../content/schema';
import { weaknessScore } from '../lib/srs';
import { topFocus, type CoachSignals } from '../lib/coach';
import type {
  LearningPath,
  NextAction,
  PathContext,
  PathDescription,
  PathSelection,
  SessionSegment,
} from './types';

/**
 * Extract the situation id a mastery item_key points at. The seed engines namespace their
 * keys as "<engine>:<situationId>:<...>" (see vocabulary/itemKeys.ts). We take the middle
 * segment when present, else the whole key — a best-effort back-reference used only to bias
 * situation choice toward the learner's weak content (never a correctness dependency).
 */
const situationIdFromItemKey = (itemKey: string): string | null => {
  const parts = itemKey.split(':');
  if (parts.length >= 2) return parts[1] || null;
  return itemKey || null;
};

/**
 * Score every in-scope situation for "practice this today". Higher = more relevant:
 *  - active-track membership (goal relevance, §5/§6b)
 *  - accumulated SRS weakness on content that maps back to the situation (§6)
 *  - due items on that content (review urgency)
 *  - closeness to placement level (a sensible starting point; soft)
 *  - a small penalty for already-completed situations (favor forward motion, not a gate)
 * Deterministic; ties break on id.
 */
const scoreSituations = (
  context: PathContext,
  selection: PathSelection
): { situation: Situation; score: number }[] => {
  // Aggregate weakness + due-ness per situation id from the mastery rows.
  const weaknessBySituation = new Map<string, number>();
  const dueBySituation = new Map<string, number>();
  for (const item of context.mastery) {
    const sid = situationIdFromItemKey(item.itemKey);
    if (!sid) continue;
    weaknessBySituation.set(sid, (weaknessBySituation.get(sid) ?? 0) + weaknessScore(item));
    const due = item.nextReview === null || new Date(item.nextReview).getTime() <= context.now.getTime();
    if (due) dueBySituation.set(sid, (dueBySituation.get(sid) ?? 0) + 1);
  }

  const activeTrackId = selection.activeTrackId;

  return context.situations
    .map((situation) => {
      let score = 0;
      if (activeTrackId && situation.tracks.includes(activeTrackId)) score += 3; // goal relevance
      score += weaknessBySituation.get(situation.id) ?? 0; // weakness (§6)
      score += (dueBySituation.get(situation.id) ?? 0) * 0.5; // review urgency
      score += Math.max(0, 2 - Math.abs(situation.level - context.placementLevel)); // near placement
      if (context.completedSituationIds.has(situation.id)) score -= 1.5; // favor new, softly
      return { situation, score };
    })
    .sort((a, b) => b.score - a.score || a.situation.id.localeCompare(b.situation.id));
};

/**
 * COACH SEAM (§6b, "closes the loop"): derive the Coach's ranked top focus from the same context
 * the composer already has, and return the situation it points at (when any). This lets the daily
 * session compose AROUND the Coach's top suggestion — acting on a Focus card and starting a session
 * converge on the same content. Pure: builds CoachSignals from the context (mastery + per-situation
 * signals) and calls the deterministic topFocus(). Returns null when the top focus is dimension-only
 * (no situation) or nothing is suggested, so the composer falls back to its own scoring.
 */
const coachTopFocusSituationId = (context: PathContext, selection: PathSelection): string | null => {
  const completed = context.completedSituationIds;
  const signals: CoachSignals = {
    dimensionSummary: context.dimensionSummary,
    mastery: context.mastery,
    situations: context.situations.map((s) => ({
      situationId: s.id,
      title: s.title,
      tracks: s.tracks,
      completed: completed.has(s.id),
    })),
    activeTrackId: selection.activeTrackId,
    now: context.now,
  };
  return topFocus(signals)?.action.situationId ?? null;
};

/**
 * The single situation the composer recommends for today (null when no content loaded). The Coach's
 * top focus (§6b) gets FIRST refusal — if it names a situation that is in scope, the session is built
 * around it (closing the feedback loop); otherwise we fall back to the weakness/goal/placement score.
 * Never a hard gate — this only reorders the soft recommendation.
 */
const recommendSituation = (context: PathContext, selection: PathSelection): Situation | null => {
  const focusSituationId = coachTopFocusSituationId(context, selection);
  if (focusSituationId) {
    const focused = context.situations.find((s) => s.id === focusSituationId);
    if (focused) return focused;
  }
  return scoreSituations(context, selection)[0]?.situation ?? null;
};

export const adaptiveGuidedPath: LearningPath = {
  type: 'adaptive-guided',

  describe(): PathDescription {
    return {
      type: 'adaptive-guided',
      title: 'Adaptive guided',
      tagline: 'A guided ~30-min daily session, built around you.',
      posture: 'tutor',
    };
  },

  order(context: PathContext, selection: PathSelection): Situation[] {
    // Recommendation order = the same weakness/goal/placement scoring the composer uses.
    return scoreSituations(context, selection).map((entry) => entry.situation);
  },

  next(context: PathContext, selection: PathSelection): NextAction {
    const situation = recommendSituation(context, selection);
    const totalMinutes = config.dailySession.template.reduce((sum, seg) => sum + seg.minutes, 0);
    return {
      kind: 'session',
      label: "Start today's session",
      situationId: situation?.id ?? null,
      engineId: null, // the session sequences through several engines
      detail: `~${totalMinutes} min`,
    };
  },

  /**
   * Compose the daily session: one segment per config template entry, each pinned to the
   * recommended situation (the engine falls back to its own default when situationId is
   * null). The plan is an ordered list of {engineId, situationId, minutes, label} — exactly
   * the shape the DailySessionView sequences into the engines via the registry.
   */
  sessionPlan(context: PathContext, selection: PathSelection): SessionSegment[] {
    const situation = recommendSituation(context, selection);
    return config.dailySession.template.map((seg) => ({
      engineId: seg.engineId,
      label: seg.label,
      situationId: situation?.id ?? null,
      minutes: seg.minutes,
    }));
  },
};
