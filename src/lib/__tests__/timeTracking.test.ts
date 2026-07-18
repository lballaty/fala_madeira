// File: src/lib/__tests__/timeTracking.test.ts
// Description: Guards TB-17 — "time spent" inflated (counted background/idle wall-clock seconds) and
//   under-persisted (dropped the sub-minute tail on logout). Covers shouldCountSecond's visibility +
//   idle-window gating (including the boundary and clock-skew guard) and unsyncedSeconds' flush math.
// Author: TB-17 fix (with assistant)
// Created: 2026-07-17

import { describe, expect, it } from 'vitest';
import { IDLE_TIMEOUT_MS, shouldCountSecond, unsyncedSeconds } from '../timeTracking';

describe('shouldCountSecond (TB-17 active-time gating)', () => {
  const T = 1_000_000; // arbitrary fixed "now"

  it('does not count a hidden/background tab, even with recent activity', () => {
    expect(shouldCountSecond({ visibilityState: 'hidden', now: T, lastActivityAt: T })).toBe(false);
    expect(shouldCountSecond({ visibilityState: 'prerender', now: T, lastActivityAt: T })).toBe(false);
    expect(shouldCountSecond({ visibilityState: '', now: T, lastActivityAt: T })).toBe(false);
  });

  it('does not count before any interaction has happened this session', () => {
    expect(shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: null })).toBe(false);
  });

  it('counts a visible tab with interaction inside the idle window', () => {
    expect(shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: T })).toBe(true);
    expect(
      shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: T - (IDLE_TIMEOUT_MS - 1) }),
    ).toBe(true);
  });

  it('stops counting once idle for >= the idle window (inflation fix)', () => {
    // Exactly at the boundary is idle (half-open window: [0, idleTimeoutMs)).
    expect(
      shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: T - IDLE_TIMEOUT_MS }),
    ).toBe(false);
    expect(
      shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: T - (IDLE_TIMEOUT_MS + 5_000) }),
    ).toBe(false);
  });

  it('honours a custom idle window', () => {
    expect(
      shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: T - 5_000, idleTimeoutMs: 10_000 }),
    ).toBe(true);
    expect(
      shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: T - 15_000, idleTimeoutMs: 10_000 }),
    ).toBe(false);
  });

  it('treats a future activity timestamp (clock skew) as recent, not idle', () => {
    expect(shouldCountSecond({ visibilityState: 'visible', now: T, lastActivityAt: T + 5_000 })).toBe(true);
  });
});

describe('unsyncedSeconds (TB-17 partial-minute flush)', () => {
  it('returns the sub-minute tail not yet persisted', () => {
    expect(unsyncedSeconds(90, 60)).toBe(30); // synced 1 min, 30s tail pending
    expect(unsyncedSeconds(59, 0)).toBe(59); // never hit a minute boundary
    expect(unsyncedSeconds(125, 120)).toBe(5);
  });

  it('returns 0 when everything is already synced', () => {
    expect(unsyncedSeconds(60, 60)).toBe(0);
    expect(unsyncedSeconds(0, 0)).toBe(0);
  });

  it('never returns a negative tail (synced ahead / bad input)', () => {
    expect(unsyncedSeconds(60, 120)).toBe(0);
  });

  it('floors fractional inputs', () => {
    expect(unsyncedSeconds(90.9, 60.2)).toBe(30);
  });
});
