// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useDueItems.ts
// Description: Data hook for the adaptive review engine (docs/CONTENT-ARCHITECTURE.md §6/§6b).
//   Loads the current user's mastery_items rows (SM-2 substrate, migration 00006), exposes
//   due-item selection steered by dimension weights (src/lib/srs.ts), the per-dimension
//   dimensionSummary the Coach consumes, applyGrade (SM-2 transition + optimistic upsert),
//   and recordAvoidance (behavioral 'avoid' dimension: callers fire it when the learner
//   skips or abandons a situation — it lands as a grade-0-like signal). All writes route
//   through the single persistMastery() seam so the offline-sync-queue step can wrap it.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { logger } from '../lib/logger';
import { enqueue } from '../lib/sync-queue';
import { config } from '../config';
import {
  DimensionSummary,
  DimensionWeights,
  MasteryItem,
  Sm2Grade,
  dimensionSummary,
  gradeItem,
  initialMasteryState,
  selectDueItems,
} from '../lib/srs';
import type { ReviewDimension } from '../content/schema';

/** mastery_items row shape as read/written (user_id added on write). */
interface MasteryRow {
  item_key: string;
  dimension: ReviewDimension;
  ease: number;
  interval_days: number;
  repetitions: number;
  next_review: string | null;
  last_grade: number | null;
}

const rowToItem = (row: MasteryRow): MasteryItem => ({
  itemKey: row.item_key,
  dimension: row.dimension,
  ease: row.ease,
  intervalDays: row.interval_days,
  repetitions: row.repetitions,
  nextReview: row.next_review,
  lastGrade: row.last_grade,
});

const itemToRow = (userId: string, item: MasteryItem): MasteryRow & { user_id: string } => ({
  user_id: userId,
  item_key: item.itemKey,
  dimension: item.dimension,
  ease: item.ease,
  interval_days: item.intervalDays,
  repetitions: item.repetitions,
  next_review: item.nextReview,
  last_grade: item.lastGrade,
});

/**
 * OFFLINE SEAM — single persistence chokepoint for mastery writes, now routed through
 * the durable offline write queue (src/lib/sync-queue.ts, CONTENT-ARCHITECTURE §10).
 * Write-through, last-write-wins by clientTs: every grade is enqueued durably (survives
 * reload / offline) keyed on (user_id,item_key,dimension) so a later grade for the same
 * item supersedes an unsynced earlier one. The queue drains to Supabase immediately when
 * online and on reconnect. Because the write is now durably queued, this never throws —
 * the caller keeps its optimistic local state (no rollback) and the queue owns retry.
 * All mastery writes MUST stay routed through this seam — do not add direct
 * .from('mastery_items') writes elsewhere.
 */
const persistMastery = async (
  _supabase: SupabaseClient,
  userId: string,
  item: MasteryItem
): Promise<void> => {
  await enqueue({
    table: 'mastery_items',
    op: 'upsert',
    payload: { ...itemToRow(userId, item) },
    onConflict: 'user_id,item_key,dimension',
    key: `${userId}:${item.itemKey}:${item.dimension}`,
  });
};

interface DueItemsDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  /** Max items in dueItems. Defaults to config.srs.defaultDueLimit. */
  limit?: number;
  /** Per-dimension steering weights (Coach/daily session target 'hear', 'say', …). */
  dimensionWeights?: DimensionWeights;
}

export const useDueItems = ({ supabase, user, limit, dimensionWeights }: DueItemsDeps) => {
  const [items, setItems] = useState<MasteryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Pure fetch: returns the user's mastery rows ([] when signed out) or null on failure
   * (already logged) — no setState here, so the effect below can stay compliant with
   * react-hooks/set-state-in-effect by updating state only inside promise callbacks.
   */
  const loadMasteryItems = useCallback(async (): Promise<MasteryItem[] | null> => {
    if (!supabase || !user) return [];
    try {
      const { data, error } = await supabase
        .from('mastery_items')
        .select('item_key, dimension, ease, interval_days, repetitions, next_review, last_grade')
        .eq('user_id', user.id);
      if (error) throw error;
      return ((data ?? []) as MasteryRow[]).map(rowToItem);
    } catch (err) {
      logger.error('SRS_FETCH_FAILED', 'Failed to load mastery items', {
        category: 'DATA_PROCESSING',
        error: err,
        details: { table: 'mastery_items' },
      });
      return null;
    }
  }, [supabase, user]);

  /** Manual re-fetch for callers (e.g. after a bulk seed); keeps items on fetch failure. */
  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    const rows = await loadMasteryItems();
    if (rows) setItems(rows);
    setIsLoading(false);
  }, [loadMasteryItems]);

  // Initial load + reload on user change. State updates live in promise callbacks only.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setIsLoading(true);
        return loadMasteryItems();
      })
      .then(rows => {
        if (cancelled) return;
        if (rows) setItems(rows);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadMasteryItems]);

  /**
   * Apply an SM-2 grade to one (itemKey, dimension) pair: optimistic local update,
   * then upsert via the persistMastery seam. On persistence failure the optimistic
   * entry is rolled back to its previous state and the failure is logged.
   */
  const applyGrade = useCallback(
    async (itemKey: string, dimension: ReviewDimension, grade: Sm2Grade): Promise<void> => {
      if (!supabase || !user) {
        logger.warn('SRS_GRADE_SKIPPED', 'applyGrade called without supabase/user', {
          category: 'DATA_PROCESSING',
          details: { itemKey, dimension, grade },
        });
        return;
      }

      const previous = items.find(i => i.itemKey === itemKey && i.dimension === dimension);
      const next: MasteryItem = {
        itemKey,
        dimension,
        ...gradeItem(previous ?? initialMasteryState(), grade, new Date()),
      };

      // Optimistic: replace (or insert) the graded entry locally before the write lands.
      setItems(current => [
        ...current.filter(i => !(i.itemKey === itemKey && i.dimension === dimension)),
        next,
      ]);

      try {
        await persistMastery(supabase, user.id, next);
      } catch (err) {
        // Roll back just this entry (restore previous row, or drop the inserted one).
        setItems(current => {
          const rest = current.filter(i => !(i.itemKey === itemKey && i.dimension === dimension));
          return previous ? [...rest, previous] : rest;
        });
        logger.error('SRS_PERSIST_FAILED', 'Failed to persist mastery grade', {
          category: 'DATA_PROCESSING',
          error: err,
          details: { itemKey, dimension, grade },
        });
      }
    },
    [supabase, user, items]
  );

  /**
   * Behavioral 'avoid' dimension (§6): callers fire this when the learner skips or
   * abandons a situation. Lands as a grade-0-like signal on the avoid-dimension row,
   * so avoided content surfaces as weak/due for the Coach and review selection.
   */
  const recordAvoidance = useCallback(
    (itemKey: string): Promise<void> =>
      applyGrade(itemKey, 'avoid', config.srs.avoidanceGrade as Sm2Grade),
    [applyGrade]
  );

  const dueItems = useMemo(
    () => selectDueItems(items, { limit, now: new Date(), dimensionWeights }),
    [items, limit, dimensionWeights]
  );

  const summary: DimensionSummary = useMemo(() => dimensionSummary(items, new Date()), [items]);

  return { items, dueItems, summary, isLoading, refresh, applyGrade, recordAvoidance };
};
