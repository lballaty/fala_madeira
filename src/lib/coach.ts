// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/coach.ts
// Description: The Coach / Insights engine (docs/CONTENT-ARCHITECTURE.md §6b) — the DETERMINISTIC,
//   PURE, OFFLINE core of the Feedback & Focus loop (Signals → Insights → Prioritized suggestions
//   → one-tap action → new Signals). rankFocus() turns Signals (SRS dimensionSummary + per-situation
//   progress/avoidance/recency + SRS-due mastery, tagged to the active track for goal-relevance)
//   into a ranked FocusSuggestion[] — each a competence-framed one-tap label, an action that routes
//   into a practice engine, the evidence behind it ("why this?"), and a numeric score. Scoring is
//   `weakness severity × goal-relevance × review urgency × recency/avoidance`. buildSessionRecap()
//   and buildWeeklyInsight() produce the after-session recap and the weekly insight from the same
//   local/DB-cached data. DEPENDENCY-FREE BY CONTRACT: imports only config + srs + content schema
//   TYPES (no supabase/react/network), mirroring src/lib/srs.ts so the unit-tests step can exercise
//   it directly. Every time-dependent input is passed in (no Date.now() inside) → fully deterministic.
//   The AI narrative/pattern-spotting layer (Error Analyst) is a SEPARATE online enhancement
//   (src/features/coach/useCoach.ts) that ENRICHES these suggestions and falls back to this output.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { config } from '../config';
import { REVIEW_DIMENSIONS, type ReviewDimension } from '../content/schema';
import type { DimensionSummary, MasteryItem } from './srs';
import { weaknessScore } from './srs';

// ---------------------------------------------------------------------------
// Signals in (§6b) — the read-only snapshot the Coach reasons over
// ---------------------------------------------------------------------------

/**
 * Per-situation behavioral signal, derived from user_situation_progress. `avoided` is the
 * behavioral 'avoid' dimension (skipped/abandoned); `lastPracticedAt` drives recency (content
 * untouched for a while resurfaces). Missing entries mean "never touched" (max avoidance/recency).
 */
export interface SituationSignal {
  situationId: string;
  /** Human title for the one-tap label (falls back to the id when absent). */
  title?: string;
  /** Track ids this situation serves (goal-relevance against the active track). */
  tracks?: string[];
  /** True when the learner skipped/abandoned this situation (avoid dimension, §6). */
  avoided?: boolean;
  /** ISO timestamp of the last practice on this situation; null/undefined = never. */
  lastPracticedAt?: string | null;
  /** True once every mode on this situation is done (favor forward motion, softly). */
  completed?: boolean;
}

/**
 * The full Signals bundle rankFocus() consumes. All fields come from locally-stored / DB-cached
 * data (srs.dimensionSummary, user_situation_progress, mastery_items) so the whole computation
 * runs OFFLINE (§6b reliability). `now` is passed in for determinism.
 */
export interface CoachSignals {
  /** Per-dimension SRS rollup (srs.dimensionSummary) — the primary weakness signal (§6). */
  dimensionSummary: DimensionSummary;
  /** Raw mastery rows (mastery_items) — used for per-situation weakness aggregation. */
  mastery: MasteryItem[];
  /** Per-situation behavioral signals (avoidance, recency, completion). */
  situations: SituationSignal[];
  /** The learner's active goal-track id (goal-relevance boost); null when none chosen. */
  activeTrackId: string | null;
  /** Reference time (determinism — never Date.now() inside). */
  now: Date;
}

// ---------------------------------------------------------------------------
// Outputs (§6b) — ranked focus suggestions, recap, weekly insight
// ---------------------------------------------------------------------------

/** Where a one-tap focus action routes (a practice engine, optionally a situation/dimension). */
export interface FocusAction {
  /** registry.ts PracticeMode id the suggestion opens (e.g. 'listening', 'vocabulary'). */
  engineId: string;
  /** Situation to open the engine on (null = engine's own default content). */
  situationId?: string | null;
  /** The weak dimension this focus targets (steers review selection when present). */
  dimension?: ReviewDimension;
}

/** The evidence behind a suggestion — the calm, honest "why this?" reveal data (§6b). */
export interface FocusEvidence {
  /** One-line, competence-framed reason ("You needed to see the text on 4 listening items"). */
  reason: string;
  /** The dimension driving it, when weakness-driven. */
  dimension?: ReviewDimension;
  /** How many items/attempts back this up (the "missed 4×" count). */
  itemCount: number;
  /** How many of those are review-due right now (urgency). */
  dueCount: number;
  /** True when the suggestion is boosted by the active track (goal-relevance). */
  goalRelevant: boolean;
  /** True when this content was skipped/abandoned (avoidance). */
  avoided: boolean;
  /** The scoring breakdown (transparent — never arbitrary). */
  factors: {
    severity: number;
    goalRelevance: number;
    reviewUrgency: number;
    recencyAvoidance: number;
  };
}

/** One ranked focus recommendation — a competence-framed, one-tap action with its evidence. */
export interface FocusSuggestion {
  /** Stable id for React keys / dedupe (engine[:situation][:dimension]). */
  id: string;
  /** Competence-framed one-tap label ("Practice numbers — missed 4×"). */
  title: string;
  action: FocusAction;
  evidence: FocusEvidence;
  /** Composite score (weakness × goal × urgency × recency/avoidance); higher = do first. */
  score: number;
}

/** A single result graded during a session (the recap's raw input). */
export interface SessionResult {
  /** Content pointer (vocab word, pattern id, situation id …) for the label. */
  itemKey: string;
  /** Human label for the recap chip (falls back to itemKey). */
  label?: string;
  dimension: ReviewDimension;
  /** SM-2 grade 0–5 this result recorded. */
  grade: number;
  /** True when this result added / re-scheduled a review item (reviewAdded count). */
  addedToReview?: boolean;
}

/** After-session recap (§6b): strengths + shaky areas + how many review items were added. */
export interface SessionRecapModel {
  /** Labels the learner did well on today (grade ≥ passingGrade). */
  strengths: string[];
  /** Labels that are still shaky (grade < passingGrade). */
  shaky: string[];
  /** How many review items this session added / rescheduled. */
  reviewAdded: number;
}

/** One historical daily snapshot the weekly insight aggregates over. */
export interface WeeklyHistoryEntry {
  /** ISO date (day granularity) of the snapshot. */
  date: string;
  /** Per-dimension average ease that day (the improvement signal). */
  avgEaseByDimension: Partial<Record<ReviewDimension, number>>;
}

/** Weekly insight (§6b): what improved + the next focus, competence-framed. */
export interface WeeklyInsightModel {
  /** Dimensions whose average ease rose across the window (with the delta). */
  improved: Array<{ dimension: ReviewDimension; delta: number }>;
  /** The dimension(s) to focus on next (weakest by current ease). */
  nextFocus: ReviewDimension[];
  /** One calm, competence-framed headline (never scolding). */
  headline: string;
}

// ---------------------------------------------------------------------------
// Scoring — the four §6b factors (all in comparable, bounded-ish ranges)
// ---------------------------------------------------------------------------

/**
 * Weakness severity of a dimension in (0, ~2]: lower average ease + more items past
 * exposure. Built from dimensionSummary — the mean weaknessScore of the dimension's weakest
 * items (already the §6 weakness metric) so severity tracks the SRS substrate exactly.
 */
export const dimensionSeverity = (summary: DimensionSummary, dimension: ReviewDimension): number => {
  const entry = summary[dimension];
  if (!entry || entry.weakest.length === 0) {
    // No tracked items yet: neutral-low severity so a brand-new learner still gets guidance
    // from goal-relevance/recency, but weakness never dominates on an empty dimension.
    return config.coach.emptyDimensionSeverity;
  }
  const meanWeakness =
    entry.weakest.reduce((sum, item) => sum + weaknessScore(item), 0) / entry.weakest.length;
  return meanWeakness;
};

/** Goal-relevance multiplier: boosted when the content serves the active track (§5/§6b). */
export const goalRelevance = (isOnActiveTrack: boolean): number =>
  isOnActiveTrack ? config.coach.goalRelevanceBoost : 1;

/**
 * Review-urgency multiplier ≥ 1, growing with how many items are due (§6b). Sub-linear
 * (log-shaped via a bounded ratio) so one due item nudges and a big backlog doesn't explode.
 */
export const reviewUrgency = (dueCount: number): number =>
  1 + Math.min(config.coach.maxUrgencyBoost, dueCount * config.coach.urgencyPerDueItem);

/**
 * Recency/avoidance multiplier ≥ 1: avoided content and content untouched for a while get a
 * boost so the loop resurfaces what the learner is dodging or has drifted from (§6b).
 */
export const recencyAvoidance = (
  avoided: boolean,
  lastPracticedAt: string | null | undefined,
  now: Date
): number => {
  let factor = 1;
  if (avoided) factor += config.coach.avoidanceBoost;
  if (lastPracticedAt) {
    const days = (now.getTime() - new Date(lastPracticedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (days > config.coach.staleAfterDays) {
      factor += Math.min(config.coach.maxRecencyBoost, (days - config.coach.staleAfterDays) * config.coach.recencyPerStaleDay);
    }
  } else {
    // Never practiced = maximally stale (but only a nudge — new content is expected to be new).
    factor += config.coach.neverPracticedBoost;
  }
  return factor;
};

// ---------------------------------------------------------------------------
// The map from a mastery dimension to the engine that best trains it (§3 engines table)
// ---------------------------------------------------------------------------

/**
 * Which practice engine trains each dimension (docs/CONTENT-ARCHITECTURE §3). The Coach routes
 * a weak-dimension suggestion into the engine that exercises it. 'retrieve' and 'avoid' route to
 * vocabulary/review (recall + resurfacing). Config-overridable so methodology can evolve.
 */
const engineForDimension = (dimension: ReviewDimension): string =>
  config.coach.dimensionEngine[dimension] ?? 'vocabulary';

/** Competence-framed verb per dimension for the one-tap label ("Sharpen", "Practice", …). */
const DIMENSION_LABEL: Record<ReviewDimension, string> = {
  hear: 'Tune your ear',
  say: 'Smooth your delivery',
  retrieve: 'Speed up recall',
  avoid: 'Revisit what you skipped',
};

// ---------------------------------------------------------------------------
// rankFocus — the core §6b prioritization
// ---------------------------------------------------------------------------

/** Aggregate per-situation weakness + due counts from the mastery rows (best-effort back-ref). */
const situationWeakness = (
  mastery: MasteryItem[],
  now: Date
): Map<string, { weakness: number; due: number }> => {
  const map = new Map<string, { weakness: number; due: number }>();
  for (const item of mastery) {
    const parts = item.itemKey.split(':');
    const sid = parts.length >= 2 ? parts[1] : item.itemKey;
    if (!sid) continue;
    const entry = map.get(sid) ?? { weakness: 0, due: 0 };
    entry.weakness += weaknessScore(item);
    const due = item.nextReview === null || new Date(item.nextReview).getTime() <= now.getTime();
    if (due) entry.due += 1;
    map.set(sid, entry);
  }
  return map;
};

/**
 * rankFocus — turn Signals into ranked FocusSuggestion[] (§6b). Two families of candidate:
 *
 *  1. Dimension candidates — one per weak review dimension (hear/say/retrieve/avoid), scored by
 *     dimension severity × review urgency (from dimensionSummary.dueCount). These are the "Practice
 *     numbers — missed 4×"-style suggestions that route into the dimension's engine.
 *  2. Situation candidates — one per situation carrying accumulated weakness/avoidance/staleness,
 *     scored by its aggregated weakness × goal-relevance × review urgency × recency/avoidance.
 *
 * Both use the same four-factor score so they rank on one scale. Deterministic: ties break on id.
 * Returns the top config.coach.maxSuggestions (the Home Focus card shows the top 1–3).
 */
export const rankFocus = (signals: CoachSignals): FocusSuggestion[] => {
  const { dimensionSummary, mastery, situations, activeTrackId, now } = signals;
  const suggestions: FocusSuggestion[] = [];

  // --- (1) Dimension candidates -------------------------------------------------
  for (const dimension of REVIEW_DIMENSIONS) {
    const entry = dimensionSummary[dimension];
    // Skip dimensions with no tracked items AND nothing due — nothing to say yet.
    if (!entry || (entry.count === 0 && entry.dueCount === 0)) continue;

    const severity = dimensionSeverity(dimensionSummary, dimension);
    const urgency = reviewUrgency(entry.dueCount);
    // Dimension focus is not tied to one situation, so goal/recency are neutral (1) here.
    const score = severity * 1 * urgency * 1;
    // Only surface a dimension when it is actually weak or has due items (avoid noise).
    if (severity < config.coach.minDimensionSeverity && entry.dueCount === 0) continue;

    const missed = entry.weakest.length || entry.dueCount;
    const title =
      entry.dueCount > 0
        ? `${DIMENSION_LABEL[dimension]} — ${entry.dueCount} due`
        : `${DIMENSION_LABEL[dimension]} — ${missed} shaky`;

    suggestions.push({
      id: `dim:${dimension}`,
      title,
      action: { engineId: engineForDimension(dimension), situationId: null, dimension },
      evidence: {
        reason:
          entry.dueCount > 0
            ? `${entry.dueCount} ${dimension} item${entry.dueCount === 1 ? '' : 's'} are ready for review.`
            : `Your ${dimension} items are the shakiest right now — a quick pass builds them up.`,
        dimension,
        itemCount: entry.count,
        dueCount: entry.dueCount,
        goalRelevant: false,
        avoided: dimension === 'avoid' && entry.count > 0,
        factors: { severity, goalRelevance: 1, reviewUrgency: urgency, recencyAvoidance: 1 },
      },
      score,
    });
  }

  // --- (2) Situation candidates -------------------------------------------------
  const weaknessBySituation = situationWeakness(mastery, now);
  for (const sig of situations) {
    const w = weaknessBySituation.get(sig.situationId);
    const weakness = w?.weakness ?? 0;
    const due = w?.due ?? 0;
    const avoided = Boolean(sig.avoided);

    // Only surface a situation when there is a real reason (weakness, due items, or avoidance).
    if (weakness < config.coach.minSituationWeakness && due === 0 && !avoided) continue;

    const isOnTrack = Boolean(activeTrackId && sig.tracks?.includes(activeTrackId));
    // Severity from accumulated situation weakness, normalized to a comparable band.
    const severity = Math.max(config.coach.emptyDimensionSeverity, weakness);
    const goal = goalRelevance(isOnTrack);
    const urgency = reviewUrgency(due);
    const recency = recencyAvoidance(avoided, sig.lastPracticedAt, now);
    // Completed content is de-emphasized (favor forward motion, softly — never a gate).
    const completionDamp = sig.completed ? config.coach.completedDamp : 1;
    const score = severity * goal * urgency * recency * completionDamp;

    const label = sig.title ?? sig.situationId;
    const title = avoided
      ? `Revisit ${label} — you skipped it`
      : due > 0
      ? `Review ${label} — ${due} due`
      : `Strengthen ${label}`;

    suggestions.push({
      id: `sit:${sig.situationId}`,
      // Engine choice: avoided → the simulator (face the scenario); else listening warmup entry.
      title,
      action: {
        engineId: avoided ? config.coach.avoidedEngine : config.coach.situationEntryEngine,
        situationId: sig.situationId,
      },
      evidence: {
        reason: avoided
          ? `You skipped "${label}" — a low-pressure pass is the fastest way to unstick it.`
          : due > 0
          ? `${due} review item${due === 1 ? '' : 's'} from "${label}" ${due === 1 ? 'is' : 'are'} due.`
          : `"${label}" is one of your shakier situations right now.`,
        itemCount: Math.round(weakness * 10) / 10 || due,
        dueCount: due,
        goalRelevant: isOnTrack,
        avoided,
        factors: { severity, goalRelevance: goal, reviewUrgency: urgency, recencyAvoidance: recency },
      },
      score,
    });
  }

  return suggestions
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, config.coach.maxSuggestions);
};

/** The single top focus (feeds the Adaptive Guided composer; null when nothing to suggest). */
export const topFocus = (signals: CoachSignals): FocusSuggestion | null =>
  rankFocus(signals)[0] ?? null;

// ---------------------------------------------------------------------------
// buildSessionRecap — after-session recap (§6b)
// ---------------------------------------------------------------------------

/**
 * Aggregate a session's graded results into strengths / shaky / reviewAdded (§6b). Strength =
 * a passing grade; shaky = below passing. Deduped by label, capped so the recap stays scannable.
 * Empty input yields empty arrays (an honest "nothing graded yet", never fabricated feedback).
 */
export const buildSessionRecap = (results: SessionResult[]): SessionRecapModel => {
  const strengthSet = new Map<string, true>();
  const shakySet = new Map<string, true>();
  let reviewAdded = 0;

  for (const r of results) {
    const label = r.label ?? r.itemKey;
    if (r.grade >= config.srs.passingGrade) {
      // Only a strength if it wasn't also missed on another dimension this session.
      if (!shakySet.has(label)) strengthSet.set(label, true);
    } else {
      shakySet.set(label, true);
      strengthSet.delete(label);
    }
    if (r.addedToReview) reviewAdded += 1;
  }

  return {
    strengths: [...strengthSet.keys()].slice(0, config.coach.recapMaxChips),
    shaky: [...shakySet.keys()].slice(0, config.coach.recapMaxChips),
    reviewAdded,
  };
};

// ---------------------------------------------------------------------------
// buildWeeklyInsight — weekly insight (§6b)
// ---------------------------------------------------------------------------

/**
 * Compare the earliest vs latest snapshot per dimension to surface what improved, and pick the
 * currently-weakest dimensions as the next focus (§6b). Deterministic; tolerant of sparse history
 * (a single day yields no improvement deltas but still a next-focus from the latest snapshot).
 */
export const buildWeeklyInsight = (history: WeeklyHistoryEntry[]): WeeklyInsightModel => {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const improved: Array<{ dimension: ReviewDimension; delta: number }> = [];
  if (first && last && first !== last) {
    for (const dimension of REVIEW_DIMENSIONS) {
      const before = first.avgEaseByDimension[dimension];
      const after = last.avgEaseByDimension[dimension];
      if (before !== undefined && after !== undefined) {
        const delta = Math.round((after - before) * 100) / 100;
        if (delta > config.coach.weeklyImprovementThreshold) improved.push({ dimension, delta });
      }
    }
    improved.sort((a, b) => b.delta - a.delta);
  }

  // Next focus = weakest current dimensions (lowest average ease in the latest snapshot).
  const nextFocus: ReviewDimension[] = last
    ? [...REVIEW_DIMENSIONS]
        .filter((d) => last.avgEaseByDimension[d] !== undefined)
        .sort((a, b) => (last.avgEaseByDimension[a] ?? 0) - (last.avgEaseByDimension[b] ?? 0))
        .slice(0, config.coach.weeklyNextFocusCount)
    : [];

  const headline =
    improved.length > 0
      ? `Nice momentum — your ${improved[0].dimension} is noticeably stronger this week.`
      : sorted.length > 1
      ? 'Steady work this week. A focused push on your weakest area is your fastest win.'
      : 'Your weekly insight builds as you practice — keep the streak going.';

  return { improved, nextFocus, headline };
};
