// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/attempts.ts
// Description: Attempt persistence for the Speaking Coach engine — inserts append-only rows
//   into public.pronunciation_attempts (migration 00006: id, user_id, item_key, score jsonb,
//   audio_ref, created_at; owner RLS insert WITH CHECK auth.uid() = user_id). Every result
//   also emits the Coach micro-signal (logger USER_ACTION — CONTENT-ARCHITECTURE §6b) even
//   when the DB write is skipped (signed out / unconfigured) so in-session feedback loops
//   never depend on network state. Failures log through src/lib/logger with correlation IDs;
//   callers get a status ('persisted' | 'skipped' | 'failed') to render honest UI.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { getSupabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

/** Which drill produced the attempt. */
export type SpeakingAttemptMode = 'repeat' | 'shadow' | 'compare' | 'speed';

/** Self-assessment verdicts for the no-STT / record-and-compare paths. */
export type SelfGrade = 'nailed' | 'close' | 'again';

/** score jsonb payload — {mode, accuracy?, selfGrade?, latencyMs?} per the engine contract. */
export interface SpeakingScore {
  mode: SpeakingAttemptMode;
  /** Normalized word accuracy 0..1 (recognition-scored drills). */
  accuracy?: number;
  /** Learner's own verdict (self-assessed drills). */
  selfGrade?: SelfGrade;
  /** Time-to-speech-start in ms (response-speed drill). */
  latencyMs?: number;
}

export type AttemptPersistStatus = 'persisted' | 'skipped' | 'failed';

/**
 * Record one pronunciation attempt: emit the Coach signal, then insert the
 * append-only row. Never throws — speaking practice must not break on a failed
 * write; the returned status lets views surface a quiet "not saved" note.
 */
export const recordPronunciationAttempt = async (
  itemKey: string,
  score: SpeakingScore
): Promise<AttemptPersistStatus> => {
  // COACH SIGNAL — micro-granularity result emission (CONTENT-ARCHITECTURE §6b):
  // every attempt feeds the Focus/Coach loop regardless of persistence outcome.
  logger.info('speaking_attempt_result', `Speaking attempt (${score.mode}) on "${itemKey}"`, {
    category: 'USER_ACTION',
    details: { itemKey, ...score },
  });

  const supabase = getSupabase();
  if (!supabase) {
    logger.warn('PRONUNCIATION_PERSIST_SKIPPED', 'Supabase client unavailable — pronunciation attempt not persisted', {
      category: 'DATA_PROCESSING',
      details: { itemKey, mode: score.mode },
    });
    return 'skipped';
  }

  try {
    // LT9: local session read (no network) — auth.getUser() fails offline and dropped
    // pronunciation attempts even with a valid persisted session.
    const { data, error: authError } = await supabase.auth.getSession();
    if (authError || !data.session?.user) {
      logger.warn('PRONUNCIATION_PERSIST_SKIPPED', 'No signed-in user — pronunciation attempt not persisted', {
        category: 'DATA_PROCESSING',
        details: { itemKey, mode: score.mode },
        error: authError ?? undefined,
      });
      return 'skipped';
    }

    // AUDIO UPLOAD SEAM: audio_ref stays null for now. When recording uploads land
    // (storage bucket + offline queue step), record-and-compare passes its captured
    // Blob here and audio_ref carries the storage path — the row shape already fits.
    const { error } = await supabase.from('pronunciation_attempts').insert({
      user_id: data.session.user.id,
      item_key: itemKey,
      score,
      audio_ref: null,
    });
    if (error) throw error;
    return 'persisted';
  } catch (err) {
    logger.error('PRONUNCIATION_PERSIST_FAILED', 'Failed to persist pronunciation attempt', {
      category: 'DATA_PROCESSING',
      error: err,
      details: { itemKey, mode: score.mode, table: 'pronunciation_attempts' },
    });
    return 'failed';
  }
};
