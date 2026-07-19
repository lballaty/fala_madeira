// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/session/usePathContext.ts
// Description: Assembles the read-only PathContext (src/paths/types.ts) the LearningPath policies
//   reason over: situations + tracks (content repository), the learner's completed-situation set
//   (user_situation_progress, any mode = done), and SRS mastery + dimensionSummary (useDueItems +
//   src/lib/srs). Shared by the Home path-aware CTA (which calls activePath.next()) and the daily
//   session (which calls adaptiveGuidedPath.sessionPlan()). Keeps src/paths pure/react-free: this
//   is the single react/data-wiring seam that feeds those pure policies. Best-effort loads log
//   through src/lib/logger and degrade to empty rather than blocking the UI (§5/§10).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { logger } from '../../lib/logger';
import { contentRepository } from '../../content/repository';
import { useDueItems } from '../../hooks/useDueItems';
import { dimensionSummary } from '../../lib/srs';
import type { Situation, Track, PracticalLevel } from '../../content/schema';
import type { PathContext } from '../../paths';

interface PathContextDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  placementLevel?: PracticalLevel;
}

/** Load the completed-situation set (any mode with status 'completed'). Best-effort. */
const loadCompletedSituationIds = async (
  supabase: SupabaseClient | null,
  user: User | null
): Promise<Set<string>> => {
  if (!supabase || !user) return new Set();
  try {
    const { data, error } = await supabase
      .from('user_situation_progress')
      .select('situation_id')
      .eq('user_id', user.id)
      .eq('status', 'completed');
    if (error) throw error;
    return new Set(((data ?? []) as { situation_id: string }[]).map((r) => r.situation_id));
  } catch (error) {
    logger.warn('PATH_CONTEXT_PROGRESS_LOAD_FAILED', 'could not load situation progress for path context', {
      category: 'DATA_PROCESSING',
      error,
    });
    return new Set();
  }
};

/**
 * Returns { context, isReady }. `context` is a PathContext snapshot (recomputed as content /
 * mastery load); `isReady` flips true once content has loaded at least once, so callers can
 * defer rendering a path CTA until the recommendation is meaningful.
 */
export const usePathContext = ({ supabase, user, placementLevel }: PathContextDeps) => {
  const { items: mastery } = useDueItems({ supabase, user });

  const [situations, setSituations] = useState<Situation[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(new Set());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      contentRepository.listSituations(),
      contentRepository.listTracks(),
      loadCompletedSituationIds(supabase, user),
    ])
      .then(([loadedSituations, loadedTracks, completed]) => {
        if (cancelled) return;
        setSituations(loadedSituations);
        setTracks(loadedTracks);
        setCompletedIds(completed);
        setIsReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        logger.error('PATH_CONTEXT_LOAD_FAILED', 'could not load content for path context', {
          category: 'DATA_PROCESSING',
          error,
        });
        setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  const context: PathContext = useMemo(() => {
    const now = new Date();
    return {
      situations,
      tracks,
      completedSituationIds: completedIds,
      // TB-1a/D1 (§5.4): null/unknown placement → 0 (complete beginner) — the honest,
      // non-skipping default. Previously hard-coded 1, which skipped unplaced learners ahead.
      placementLevel: placementLevel ?? 0,
      mastery,
      dimensionSummary: dimensionSummary(mastery, now),
      now,
    };
  }, [situations, tracks, completedIds, placementLevel, mastery]);

  return { context, isReady };
};
