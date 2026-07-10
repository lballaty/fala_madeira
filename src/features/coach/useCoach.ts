// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/coach/useCoach.ts
// Description: React/data-wiring seam for the Coach (docs/CONTENT-ARCHITECTURE.md §6b). Assembles
//   the deterministic CoachSignals the pure engine (src/lib/coach.ts) reasons over — SRS mastery +
//   dimensionSummary (useDueItems), per-situation behavioral signals (situation titles/tracks from
//   the content repository + user_situation_progress avoidance/recency), and the active track — then
//   runs rankFocus() OFFLINE for an always-available ranked Focus list. Separately, narrateFocus()
//   is the ONLINE narrative-enhancement layer: it calls the error-analyst edge function via
//   geminiService and enriches the deterministic suggestions with recurring-pattern findings; on
//   ANY failure it silently keeps the templated offline output (never blocks, never empties the
//   list). Keeps src/lib/coach.ts pure/react-free: this is the single wiring seam feeding it.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { logger } from '../../lib/logger';
import { contentRepository } from '../../content/repository';
import { useDueItems } from '../../hooks/useDueItems';
import { dimensionSummary } from '../../lib/srs';
import {
  rankFocus,
  type CoachSignals,
  type FocusSuggestion,
  type SituationSignal,
} from '../../lib/coach';
import { geminiService } from '../../services/geminiService';
import type { Situation } from '../../content/schema';

interface CoachDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  /** The learner's active goal-track id (goal-relevance boost); null when none chosen. */
  activeTrackId: string | null;
}

/** One user_situation_progress row shape the coach reads (avoidance + recency signals). */
interface SituationProgressRow {
  situation_id: string;
  status: string | null;
  updated_at: string | null;
}

/**
 * Load per-situation behavioral signals: title/tracks from the content repository joined with the
 * learner's user_situation_progress (avoidance = status 'skipped'/'abandoned'; recency = updated_at;
 * completion = status 'completed'). Best-effort — a load failure logs and degrades to titles-only
 * (the coach still runs from mastery + dimensionSummary). Never throws.
 */
const loadSituationSignals = async (
  supabase: SupabaseClient | null,
  user: User | null,
  situations: Situation[]
): Promise<SituationSignal[]> => {
  const progressBySituation = new Map<string, SituationProgressRow>();
  if (supabase && user) {
    try {
      const { data, error } = await supabase
        .from('user_situation_progress')
        .select('situation_id, status, updated_at')
        .eq('user_id', user.id);
      if (error) throw error;
      for (const row of (data ?? []) as SituationProgressRow[]) {
        // Keep the most recent row per situation (any mode); updated_at drives recency.
        const existing = progressBySituation.get(row.situation_id);
        if (!existing || (row.updated_at ?? '') > (existing.updated_at ?? '')) {
          progressBySituation.set(row.situation_id, row);
        }
      }
    } catch (error) {
      logger.warn('COACH_PROGRESS_LOAD_FAILED', 'could not load situation progress for the coach — degrading to content-only signals', {
        category: 'DATA_PROCESSING',
        error,
      });
    }
  }

  return situations.map((situation) => {
    const progress = progressBySituation.get(situation.id);
    const status = progress?.status ?? null;
    return {
      situationId: situation.id,
      title: situation.title,
      tracks: situation.tracks,
      avoided: status === 'skipped' || status === 'abandoned',
      lastPracticedAt: progress?.updated_at ?? null,
      completed: status === 'completed',
    };
  });
};

/**
 * Returns { focus, isReady, isEnriching, narrateFocus }.
 *  - `focus`      — the deterministic ranked FocusSuggestion[] (always available, offline).
 *  - `isReady`    — true once content/signals have loaded at least once.
 *  - `narrateFocus()` — opt-in ONLINE enrichment: analyzes recent utterances via the error-analyst
 *                       edge function and merges its findings into the reasons; on any failure the
 *                       deterministic list is kept untouched (never blocks, never empties).
 */
export const useCoach = ({ supabase, user, activeTrackId }: CoachDeps) => {
  const { items: mastery } = useDueItems({ supabase, user });

  const [situationSignals, setSituationSignals] = useState<SituationSignal[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void contentRepository
      .listSituations()
      .then((situations) => loadSituationSignals(supabase, user, situations))
      .then((signals) => {
        if (cancelled) return;
        setSituationSignals(signals);
        setIsReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        logger.error('COACH_SIGNALS_LOAD_FAILED', 'could not assemble coach signals', {
          category: 'DATA_PROCESSING',
          error,
        });
        setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  const signals: CoachSignals = useMemo(() => {
    const now = new Date();
    return {
      dimensionSummary: dimensionSummary(mastery, now),
      mastery,
      situations: situationSignals,
      activeTrackId,
      now,
    };
  }, [mastery, situationSignals, activeTrackId]);

  // Deterministic, offline — always available.
  const focus: FocusSuggestion[] = useMemo(() => rankFocus(signals), [signals]);

  /**
   * ONLINE enrichment (§6b): run the error-analyst over recent learner utterances and fold its
   * calm summary in (surfaced via `aiSummary`). Graceful fallback: on any failure the templated
   * offline `focus` stands unchanged. Returns the summary string (or null on fallback) so a caller
   * can render it inline. Never throws.
   */
  const narrateFocus = useCallback(
    async (recentUtterances: string[]): Promise<string | null> => {
      if (!recentUtterances || recentUtterances.length === 0) return null;
      setIsEnriching(true);
      try {
        const result = await geminiService.analyzeErrors(recentUtterances);
        const summary = result.summary?.trim() || null;
        setAiSummary(summary);
        logger.info('COACH_NARRATE_OK', 'coach narrative enrichment applied', {
          category: 'AI_DECISION',
          details: { findings: result.findings.length },
        });
        return summary;
      } catch (error) {
        // Graceful fallback — keep the deterministic suggestions; do not surface an error to the
        // learner (the offline focus list is a complete, honest answer on its own).
        logger.warn('COACH_NARRATE_FALLBACK', 'error-analyst enrichment unavailable — using deterministic focus', {
          category: 'AI_DECISION',
          error,
        });
        setAiSummary(null);
        return null;
      } finally {
        setIsEnriching(false);
      }
    },
    []
  );

  return { focus, isReady, isEnriching, aiSummary, narrateFocus };
};
