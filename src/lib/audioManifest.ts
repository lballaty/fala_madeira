// File: src/lib/audioManifest.ts
// Description: EN-34 client generation resolver. Reads the SMALL set of build_keys whose hosted
//   generation is ≥ 2 (i.e. clips an admin regenerated via the audio panel) from
//   public.tts_audio_hosted and memoizes it for the session, so synthesizeCached can fold the
//   CURRENT generation into both the server object URL (keyToServerPath) and the device/pinned
//   cache key (deviceCacheKey) — busting every cache layer when a clip is re-recorded. Everything
//   NOT in the map is generation 1 (the default legacy unversioned name), so the query only ever
//   returns the handful of exceptions and stays tiny. Gated by config.audio.generationManifestEnabled
//   (VITE_AUDIO_GENERATION_MANIFEST): OFF ⇒ resolveGeneration() returns 1 for everything WITHOUT any
//   network read, so the feature is fully inert (behaviour identical to pre-EN-34) until the operator
//   activates it post-migration. Any failure / unconfigured client ⇒ empty map ⇒ all generation 1;
//   never throws (a manifest miss must never break playback — the clip still falls through the tiers).
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

import { getSupabase } from './supabase';
import { logger } from './logger';
import { config } from '../config';

/** Manifest table (migration 000NN_tts_audio_hosted.sql): build_key PK, generation int default 1. */
const TABLE = 'tts_audio_hosted';

// Session-memoized load: the first resolveGeneration() triggers one read; every later call reuses
// the resolved map (no per-play round-trip). A failed load memoizes an empty map, so a not-yet-
// applied table logs at most one WARN per session, never a query per play.
let cached: Promise<Map<string, number>> | null = null;

const load = async (): Promise<Map<string, number>> => {
  const map = new Map<string, number>();
  try {
    const supabase = getSupabase();
    if (!supabase) return map;
    // Only the exceptions: rows an admin regenerated (generation ≥ 2). Everything else defaults to 1.
    const { data, error } = await supabase
      .from(TABLE)
      .select('build_key, generation')
      .gte('generation', 2);
    if (error) {
      logger.warn('audio_manifest_read_failed', 'Hosted-generation manifest read failed; defaulting every clip to generation 1.', {
        category: 'DATA_PROCESSING',
        error,
      });
      return map;
    }
    for (const row of (data ?? []) as Array<{ build_key?: unknown; generation?: unknown }>) {
      const key = String(row.build_key ?? '');
      const gen = Math.floor(Number(row.generation));
      if (key && Number.isFinite(gen) && gen >= 2) map.set(key, gen);
    }
  } catch (err) {
    logger.warn('audio_manifest_threw', 'Hosted-generation manifest read threw; defaulting every clip to generation 1.', {
      category: 'DATA_PROCESSING',
      error: err,
    });
  }
  return map;
};

/** Lazily load + memoize the generation-≥2 manifest for the session (empty when the flag is off). */
export const loadGenerationManifest = (): Promise<Map<string, number>> => {
  if (!config.audio.generationManifestEnabled) return Promise.resolve(new Map());
  if (!cached) cached = load();
  return cached;
};

/**
 * Resolve the CURRENT hosted generation for a build key. Returns 1 (legacy) when the feature is
 * off, the key is unknown, or the manifest could not be read — so callers get the unversioned
 * object name + unsalted device key unless a regeneration is actually recorded and active.
 */
export const resolveGeneration = async (buildKey: string): Promise<number> => {
  if (!config.audio.generationManifestEnabled) return 1;
  const map = await loadGenerationManifest();
  return map.get(buildKey) ?? 1;
};

/**
 * Drop the memoized manifest so the next resolveGeneration() re-fetches. Called after an admin
 * regeneration lands (the panel bumps a generation) so the same session can pick up the new render
 * without a reload; also the seam a test uses to reset state between cases.
 */
export const invalidateGenerationManifest = (): void => {
  cached = null;
};
