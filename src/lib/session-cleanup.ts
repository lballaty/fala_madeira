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

// SEC-3: marker recording WHICH user's data currently populates this device. localStorage (sync, so
// it is safe to read inside the gotrue onAuthStateChange callback — no await). The auth slice uses it
// to detect a user SWITCH that skipped an explicit logout (reaching a login screen without signing
// out, or a session-expiry then a different login) and clear the outgoing user's on-device state
// BEFORE loading the new user — so the second user never inherits the first user's cached data.
const DEVICE_OWNER_KEY = 'fm:device-owner-uid';

/** The userId whose on-device data currently populates this device, or null if unknown/cleared. */
export const readDeviceOwner = (): string | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_OWNER_KEY) : null;
  } catch {
    return null;
  }
};

/** Record `userId` as the current on-device data owner (called after a sign-in settles this device). */
export const writeDeviceOwner = (userId: string): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DEVICE_OWNER_KEY, userId);
  } catch {
    /* best-effort — a missing marker only causes a redundant (harmless) cleanup on the next sign-in */
  }
};

/** Forget the on-device owner (called on an EXPLICIT logout, which already cleared the data). */
export const clearDeviceOwner = (): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(DEVICE_OWNER_KEY);
  } catch {
    /* best-effort */
  }
};

/**
 * SEC-3 decision (pure): should signing in as `newUserId` first clear this device's state? True only
 * when the device holds a DIFFERENT (non-null) user's data — a switch that skipped an explicit logout.
 * A null owner (fresh device / post-explicit-logout) or the same user (reload, token refresh) => false.
 */
export const isUserSwitch = (deviceOwner: string | null, newUserId: string): boolean =>
  deviceOwner !== null && deviceOwner !== newUserId;
