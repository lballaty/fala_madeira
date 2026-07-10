// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/paths/index.ts
// Description: Path-selection factory + persistence hook (docs/CONTENT-ARCHITECTURE.md §5). The
//   four LearningPath policies (structured / goal-track / adaptive-guided / free) over one content
//   base; getPath(type) resolves the policy, PATHS lists them for Settings/onboarding. usePathSelection()
//   owns the learner's chosen path + active track + structured cursor: persisted to platform.storage
//   (durable client mirror, survives reload/offline) AND — for the active track — to the
//   user_track_selection table (migration 00006, one-active-track via is_active). Switch anytime;
//   progress/mastery are SHARED across paths (all paths read the same content + mastery model, so
//   switching never resets anything). All writes route through logger with correlation IDs; a
//   storage/DB failure is logged, never silent, and the local choice still stands.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../lib/logger';
import { platform } from '../platform';
import { structuredCoursePath } from './structured-course';
import { goalTrackPath } from './goal-track';
import { adaptiveGuidedPath } from './adaptive-guided';
import { freePath } from './free';
import { PATH_TYPES, type LearningPath, type PathSelection, type PathType } from './types';

export * from './types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const PATH_BY_TYPE: Record<PathType, LearningPath> = {
  structured: structuredCoursePath,
  'goal-track': goalTrackPath,
  'adaptive-guided': adaptiveGuidedPath,
  free: freePath,
};

/** Resolve a LearningPath policy by its type (§5 four first-class paths). */
export const getPath = (type: PathType): LearningPath => PATH_BY_TYPE[type];

/** All paths in a stable order for Settings/onboarding surfaces. */
export const PATHS: LearningPath[] = PATH_TYPES.map((type) => PATH_BY_TYPE[type]);

// ---------------------------------------------------------------------------
// Persisted selection
// ---------------------------------------------------------------------------

const DEFAULT_SELECTION: PathSelection = {
  type: config.paths.defaultPathType as PathType,
  activeTrackId: null,
  structuredMonth: config.paths.structuredStartMonth,
  structuredDay: config.paths.structuredStartDay,
};

const isPathType = (value: unknown): value is PathType =>
  typeof value === 'string' && (PATH_TYPES as readonly string[]).includes(value);

/** Structural guard for a value read back from platform.storage. */
const coerceSelection = (value: unknown): PathSelection => {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SELECTION };
  const v = value as Record<string, unknown>;
  return {
    type: isPathType(v.type) ? v.type : DEFAULT_SELECTION.type,
    activeTrackId: typeof v.activeTrackId === 'string' ? v.activeTrackId : null,
    structuredMonth:
      typeof v.structuredMonth === 'number' && v.structuredMonth >= 1
        ? Math.floor(v.structuredMonth)
        : DEFAULT_SELECTION.structuredMonth,
    structuredDay:
      typeof v.structuredDay === 'number' && v.structuredDay >= 1
        ? Math.floor(v.structuredDay)
        : DEFAULT_SELECTION.structuredDay,
  };
};

interface PathSelectionDeps {
  supabase: SupabaseClient | null;
  user: User | null;
}

/**
 * The learner's persisted path choice + mutators. The chosen path type and structured cursor
 * persist to platform.storage (durable mirror); the active goal track additionally persists to
 * user_track_selection (one-active-track). Switching path/track is instant locally and best-effort
 * durable — progress/mastery are shared across paths so switching never resets learner state.
 */
export const usePathSelection = ({ supabase, user }: PathSelectionDeps) => {
  const [selection, setSelection] = useState<PathSelection>(DEFAULT_SELECTION);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load the durable local mirror, then reconcile the active track from the DB (authoritative
  // for the goal-track selection). State is only set inside promise callbacks (effect-safe).
  useEffect(() => {
    let cancelled = false;
    void platform.storage
      .get<unknown>(config.paths.selectionStorageKey)
      .then(async (raw) => {
        if (cancelled) return;
        let next = coerceSelection(raw);
        // The DB is the source of truth for which goal track is active (§5).
        if (supabase && user) {
          try {
            const { data, error } = await supabase
              .from('user_track_selection')
              .select('track_id')
              .eq('user_id', user.id)
              .eq('is_active', true)
              .maybeSingle();
            if (error) throw error;
            if (data?.track_id) next = { ...next, activeTrackId: data.track_id };
          } catch (error) {
            logger.warn('PATH_TRACK_LOAD_FAILED', 'could not load the active track selection — using the local mirror', {
              category: 'DATA_PROCESSING',
              error,
            });
          }
        }
        if (!cancelled) {
          setSelection(next);
          setIsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoaded(true); // storage read failed (already tolerated) — defaults stand
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  /** Persist the whole selection to the durable local mirror (best-effort; logged on failure). */
  const persistLocal = useCallback(async (next: PathSelection): Promise<void> => {
    try {
      await platform.storage.set(config.paths.selectionStorageKey, next);
    } catch (error) {
      logger.warn('PATH_SELECTION_PERSIST_FAILED', 'could not persist the path selection locally — choice stands in memory this session', {
        category: 'DATA_PROCESSING',
        error,
      });
    }
  }, []);

  /** Switch the active path type (§5 — switchable anytime, shared progress). */
  const setPathType = useCallback(
    (type: PathType): void => {
      setSelection((current) => {
        const next = { ...current, type };
        void persistLocal(next);
        logger.info('PATH_TYPE_CHANGED', `learning path switched to "${type}"`, {
          category: 'USER_ACTION',
          details: { type },
        });
        return next;
      });
    },
    [persistLocal]
  );

  /**
   * Set the active goal track (Goal Track path). Deactivates the current active row and
   * upserts the new one so user_track_selection keeps AT MOST ONE active track while
   * preserving switch history (the partial unique index enforces this).
   */
  const setActiveTrack = useCallback(
    async (trackId: string): Promise<void> => {
      setSelection((current) => {
        const next = { ...current, activeTrackId: trackId };
        void persistLocal(next);
        return next;
      });

      if (!supabase || !user) return;
      try {
        // Deactivate any currently-active row (switch = deactivate current, upsert new).
        const { error: deactivateError } = await supabase
          .from('user_track_selection')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('is_active', true)
          .neq('track_id', trackId);
        if (deactivateError) throw deactivateError;

        const { error: upsertError } = await supabase.from('user_track_selection').upsert(
          {
            user_id: user.id,
            track_id: trackId,
            is_active: true,
            selected_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,track_id' }
        );
        if (upsertError) throw upsertError;

        logger.info('PATH_TRACK_CHANGED', `active goal track set to "${trackId}"`, {
          category: 'USER_ACTION',
          details: { trackId },
        });
      } catch (error) {
        logger.error('PATH_TRACK_PERSIST_FAILED', 'could not persist the active track selection', {
          category: 'DATA_PROCESSING',
          error,
          details: { trackId },
        });
      }
    },
    [persistLocal, supabase, user]
  );

  /** Advance the Structured Course cursor (called after a course day is completed). */
  const setStructuredCursor = useCallback(
    (month: number, day: number): void => {
      setSelection((current) => {
        const next = { ...current, structuredMonth: month, structuredDay: day };
        void persistLocal(next);
        return next;
      });
    },
    [persistLocal]
  );

  /** The resolved policy for the current selection (Home/Settings ask it for next()/order()). */
  const activePath = getPath(selection.type);

  return {
    selection,
    isLoaded,
    activePath,
    setPathType,
    setActiveTrack,
    setStructuredCursor,
  };
};
