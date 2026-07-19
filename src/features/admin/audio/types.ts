// File: src/features/admin/audio/types.ts
// Description: EN-23 admin audio-management panel types. The clip verdict vocabulary, the automated
//   per-clip quality signals (basic byte/type/duration + Web-Audio silence/loudness scoring), the
//   persisted review row and regeneration-queue row, and the composed row the panel renders (one
//   enumerated clip joined with its review + tier presence + signals).
// Author: claude-en23
// Created: 2026-07-17

import { PracticalLevel, VoiceType } from '../../../content/schema';

/** Owner-decided verdict vocabulary (2026-07-17): three-state + the implicit unreviewed default. */
export type AudioVerdict = 'good' | 'bad' | 're_record' | 'unreviewed';

/** Which storage tier currently holds a clip. 'unknown' = not yet probed. */
export type TierPresence = 'present' | 'missing' | 'unknown';

/**
 * Automated per-clip quality signals. Basic signals come from the blob itself; the silence/loudness
 * block comes from decoding the audio (Web Audio) — pulled forward from §8 per owner 2026-07-17.
 * All fields optional: a clip that has not been fetched/scored yet simply lacks them.
 */
export interface AudioSignals {
  bytes?: number;
  contentType?: string;
  durationMs?: number;
  /** Coarse loudness/silence scoring. */
  rmsDbfs?: number;
  peakDbfs?: number;
  /** Fraction of frames below the silence floor (0..1). */
  silentRatio?: number;
  /** Whole-clip near-silence. */
  silent?: boolean;
  /** Leading + trailing dead air in ms (truncation / dead-air heuristic). */
  deadAirMs?: number;
  /** Rolled-up triage flag: too-small / zero-duration / wrong content-type / silent / dead-air. */
  suspicious?: boolean;
  scoredAt?: string;
}

/** One enumerated clip in scope. buildKey is the cache/hosting key derived from (voice, text). */
export interface EnumeratedClip {
  buildKey: string;
  text: string;
  voice: string;
  voiceType?: VoiceType;
  situationId: string;
  level: PracticalLevel;
}

/** A persisted review row (public.tts_audio_review). */
export interface ReviewRow {
  build_key: string;
  voice: string;
  text: string;
  situation_id: string | null;
  level: number | null;
  verdict: AudioVerdict;
  signal_bytes: number | null;
  signal_content_type: string | null;
  signal_duration_ms: number | null;
  signal_suspicious: boolean;
  signal_rms_dbfs: number | null;
  signal_peak_dbfs: number | null;
  signal_silent_ratio: number | null;
  signal_silent: boolean;
  signal_dead_air_ms: number | null;
  signal_scored_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

/** A regeneration-queue row (public.tts_audio_regen_queue). */
export interface RegenQueueRow {
  id: string;
  build_key: string;
  voice: string;
  text: string;
  situation_id: string | null;
  level: number | null;
  reason: string | null;
  status: 'pending' | 'claimed' | 'done' | 'failed';
  enqueued_by: string | null;
  enqueued_at: string;
  claimed_at: string | null;
  completed_at: string | null;
}

/** The row the panel renders: an enumerated clip joined with its review, tier presence, signals. */
export interface AudioReviewItem extends EnumeratedClip {
  verdict: AudioVerdict;
  notes: string | null;
  deviceTier: TierPresence;
  serverTier: TierPresence;
  signals: AudioSignals;
  queued: boolean;
  /**
   * c2 (W5): the clip's CURRENT hosted generation, read from the tts_audio_hosted manifest (NOT the
   * flag-gated playback resolver). undefined/1 = the legacy unversioned object; ≥ 2 = a re-recorded
   * clip (hosted at `<base>.v<gen>.pcm`). Absent → treat as 1.
   */
  generation?: number;
}
