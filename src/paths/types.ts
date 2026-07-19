// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/paths/types.ts
// Description: The sequencing POLICY layer (docs/CONTENT-ARCHITECTURE.md §5) — four path
//   types over ONE content base. Sequencing is independent of content (src/content) and modes
//   (src/features/practice engines): the SAME Situations/Packs are delivered through a chosen
//   LearningPath policy. Defines PathType (the four first-class paths), the LearningPath policy
//   interface every path implements (next / sessionPlan / describe / ordering helpers), and the
//   persisted PathSelection state (chosen path, active track, structured cursor). No path
//   hard-gates access — soft prerequisites only steer recommendations (§5/§12). This module is
//   DEPENDENCY-LIGHT: it imports only content schema types + srs types so the unit-tests step
//   can exercise the policies directly (no react/supabase imports here).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import type { Situation, Track, PracticalLevel } from '../content/schema';
import type { MasteryItem, DimensionSummary } from '../lib/srs';

// ---------------------------------------------------------------------------
// Path types (all first-class, §5)
// ---------------------------------------------------------------------------

/**
 * The four sequencing policies over the same content base (§5):
 *  - 'structured'      — Structured Course: month-by-month ordered calendar (RETAINED).
 *  - 'goal-track'      — Goal Track: the active track's situations ordered by level.
 *  - 'adaptive-guided' — Adaptive Guided: the ~30-min daily session composed from
 *                        placement + track + weaknesses + SRS-due (the tutor default).
 *  - 'free'            — Free / self-directed: no ordering, pass-through to anything.
 */
export const PATH_TYPES = ['structured', 'goal-track', 'adaptive-guided', 'free'] as const;
export type PathType = (typeof PATH_TYPES)[number];

/** Posture a path takes (§5): the app leads (tutor) vs the learner drives (tool). */
export type PathPosture = 'tutor' | 'tool';

// ---------------------------------------------------------------------------
// Persisted selection state
// ---------------------------------------------------------------------------

/**
 * The learner's persisted path choice (src/paths/index.ts persists it). Switchable
 * anytime; progress/mastery are shared across paths because all paths read the same
 * content + mastery model. The active track is authoritative in user_track_selection
 * (migration 00006); this mirror + the structured cursor persist alongside the chosen
 * path type so Home can render the right CTA before the DB round-trips.
 */
export interface PathSelection {
  type: PathType;
  /** Active goal-track id (Goal Track path; also seeds Adaptive Guided's track bias). */
  activeTrackId: string | null;
  /** Structured Course cursor — 1-based month/day the learner will continue from. */
  structuredMonth: number;
  structuredDay: number;
}

// ---------------------------------------------------------------------------
// Inputs a path policy reasons over
// ---------------------------------------------------------------------------

/**
 * The read-only content + progress snapshot a path policy consumes to decide ordering
 * and "what next". Assembled by the caller (usePathSelection / the daily-session view)
 * from the content repository, user_situation_progress, and the SRS engine — the policy
 * itself never touches the network, so it stays pure and unit-testable.
 */
export interface PathContext {
  /** All loaded situations (contentRepository.listSituations()). */
  situations: Situation[];
  /** All loaded tracks (contentRepository.listTracks()). */
  tracks: Track[];
  /** The learner's per-situation completion set (user_situation_progress, any mode done). */
  completedSituationIds: ReadonlySet<string>;
  /** Placement level (§5) — a sensible starting point; never a hard gate. */
  placementLevel: PracticalLevel;
  /**
   * TB-1a §5.3.2 (R11): the highest structured MONTH the learner can currently access, computed
   * by the WIRING layer (App / a pure selector) from the paywall predicate (src/lib/access.ts).
   * The structured policy clamps its placement-derived start DOWN to this so a placed learner is
   * not stranded on a paywalled CTA. This is a plain month number — the paths layer stays
   * paywall-blind (it never sees unlocked_level). Undefined ⇒ unbounded (no clamp).
   */
  structuredStartCeilingMonth?: number;
  /** SRS mastery rows (mastery_items) for weakness-aware selection. */
  mastery: MasteryItem[];
  /** Per-dimension rollup (srs.dimensionSummary) — the weakness signal (§6). */
  dimensionSummary: DimensionSummary;
  /** Reference time (determinism — passed in, never Date.now() inside a policy). */
  now: Date;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/**
 * One segment of the composed daily session (Adaptive Guided sessionPlan()). Sequences
 * straight into a practice engine: `engineId` is a registry.ts PracticeMode id, so the
 * DailySessionView routes it through the existing engine (reusing usePractice/registry).
 */
export interface SessionSegment {
  /** registry.ts PracticeMode.id the player routes this segment into. */
  engineId: string;
  /** Human label for the segment progress bar (from the config template). */
  label: string;
  /** Situation the segment practices (chosen by the composer); null = engine's default. */
  situationId: string | null;
  /** Target minutes for this segment (from the config template). */
  minutes: number;
}

/**
 * What a path recommends the learner do next — a single actionable step. `situationId`
 * + `engineId` route into a practice engine; `label` is the CTA text (e.g. "Continue
 * Day 19", "Start today's session"). `kind` lets Home pick the right CTA affordance.
 */
export interface NextAction {
  /**
   * `kind` lets Home pick the right CTA affordance and route the tap:
   *  - 'session'     → open the Adaptive Guided daily-session player.
   *  - 'situation'   → open situationId in engineId (a course/track step).
   *  - 'free'        → send the learner to the Practice hub to self-direct.
   *  - 'choose-goal' → Goal Track is selected but no specific goal is chosen yet
   *                    (TB-11b): Home must NOT masquerade as an arbitrary track — it
   *                    prompts the learner to pick a goal and the tap deep-links to the
   *                    Settings → Learning Path goal chooser.
   */
  kind: 'session' | 'situation' | 'free' | 'choose-goal';
  label: string;
  /** Situation to open (null for 'session' — the session composes its own). */
  situationId: string | null;
  /** Engine to open it in (null = let the hub/session decide). */
  engineId: string | null;
  /** Optional sub-label (e.g. "~30 min", the situation title). */
  detail?: string;
}

/** A human description of the path for Settings / onboarding surfaces. */
export interface PathDescription {
  type: PathType;
  title: string;
  tagline: string;
  posture: PathPosture;
}

// ---------------------------------------------------------------------------
// The policy interface every path implements
// ---------------------------------------------------------------------------

/**
 * A sequencing policy over the shared content base (§5). Implementations are pure given
 * a PathContext + PathSelection: no network, no react, deterministic on `now`. Ordering
 * is SOFT — `order()` returns a recommendation order, never a lock; every situation stays
 * openable regardless of position.
 */
export interface LearningPath {
  readonly type: PathType;

  /** Static description for Settings/onboarding. */
  describe(): PathDescription;

  /**
   * Recommendation ordering of the in-scope situations for this path (soft; §5). The
   * Structured Course orders by month/day, Goal Track by the active track then level,
   * Adaptive Guided by weakness+due, Free returns them unordered (pass-through).
   */
  order(context: PathContext, selection: PathSelection): Situation[];

  /** The single next action Home's CTA renders ("Continue Day N" / "Start today's session"). */
  next(context: PathContext, selection: PathSelection): NextAction;

  /**
   * Compose the ~30-min daily session (Adaptive Guided only; other paths return null so
   * the caller falls back to next()). Ordered SessionSegments the player sequences into
   * the existing engines. Durations/segments come from config.dailySession.template.
   */
  sessionPlan(context: PathContext, selection: PathSelection): SessionSegment[] | null;
}
