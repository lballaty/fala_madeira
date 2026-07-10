// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/paths/free.ts
// Description: Free / self-directed path (docs/CONTENT-ARCHITECTURE.md §5, path type 4) — the
//   pure TOOL posture. No ordering, no recommendation, no gate: order() is a pass-through of the
//   loaded situations (repository order preserved), and next() points at the Practice hub's free
//   situation browser rather than prescribing a step. Soft-prerequisite HINTS still exist on the
//   content (Situation.soft_prerequisites) and are surfaced advisory-only by the SituationPicker
//   — this path never consumes them as locks (§5/§12). sessionPlan() returns null. Trivially
//   pure/deterministic.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import type { Situation } from '../content/schema';
import type {
  LearningPath,
  NextAction,
  PathContext,
  PathDescription,
  SessionSegment,
} from './types';

export const freePath: LearningPath = {
  type: 'free',

  describe(): PathDescription {
    return {
      type: 'free',
      title: 'Free / self-directed',
      tagline: 'Pick any track, level, situation, or mode. You drive.',
      posture: 'tool',
    };
  },

  order(context: PathContext): Situation[] {
    // Pass-through: no policy ordering. The repository already returns a stable order
    // (and applies a track's curation order when the caller filters by track).
    return context.situations.slice();
  },

  next(): NextAction {
    // Free navigation entry point — the Practice hub's "Browse situations" surface owns
    // the actual picking; Home's CTA just routes there without prescribing content.
    return { kind: 'free', label: 'Browse situations', situationId: null, engineId: null };
  },

  sessionPlan(): SessionSegment[] | null {
    return null;
  },
};
