// File: src/features/admin/audio/ttsAudioReviewRepo.ts
// Description: EN-23 data-access for the admin audio panel. Supabase CRUD over public.tts_audio_review
//   (verdicts + automated signals) and public.tts_audio_regen_queue (clips flagged for regeneration).
//   Admin-RLS enforced server-side (migration 00014); the CLI consumer uses the service-role key.
//   Every failure routes through the canonical logger with a correlation id and returns a typed
//   result carrying a user-facing message + support Ref (userMessage) — no bare console, no silent
//   swallow, no hardcoded fallback. Author: claude-en23. Created: 2026-07-17.

import { SupabaseClient } from '@supabase/supabase-js';
import { logger, userMessage } from '../../../lib/logger';
import { AudioSignals, AudioVerdict, RegenQueueRow, ReviewRow } from './types';

const REVIEW_TABLE = 'tts_audio_review';
const QUEUE_TABLE = 'tts_audio_regen_queue';

export const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

/** Error surface with a code + user-facing message (Ref-carrying). Non-generic so it stays a clean
 *  discriminant when it forms the false branch of RepoResult<T> (a generic helper here would make T
 *  infer as unknown and break narrowing at the call sites). */
export type RepoError = { ok: false; code: string; message: string };

/** Typed result — ok payload, or an error surface. */
export type RepoResult<T> = { ok: true; data: T } | RepoError;

/** Explicit type guard. This project's tsconfig is non-strict (no strictNullChecks), so a bare
 *  `if (!r.ok)` does NOT narrow a discriminated union — callers must use this guard to reach the
 *  error fields safely. */
export const isRepoError = <T>(r: RepoResult<T>): r is RepoError => r.ok === false;

const noClient = (action: string, correlationId: string): RepoError => {
  const event = logger.error('EN23_REPO_NO_CLIENT', `cannot ${action}: no Supabase client`, {
    category: 'SYSTEM_HEALTH',
    correlationId,
    details: { action },
  });
  return {
    ok: false,
    code: 'EN23_REPO_UNAVAILABLE',
    message: userMessage('EN23_REPO_UNAVAILABLE', 'Not connected — cannot reach the audio review store.', event.request_id),
  };
};

const fail = (code: string, action: string, error: unknown, correlationId: string): RepoError => {
  const event = logger.error(code, `failed to ${action}`, {
    category: 'DATA_PROCESSING',
    correlationId,
    error,
  });
  return {
    ok: false,
    code,
    message: userMessage(code, `Could not ${action}.`, event.request_id),
  };
};

/** Fetch review rows for the given build keys (chunked to keep the IN list bounded). */
export const getReviews = async (
  supabase: SupabaseClient | null,
  buildKeys: string[],
  correlationId = newCorrelationId(),
): Promise<RepoResult<Record<string, ReviewRow>>> => {
  if (!supabase) return noClient('load audio reviews', correlationId);
  if (buildKeys.length === 0) return { ok: true, data: {} };
  try {
    const byKey: Record<string, ReviewRow> = {};
    const chunkSize = 200;
    for (let i = 0; i < buildKeys.length; i += chunkSize) {
      const chunk = buildKeys.slice(i, i + chunkSize);
      const { data, error } = await supabase.from(REVIEW_TABLE).select('*').in('build_key', chunk);
      if (error) return fail('EN23_REVIEW_LOAD_FAILED', 'load audio reviews', error, correlationId);
      for (const row of (data ?? []) as ReviewRow[]) byKey[row.build_key] = row;
    }
    return { ok: true, data: byKey };
  } catch (error) {
    return fail('EN23_REVIEW_LOAD_FAILED', 'load audio reviews', error, correlationId);
  }
};

export interface UpsertVerdictInput {
  build_key: string;
  voice: string;
  text: string;
  situation_id: string | null;
  level: number | null;
  verdict: AudioVerdict;
  notes?: string | null;
  reviewed_by: string | null;
  signals?: AudioSignals;
}

/** Upsert a verdict (+ optional signals) for a clip. build_key is the PK. */
export const upsertVerdict = async (
  supabase: SupabaseClient | null,
  input: UpsertVerdictInput,
  correlationId = newCorrelationId(),
): Promise<RepoResult<ReviewRow>> => {
  if (!supabase) return noClient('save the verdict', correlationId);
  try {
    const s = input.signals ?? {};
    const row = {
      build_key: input.build_key,
      voice: input.voice,
      text: input.text,
      situation_id: input.situation_id,
      level: input.level,
      verdict: input.verdict,
      notes: input.notes ?? null,
      reviewed_by: input.reviewed_by,
      reviewed_at: new Date().toISOString(),
      signal_bytes: s.bytes ?? null,
      signal_content_type: s.contentType ?? null,
      signal_duration_ms: s.durationMs ?? null,
      signal_suspicious: s.suspicious ?? false,
      signal_rms_dbfs: s.rmsDbfs ?? null,
      signal_peak_dbfs: s.peakDbfs ?? null,
      signal_silent_ratio: s.silentRatio ?? null,
      signal_silent: s.silent ?? false,
      signal_dead_air_ms: s.deadAirMs ?? null,
      signal_scored_at: s.scoredAt ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from(REVIEW_TABLE).upsert(row, { onConflict: 'build_key' }).select().single();
    if (error) return fail('EN23_VERDICT_SAVE_FAILED', 'save the verdict', error, correlationId);
    logger.info('EN23_VERDICT_SAVED', `verdict '${input.verdict}' saved`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { buildKey: input.build_key, verdict: input.verdict },
    });
    return { ok: true, data: data as ReviewRow };
  } catch (error) {
    return fail('EN23_VERDICT_SAVE_FAILED', 'save the verdict', error, correlationId);
  }
};

export interface EnqueueRegenInput {
  build_key: string;
  voice: string;
  text: string;
  situation_id: string | null;
  level: number | null;
  reason: string | null;
  enqueued_by: string | null;
}

/** Enqueue a clip for regeneration. The DB unique-live index prevents duplicate pending rows. */
export const enqueueRegen = async (
  supabase: SupabaseClient | null,
  input: EnqueueRegenInput,
  correlationId = newCorrelationId(),
): Promise<RepoResult<null>> => {
  if (!supabase) return noClient('enqueue for regeneration', correlationId);
  try {
    const { error } = await supabase.from(QUEUE_TABLE).insert({
      build_key: input.build_key,
      voice: input.voice,
      text: input.text,
      situation_id: input.situation_id,
      level: input.level,
      reason: input.reason,
      status: 'pending',
      enqueued_by: input.enqueued_by,
    });
    // 23505 = unique_violation → already queued (live pending/claimed row). Treat as success.
    if (error && (error as { code?: string }).code !== '23505') {
      return fail('EN23_ENQUEUE_FAILED', 'enqueue for regeneration', error, correlationId);
    }
    logger.info('EN23_ENQUEUED', 'clip enqueued for regeneration', {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { buildKey: input.build_key, alreadyQueued: !!error },
    });
    return { ok: true, data: null };
  } catch (error) {
    return fail('EN23_ENQUEUE_FAILED', 'enqueue for regeneration', error, correlationId);
  }
};

/** List regen-queue rows (default: live pending/claimed) so the panel can show what's queued. */
export const listRegenQueue = async (
  supabase: SupabaseClient | null,
  statuses: RegenQueueRow['status'][] = ['pending', 'claimed'],
  correlationId = newCorrelationId(),
): Promise<RepoResult<RegenQueueRow[]>> => {
  if (!supabase) return noClient('load the regeneration queue', correlationId);
  try {
    const { data, error } = await supabase.from(QUEUE_TABLE).select('*').in('status', statuses);
    if (error) return fail('EN23_QUEUE_LOAD_FAILED', 'load the regeneration queue', error, correlationId);
    return { ok: true, data: (data ?? []) as RegenQueueRow[] };
  } catch (error) {
    return fail('EN23_QUEUE_LOAD_FAILED', 'load the regeneration queue', error, correlationId);
  }
};
