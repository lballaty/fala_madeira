// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/paths/goal-track.ts
// Description: Goal Track path (docs/CONTENT-ARCHITECTURE.md §5, path type 2) — the learner
//   picks a life-goal track (Survival / Host / Social / Bureaucracy / Work) and the app orders
//   THAT track's situations by practical level and recommends the next uncompleted one. The
//   active track lives in user_track_selection (migration 00006, one-active-track via is_active);
//   selection.activeTrackId is its client mirror. order() honors the track's curation order
//   within a level band (soft, never a gate — §5/§12); a situation may appear in several tracks
//   (many-to-many) so we scope to the active track's membership. sessionPlan() returns null.
//   Pure/deterministic — unit-tests-step friendly.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import type { Situation, Track } from '../content/schema';
import type {
  LearningPath,
  NextAction,
  PathContext,
  PathDescription,
  PathSelection,
  SessionSegment,
} from './types';

/**
 * The explicitly-chosen goal track, or null when the learner has not picked one yet.
 * We deliberately do NOT fall back to `tracks[0]` (TB-11b): a silent fallback made Goal
 * Track masquerade as the first seed track (literally named "Structured Course") on Home.
 * Callers must handle null honestly — order() passes through, next() prompts to pick a goal.
 */
const resolveActiveTrack = (context: PathContext, selection: PathSelection): Track | null => {
  if (selection.activeTrackId) {
    return context.tracks.find((t) => t.id === selection.activeTrackId) ?? null;
  }
  return null;
};

/**
 * Situations belonging to the active track, ordered by (1) practical level, then (2) the
 * track's own curation order (situation_ids index), then id. Soft ordering only (§5).
 */
const orderedTrackSituations = (context: PathContext, track: Track): Situation[] => {
  const curationIndex = new Map(track.situations.map((id, i) => [id, i]));
  const memberIds = new Set(track.situations);
  return context.situations
    .filter((s) => memberIds.has(s.id) || s.tracks.includes(track.id))
    .slice()
    .sort(
      (a, b) =>
        a.level - b.level ||
        (curationIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (curationIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id)
    );
};

export const goalTrackPath: LearningPath = {
  type: 'goal-track',

  describe(): PathDescription {
    return {
      type: 'goal-track',
      title: 'Goal track',
      tagline: 'Pick a life goal — the app orders that track by level.',
      posture: 'tool',
    };
  },

  order(context: PathContext, selection: PathSelection): Situation[] {
    const track = resolveActiveTrack(context, selection);
    if (!track) return context.situations.slice();
    const ordered = orderedTrackSituations(context, track);
    // Non-track situations trail after (soft; the learner can still reach them elsewhere).
    const inTrack = new Set(ordered.map((s) => s.id));
    const rest = context.situations.filter((s) => !inTrack.has(s.id));
    return [...ordered, ...rest];
  },

  next(context: PathContext, selection: PathSelection): NextAction {
    const track = resolveActiveTrack(context, selection);
    if (!track) {
      // Goal Track selected but no goal chosen yet (TB-11b). Do NOT default to a track —
      // prompt the learner and let Home deep-link to the Settings goal chooser.
      return {
        kind: 'choose-goal',
        label: 'Choose your goal',
        situationId: null,
        engineId: null,
        detail: 'Goal track · no goal chosen yet — pick a goal in Profile',
      };
    }
    const ordered = orderedTrackSituations(context, track);
    const uncompleted = ordered.filter((s) => !context.completedSituationIds.has(s.id));

    // TB-1a §4.3 (D-map): for a learner with NO resume signal (no completions yet), prefer the
    // first uncompleted track situation whose level >= placement — starting a placed learner
    // further into the track's level progression. SOFT: if none meet the bar (e.g. a high
    // placement in an all-low-level track) we fall back to the plain first-uncompleted, so a
    // real next step is always offered and nothing is hard-gated (§5/§12). A resume signal
    // (≥1 completion) makes the plain first-uncompleted win — placement is not consulted (R12).
    const isResume = context.completedSituationIds.size > 0;
    const atLevel = isResume
      ? undefined
      : uncompleted.find((s) => s.level >= context.placementLevel);
    const nextSituation = atLevel ?? uncompleted[0] ?? ordered[0] ?? null;

    if (!nextSituation) {
      return { kind: 'free', label: `Browse ${track.name}`, situationId: null, engineId: null };
    }
    return {
      kind: 'situation',
      label: 'Continue your track',
      situationId: nextSituation.id,
      engineId: 'listening',
      detail: `${track.name} · ${nextSituation.title}`,
    };
  },

  sessionPlan(): SessionSegment[] | null {
    return null;
  },
};
