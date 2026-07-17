// File: src/lib/timeTracking.ts
// Description: Pure, deterministic helpers for TB-17 — "time spent" was inflated because the session
//   counter ticked every WALL-CLOCK second with no pause on background/idle, and under-persisted
//   because the partial (sub-minute) tail was discarded on logout. These helpers decide whether a
//   given second counts as ACTIVE study time (visible tab AND interaction within the idle window),
//   and compute the unsynced tail to flush on logout. Kept pure so the gating/flush logic is
//   unit-tested without a DOM or React. The hook (src/hooks/useTimeTracking.ts) wires these to real
//   timers/listeners. NB: this is the CLIENT active-time fix only; the server-side additive write
//   (cross-device race, sync-queue.ts COUNTER SEAM) is HELD pending DB-migration approval.
// Author: TB-17 fix (with assistant)
// Created: 2026-07-17

/** Idle window: interaction more than this long ago means the user is idle → stop counting. */
export const IDLE_TIMEOUT_MS = 30_000;

/** One persisted increment is a whole minute of active seconds. */
export const SECONDS_PER_SYNC = 60;

export interface ActiveSecondInput {
  /** document.visibilityState at the tick ('visible' | 'hidden' | others treated as not visible). */
  visibilityState: string;
  /** now (ms epoch). */
  now: number;
  /** timestamp (ms epoch) of the last qualifying user activity, or null if none yet this session. */
  lastActivityAt: number | null;
  /** idle window in ms (defaults to IDLE_TIMEOUT_MS). */
  idleTimeoutMs?: number;
}

/**
 * Decide whether the current second is ACTIVE study time and should be counted.
 * Active = the tab is visible AND a qualifying interaction happened within the idle window.
 * A background/hidden tab never counts; a visible tab with no interaction for >= idleTimeoutMs
 * stops counting until the next interaction. Missing/never-seen activity does not count.
 */
export function shouldCountSecond({
  visibilityState,
  now,
  lastActivityAt,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
}: ActiveSecondInput): boolean {
  if (visibilityState !== 'visible') return false;
  if (lastActivityAt === null) return false;
  const sinceActivity = now - lastActivityAt;
  // Guard against clock skew / future timestamps: negative elapsed still counts as recent activity.
  if (sinceActivity < 0) return true;
  return sinceActivity < idleTimeoutMs;
}

/**
 * Seconds of active time accumulated this session that have NOT yet been persisted. The hook
 * persists in whole-minute increments (every SECONDS_PER_SYNC active seconds); this returns the
 * sub-minute tail that would otherwise be lost on logout/unmount. Clamped to >= 0.
 */
export function unsyncedSeconds(totalActiveSeconds: number, syncedSeconds: number): number {
  const tail = Math.floor(totalActiveSeconds) - Math.floor(syncedSeconds);
  return tail > 0 ? tail : 0;
}
