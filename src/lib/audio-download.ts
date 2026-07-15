// File: src/lib/audio-download.ts
// Description: "Download track/level for offline" (CONTENT-ARCHITECTURE §10). Resolves the
//   Situations in scope via the content repository, enumerates every speakable text line and
//   its voice_type (dialogue lines carry per-speaker voice archetypes → MULTI-VOICE audio;
//   phrase patterns / vocabulary use the app-default tutor voice), and pre-generates each clip
//   through geminiService.synthesizeCached — the exact same bounded-LRU cache + cache key the
//   live playback path uses, so downloaded clips are transparently reused at play time.
//
//   ONLINE-ONLY: synthesis needs the TTS edge function. Callers must gate the UI on
//   connectivity and label the action clearly; this module refuses to run when offline and
//   returns a typed reason. Progress is reported via a {done,total} callback; cancellation is
//   cooperative (an AbortSignal checked between clips). Bounded by the cache byte budget — the
//   run stops early (status 'cache-full') and WARNs rather than thrashing the LRU, and by a
//   hard line cap (config.offline.maxDownloadLines) as a whole-catalog guard. Every failure is
//   logged through src/lib/logger with a correlation id; individual clip failures are counted
//   and the run continues (best-effort), never a silent failure.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { contentRepository, SituationFilter } from '../content/repository';
import { PracticalLevel } from '../content/schema';
import { AudioLine, linesForSituation } from '../content/lines';
import { resolveVoice } from './voiceType';
import { synthesizeCached } from '../services/geminiService';
import { audioCache, readCacheLimitBytes } from './audioCache';
import { logger } from './logger';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DownloadScope {
  /** Restrict to a single track (its situations, in curation order). */
  trackId?: string;
  /** Restrict to a single practical level (0–5). */
  level?: PracticalLevel;
  /**
   * EN-7: restrict to a SINGLE situation — the finest download unit. Downloading one
   * situation at a time keeps each run small so it completes/resumes instead of timing out
   * on a whole-level batch. Combined with per-clip retry below.
   */
  situationId?: string;
}

export interface DownloadProgress {
  /** Clips processed so far (synthesized + already-cached + failed). */
  done: number;
  /** Total clips planned for this run. */
  total: number;
}

export type DownloadStatus =
  | 'completed'   // every planned clip processed
  | 'cancelled'   // caller aborted mid-run
  | 'cache-full'  // stopped early: cache byte budget reached
  | 'offline'     // refused to start: no connection
  | 'empty';      // nothing in scope to download

export interface DownloadResult {
  status: DownloadStatus;
  /** Clips newly synthesized this run. */
  synthesized: number;
  /** Clips already present in the cache (skipped the network). */
  fromCache: number;
  /** Clips that failed to synthesize (logged individually; run continued). */
  failed: number;
  /** Total clips planned. */
  total: number;
}

export interface DownloadHandlers {
  onProgress?: (progress: DownloadProgress) => void;
  /** Cooperative cancellation — checked between clips. */
  signal?: AbortSignal;
}

// AudioLine + linesForSituation moved to ../content/lines (pure, shared with the Node pre-gen
// script and imported above). Only the orchestration helpers stay here.

const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

const isOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

/** Cooperative delay for EN-7 retry backoff. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Download orchestration
// ---------------------------------------------------------------------------

/**
 * Pre-generate multi-voice audio for every situation in `scope` into the bounded LRU cache.
 * Online-only; returns a typed status the caller surfaces (never throws for expected states
 * like offline / cancelled / cache-full — only genuinely unexpected repository errors bubble).
 */
export const downloadForOffline = async (
  scope: DownloadScope,
  handlers: DownloadHandlers = {},
): Promise<DownloadResult> => {
  const correlationId = newCorrelationId();
  const { onProgress, signal } = handlers;

  if (!isOnline()) {
    logger.warn('OFFLINE_DOWNLOAD_NO_CONNECTION', 'download-for-offline requested while offline — synthesis needs the network', {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { scope },
    });
    return { status: 'offline', synthesized: 0, fromCache: 0, failed: 0, total: 0 };
  }

  const filter: SituationFilter = { trackId: scope.trackId, level: scope.level, situationId: scope.situationId };
  const situations = await contentRepository.listSituations(filter);

  // Flatten every situation to its (deduplicated) audio lines, then apply the
  // whole-catalog guard cap.
  let plan: AudioLine[] = [];
  for (const situation of situations) plan.push(...linesForSituation(situation));
  const cap = config.offline.maxDownloadLines;
  if (plan.length > cap) {
    logger.warn('OFFLINE_DOWNLOAD_CAPPED', `download scope has ${plan.length} lines — capping at ${cap}`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { requested: plan.length, cap, scope },
    });
    plan = plan.slice(0, cap);
  }

  const total = plan.length;
  if (total === 0) {
    return { status: 'empty', synthesized: 0, fromCache: 0, failed: 0, total: 0 };
  }

  const cacheLimitBytes = readCacheLimitBytes();
  let synthesized = 0;
  let fromCache = 0;
  let failed = 0;
  let done = 0;
  let status: DownloadStatus = 'completed';

  logger.info('OFFLINE_DOWNLOAD_STARTED', `pre-generating ${total} clip(s) for offline`, {
    category: 'DATA_PROCESSING',
    correlationId,
    details: { total, scope, cacheLimitBytes },
  });
  onProgress?.({ done, total });

  for (const line of plan) {
    if (signal?.aborted) {
      status = 'cancelled';
      break;
    }

    // Stop before the cache is thrashed: if we are already at/over the byte budget,
    // further writes would only evict clips we just generated. Warn and stop.
    const usage = await audioCache.usage();
    if (usage.bytes >= cacheLimitBytes) {
      status = 'cache-full';
      logger.warn('OFFLINE_DOWNLOAD_CACHE_FULL', `cache byte budget reached (${usage.bytes}/${cacheLimitBytes}) — stopping download early`, {
        category: 'DATA_PROCESSING',
        correlationId,
        details: { usedBytes: usage.bytes, limitBytes: cacheLimitBytes, done, total },
      });
      break;
    }

    // Detect an already-cached clip (no network) vs a fresh synthesis for the counters. The key
    // MUST match what synthesizeCached will compute (resolveVoice), or downloaded clips look
    // uncached at play time and get re-synthesized — the EN-7 mismatch this normalization closes.
    const key = audioCache.buildKey('default', resolveVoice({ voiceType: line.voiceType }), line.text);
    const already = await audioCache.get(key);
    if (already) {
      fromCache += 1;
    } else {
      // EN-7 resilience: retry transient synthesis failures (429/503/network/timeout) with
      // exponential backoff so one flaky clip doesn't count as failed and a large run stops
      // failing wholesale. Bounded by config.offline.downloadMaxAttempts; aborts short-circuit.
      const maxAttempts = Math.max(1, config.offline.downloadMaxAttempts);
      for (let attempt = 1; ; attempt += 1) {
        try {
          await synthesizeCached(line.text, { voiceType: line.voiceType, hostable: true });
          synthesized += 1;
          break;
        } catch (error) {
          if (attempt >= maxAttempts || signal?.aborted) {
            failed += 1;
            logger.error('OFFLINE_DOWNLOAD_CLIP_FAILED', `failed to synthesize a clip after ${attempt} attempt(s) — continuing`, {
              category: 'AI_DECISION',
              correlationId,
              error,
              details: { textLength: line.text.length, voiceType: line.voiceType, attempts: attempt },
            });
            break;
          }
          const backoffMs = config.offline.downloadRetryBaseMs * 2 ** (attempt - 1);
          logger.warn('OFFLINE_DOWNLOAD_CLIP_RETRY', `clip synthesis failed (attempt ${attempt}/${maxAttempts}) — retrying in ${backoffMs}ms`, {
            category: 'AI_DECISION',
            correlationId,
            error,
            details: { attempt, maxAttempts, backoffMs },
          });
          await sleep(backoffMs);
        }
      }
    }

    done += 1;
    onProgress?.({ done, total });
  }

  logger.info('OFFLINE_DOWNLOAD_FINISHED', `offline download ${status} — ${synthesized} new, ${fromCache} cached, ${failed} failed of ${total}`, {
    category: 'DATA_PROCESSING',
    correlationId,
    details: { status, synthesized, fromCache, failed, total, done },
  });

  return { status, synthesized, fromCache, failed, total };
};
