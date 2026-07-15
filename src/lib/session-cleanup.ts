// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/session-cleanup.ts
// Description: SEC-2 logout cleanup for device-global client state that is NOT owned by a live
//   hook (which resets its own state) and would otherwise bleed to the next user on a shared
//   device. Clears: the write-only per-month lesson-content cache (localStorage
//   `active_lessons_month_*` — the user's custom lessons at rest) and two platform.storage KV
//   keys: the anonymous device-local missions list (`missions:log:local`, merged into every
//   listMissionLog) and the LEGACY non-namespaced path-selection mirror (superseded by the
//   per-user `paths:selection:${userId}` key). Best-effort + logged; never throws into logout.
//   NOTE: the TTS audio-blob cache is intentionally NOT cleared here — that is coordinated with
//   the other agent's active EN-8 work (pinned blob tier); see docs/SEC-2-USER-ISOLATION-FIX-PLAN.md WP4.
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { platform } from '../platform';
import { config } from '../config';
import { logger } from './logger';
import { MISSIONS_LOCAL_KEY } from '../features/practice/missions/missionsStore';

/** localStorage prefix for the write-only per-month lesson-content cache. */
const LESSON_CACHE_PREFIX = 'active_lessons_month_';

/**
 * Clear device-global, non-hook-owned client state on logout (SEC-2). Idempotent and safe to
 * call with no user signed in. Settings preferences are reset separately by useSettings
 * (resetForLogout), and per-user namespaced keys (paths:selection:${userId}, onboarding:record:
 * ${userId}, home:streak-freeze:${userId}) are already isolated so they are left intact.
 */
export const clearDeviceUserState = async (): Promise<void> => {
  // 1) Write-only lesson-content cache (localStorage, one key per activated month).
  try {
    if (typeof localStorage !== 'undefined') {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LESSON_CACHE_PREFIX)) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    }
  } catch (error) {
    logger.warn('SESSION_CLEANUP_LESSON_CACHE_FAILED', 'could not clear the local lesson cache on logout', {
      category: 'SECURITY',
      error,
    });
  }

  // 2) Anonymous device-local missions + the legacy non-namespaced path-selection mirror.
  const kvKeys = [MISSIONS_LOCAL_KEY, config.paths.selectionStorageKey];
  for (const key of kvKeys) {
    try {
      await platform.storage.delete(key);
    } catch (error) {
      logger.warn('SESSION_CLEANUP_KV_FAILED', 'could not clear a device-local store on logout', {
        category: 'SECURITY',
        error,
        details: { key },
      });
    }
  }
};
