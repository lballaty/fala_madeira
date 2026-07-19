// File: src/features/admin/audio/audioServerTier.ts
// Description: EN-23 <-> EN-8 seam. The "is this clip hosted on the server?" tier check. EN-8
//   (server-hosted audio) shipped its config as config.audio.verpexBase (the static base the client
//   GETs pre-hosted clips from) + config.audio.supabaseAudioBucket (the public Storage buffer). This
//   module resolves those real keys, maps the build key to its object name with keyToServerPath()
//   (src/lib/audioKey.ts — the SAME name the pre-gen/write-back use), and probes Verpex then the
//   Supabase bucket exactly as runtime playback does (mirrors geminiService.fetchServerTier). The
//   server tier is "available" whenever a base is configured (verpexBase defaults to '/audio', so it
//   normally is) — the honest per-clip result is 'missing' until the operator populates the tier, NOT
//   a blanket "pending EN-8". EN-23b W1 fix: the previous build read a NONEXISTENT config.audio.serverBase
//   (so isServerTierAvailable was hardwired false and the panel showed "pending EN-8" forever, even
//   after EN-8 activation) and probed the raw build key instead of keyToServerPath. Author: claude-en23
//   (EN-23b W1 by claude-en23b). Created: 2026-07-17. Updated: 2026-07-19.

import { config } from '../../../config';
import { keyToServerPath } from '../../../lib/audioKey';
import { logger } from '../../../lib/logger';
import { publicObjectUrl } from '../../../lib/supabase';
import { TierPresence } from './types';

/**
 * The EN-8 Verpex base URL for hosted clips, or null when it is not configured. NO hardcoded
 * fallback — an empty/blank base means the Verpex tier is unavailable (surfaced honestly). In a
 * normal build verpexBase defaults to '/audio', so this returns '/audio'.
 */
export const resolveVerpexBase = (): string | null => {
  const base = config.audio.verpexBase?.trim();
  return base && base.length > 0 ? base.replace(/\/$/, '') : null;
};

/** The EN-8 Supabase public audio bucket name, or null when it is not configured. */
export const resolveSupabaseBucket = (): string | null => {
  const bucket = config.audio.supabaseAudioBucket?.trim();
  return bucket && bucket.length > 0 ? bucket : null;
};

/**
 * True when at least one server tier (Verpex or the Supabase bucket) has a configured base to probe.
 * This reflects the ACTUAL config — it is no longer hardwired false. When neither is configured the
 * panel honestly reports the server tier as unconfigured ("pending EN-8"); when a base exists the
 * per-clip probe reports the real present/missing state (a clip simply reads 'missing' until the
 * operator populates the tier).
 */
export const isServerTierAvailable = (): boolean =>
  resolveVerpexBase() !== null || resolveSupabaseBucket() !== null;

/** HEAD-probe a single hosted URL. 'present' on 2xx, 'missing' on 404, 'unknown' otherwise/on error. */
const probeUrl = async (url: string, buildKey: string, correlationId: string): Promise<TierPresence> => {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(config.audio.serverTierTimeoutMs) });
    if (res.ok) {
      // SPA hosts (Verpex .htaccess, `vite preview`) rewrite a MISS to the index.html shell WITH a
      // 200 — an HTML content-type is a MISS, not a hosted PCM clip. Mirrors geminiService.tryFetchPcm
      // so the admin panel never reads a false 'present' from the SPA fallback.
      if ((res.headers.get('content-type') ?? '').includes('text/html')) return 'missing';
      return 'present';
    }
    if (res.status === 404) return 'missing';
    logger.warn('EN23_SERVER_PRESENCE_UNEXPECTED', `unexpected status probing hosted clip: ${res.status}`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { buildKey, url, status: res.status },
    });
    return 'unknown';
  } catch (error) {
    logger.warn('EN23_SERVER_PRESENCE_FAILED', 'failed to probe hosted clip presence', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
      details: { buildKey, url },
    });
    return 'unknown';
  }
};

/**
 * Probe whether a clip is hosted on the EN-8 server tier. Mirrors geminiService.fetchServerTier's
 * lookup order (Verpex mirror first, then the Supabase public buffer) but with HEAD requests — the
 * object name is keyToServerPath(buildKey), the SAME name the writers use. Returns:
 *   - 'present' as soon as either tier has the object (2xx),
 *   - 'missing'  when every configured tier returns 404 (genuinely not hosted yet),
 *   - 'unknown'  when the tier is unconfigured or every probe errored (never a FALSE 'missing' that
 *                would mislead a regeneration decision).
 */
export const checkServerPresence = async (
  buildKey: string,
  correlationId: string,
): Promise<TierPresence> => {
  const verpexBase = resolveVerpexBase();
  const bucket = resolveSupabaseBucket();
  if (!verpexBase && !bucket) return 'unknown';

  const path = keyToServerPath(buildKey);
  let sawMissing = false;

  if (verpexBase) {
    const presence = await probeUrl(`${verpexBase}/${path}`, buildKey, correlationId);
    if (presence === 'present') return 'present';
    if (presence === 'missing') sawMissing = true;
  }

  if (bucket) {
    const supabaseUrl = publicObjectUrl(bucket, path);
    if (supabaseUrl) {
      const presence = await probeUrl(supabaseUrl, buildKey, correlationId);
      if (presence === 'present') return 'present';
      if (presence === 'missing') sawMissing = true;
    }
  }

  // 'missing' only when a configured tier positively reported 404; otherwise the probes errored →
  // 'unknown' (don't let a transient network failure read as "regenerate this clip").
  return sawMissing ? 'missing' : 'unknown';
};
