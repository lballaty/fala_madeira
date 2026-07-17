// File: src/features/admin/audio/audioServerTier.ts
// Description: EN-23 <-> EN-8 seam. The "is this clip hosted on the server?" tier check. EN-8
//   (server-hosted audio) owns the hosted base URL + the hosting itself; that config is NOT on
//   develop yet (it lives on feat/en8-server-hosted-audio). This module feature-detects an optional
//   config.audio.serverBase: when absent it reports the server tier as unavailable ("pending EN-8")
//   rather than substituting a hardcoded URL (forbidden by the observability contract). When EN-8
//   lands and adds config.audio.serverBase, presence checks light up automatically — no other EN-23
//   code changes. Author: claude-en23. Created: 2026-07-17.

import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import { TierPresence } from './types';

/**
 * The EN-8 hosted-audio base URL, or null when EN-8 has not landed on this branch. NO hardcoded
 * fallback — a missing base means "server tier unknown", surfaced honestly to the admin.
 */
export const resolveServerBase = (): string | null => {
  const audio = config.audio as { serverBase?: string };
  const base = audio.serverBase?.trim();
  return base && base.length > 0 ? base.replace(/\/$/, '') : null;
};

/** True once EN-8's server-base config is present on this build. */
export const isServerTierAvailable = (): boolean => resolveServerBase() !== null;

/**
 * Probe whether a clip is hosted on the EN-8 server. Returns 'unknown' when the server tier is
 * unavailable (pending EN-8) or the probe fails — never a false 'missing' that would mislead a
 * regeneration decision. Uses a HEAD request; a 2xx means present.
 */
export const checkServerPresence = async (
  buildKey: string,
  correlationId: string,
): Promise<TierPresence> => {
  const base = resolveServerBase();
  if (!base) return 'unknown';
  const url = `${base}/${encodeURIComponent(buildKey)}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return 'present';
    if (res.status === 404) return 'missing';
    logger.warn('EN23_SERVER_PRESENCE_UNEXPECTED', `unexpected status probing hosted clip: ${res.status}`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { buildKey, status: res.status },
    });
    return 'unknown';
  } catch (error) {
    logger.warn('EN23_SERVER_PRESENCE_FAILED', 'failed to probe hosted clip presence', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
      details: { buildKey },
    });
    return 'unknown';
  }
};
