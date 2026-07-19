// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/access.test.ts
// Description: Unit tests for the EN-15 content-access gate (src/lib/access.ts). Truth table for
//   hasFullContentAccess across admin / unlimited / premium / free / null / undefined, and
//   canAccessLevel for full-access (any level, incl. beyond unlocked_level) vs free/premium
//   (gated at unlocked_level, default 1). Pure predicate — no mocks needed.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../types';
import { canAccessLevel, hasFullContentAccess, highestAccessibleMonth } from '../access';

// Minimal profile factory: only the three fields the gate reads matter here.
const profile = (over: Partial<UserProfile>): UserProfile =>
  ({
    id: 'u1',
    email: 'u1@example.com',
    streak: 0,
    xp: 0,
    unlocked_level: 1,
    completed_lessons: [],
    last_active: '',
    ...over,
  }) as UserProfile;

describe('hasFullContentAccess', () => {
  it('grants access to admins regardless of tier', () => {
    expect(hasFullContentAccess(profile({ role: 'admin', subscription_tier: 'free' }))).toBe(true);
    expect(hasFullContentAccess(profile({ role: 'admin', subscription_tier: 'unlimited' }))).toBe(true);
  });

  it('grants access to unlimited-tier users regardless of role', () => {
    expect(hasFullContentAccess(profile({ role: 'user', subscription_tier: 'unlimited' }))).toBe(true);
  });

  it('denies premium-tier users (only unlimited + admin bypass)', () => {
    expect(hasFullContentAccess(profile({ role: 'user', subscription_tier: 'premium' }))).toBe(false);
  });

  it('denies free-tier users', () => {
    expect(hasFullContentAccess(profile({ role: 'user', subscription_tier: 'free' }))).toBe(false);
  });

  it('denies when tier/role are unset (undefined fields)', () => {
    expect(hasFullContentAccess(profile({}))).toBe(false);
  });

  it('denies for null / undefined profile', () => {
    expect(hasFullContentAccess(null)).toBe(false);
    expect(hasFullContentAccess(undefined)).toBe(false);
  });
});

describe('canAccessLevel', () => {
  it('lets full-access (admin) users open ANY level, well beyond unlocked_level', () => {
    const admin = profile({ role: 'admin', unlocked_level: 1 });
    expect(canAccessLevel(admin, 1)).toBe(true);
    expect(canAccessLevel(admin, 6)).toBe(true);
    expect(canAccessLevel(admin, 999)).toBe(true);
  });

  it('lets full-access (unlimited) users open ANY level', () => {
    const unlimited = profile({ subscription_tier: 'unlimited', unlocked_level: 1 });
    expect(canAccessLevel(unlimited, 8)).toBe(true);
  });

  it('gates free users at their unlocked_level', () => {
    const free = profile({ subscription_tier: 'free', unlocked_level: 3 });
    expect(canAccessLevel(free, 1)).toBe(true);
    expect(canAccessLevel(free, 3)).toBe(true);
    expect(canAccessLevel(free, 4)).toBe(false);
  });

  it('gates premium users at their unlocked_level (premium is not a bypass)', () => {
    const premium = profile({ subscription_tier: 'premium', unlocked_level: 2 });
    expect(canAccessLevel(premium, 2)).toBe(true);
    expect(canAccessLevel(premium, 3)).toBe(false);
  });

  it('defaults a missing unlocked_level to 1 for non-full-access profiles', () => {
    const noLevel = profile({ subscription_tier: 'free', unlocked_level: undefined as unknown as number });
    expect(canAccessLevel(noLevel, 1)).toBe(true);
    expect(canAccessLevel(noLevel, 2)).toBe(false);
  });

  it('gates a null profile at level 1 (default)', () => {
    expect(canAccessLevel(null, 1)).toBe(true);
    expect(canAccessLevel(null, 2)).toBe(false);
  });
});

describe('highestAccessibleMonth (TB-1a §5.3.2 / R11)', () => {
  const MAX = 6;

  it('is unbounded (maxMonth) for full-access admin / unlimited profiles', () => {
    expect(highestAccessibleMonth(profile({ role: 'admin', unlocked_level: 1 }), MAX)).toBe(6);
    expect(highestAccessibleMonth(profile({ subscription_tier: 'unlimited', unlocked_level: 1 }), MAX)).toBe(6);
  });

  it('bounds a free user at their unlocked_level (the paywall progression)', () => {
    expect(highestAccessibleMonth(profile({ subscription_tier: 'free', unlocked_level: 1 }), MAX)).toBe(1);
    expect(highestAccessibleMonth(profile({ subscription_tier: 'free', unlocked_level: 3 }), MAX)).toBe(3);
  });

  it('never exceeds the authored ceiling even if unlocked_level runs ahead', () => {
    expect(highestAccessibleMonth(profile({ subscription_tier: 'free', unlocked_level: 99 }), MAX)).toBe(6);
  });

  it('defaults a missing unlocked_level / null profile to 1', () => {
    expect(highestAccessibleMonth(profile({ unlocked_level: undefined as unknown as number }), MAX)).toBe(1);
    expect(highestAccessibleMonth(null, MAX)).toBe(1);
  });
});
