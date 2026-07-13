// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/simulator/progress.ts
// Description: Completion persistence for the Situation Simulator — upserts one row into
//   public.user_situation_progress (supabase/migrations/00006, PK user_id+situation_id+mode,
//   owner RLS) with mode 'simulator' and a score payload the Coach can read (§6b signals:
//   difficulty, turns, hint usage, stall count, scripted-vs-free variant). Best-effort by
//   design: a signed-out user or a network failure logs through src/lib/logger and returns
//   false — the conversation itself is never blocked on persistence.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { getSupabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

export interface SimulatorCompletion {
  situationId: string;
  status: 'completed';
  score: {
    difficulty: number;
    turns: number;
    /** 'scripted' = walked the authored roleplay graph; 'free' = AI roleplay over the tutor edge fn. */
    variant: 'scripted' | 'free';
    // COACH SIGNAL: hint reveals — how often the learner needed the option scaffold at L3+.
    hints: number;
    // COACH SIGNAL: stalls — turns where response latency exceeded simulatorConfig.stallLatencyMs.
    stalls: number;
  };
}

/**
 * Upsert the completion row. Returns true when the row is persisted, false when it
 * could not be (signed out, unconfigured, or write failure — all logged, never thrown).
 */
export async function saveSimulatorCompletion(completion: SimulatorCompletion): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    logger.warn('SIM_PROGRESS_UNCONFIGURED', 'Supabase client unavailable — simulator completion not persisted', {
      category: 'DATA_PROCESSING',
      details: { situationId: completion.situationId },
    });
    return false;
  }

  try {
    // LT9: local session read (no network) — auth.getUser() fails offline and dropped
    // simulator completions even with a valid persisted session.
    const { data: { session }, error: userError } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (userError || !user) {
      logger.warn('SIM_PROGRESS_NO_USER', 'no signed-in user — simulator completion not persisted', {
        category: 'DATA_PROCESSING',
        error: userError ?? undefined,
        details: { situationId: completion.situationId },
      });
      return false;
    }

    const { error } = await supabase.from('user_situation_progress').upsert(
      {
        user_id: user.id,
        situation_id: completion.situationId,
        mode: 'simulator',
        status: completion.status,
        score: completion.score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,situation_id,mode' },
    );
    if (error) throw error;

    logger.info('SIM_PROGRESS_SAVED', 'simulator completion persisted', {
      category: 'USER_ACTION',
      details: { situationId: completion.situationId, score: completion.score },
    });
    return true;
  } catch (error) {
    logger.error('SIM_PROGRESS_SAVE_FAILED', 'could not persist simulator completion', {
      category: 'DATA_PROCESSING',
      error,
      details: { situationId: completion.situationId, score: completion.score },
    });
    return false;
  }
}
