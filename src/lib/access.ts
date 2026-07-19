// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/access.ts
// Description: Content-access gate predicates (EN-15). Mirrors the voice-limit bypass idea
//   (useTutorSession.ts: `subscription_tier !== 'unlimited' && role !== 'admin'`) for CONTENT:
//   `role === 'admin'` OR `subscription_tier === 'unlimited'` grants full access to every
//   authored month/level, so "grant all levels" = set a user's tier to 'unlimited' (admins get
//   it automatically). For everyone else, access stays gated on the paywall progression
//   (`profiles.unlocked_level`, advanced +1 per access-key entry). Pure module — no React, no
//   network — so it can back both the UI gate and the unit truth table.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import type { UserProfile } from '../types';

/** The subset of a profile the access gate reads (accepts a full UserProfile or null). */
type AccessProfile = Pick<UserProfile, 'role' | 'subscription_tier' | 'unlocked_level'>;

/**
 * Full-access bypass predicate (EN-15 R1). Returns true when the profile should skip the
 * content paywall entirely: admins (`role === 'admin'`) and unlimited-tier subscribers
 * (`subscription_tier === 'unlimited'`). Mirrors the existing voice-limit bypass so content
 * and voice honor the same admin/unlimited rule. `premium` and `free` do NOT bypass.
 *
 * @param profile The user's profile (or null/undefined when unauthenticated/unloaded).
 * @returns true if the profile has full content access, false otherwise.
 */
export const hasFullContentAccess = (profile: AccessProfile | null | undefined): boolean =>
  profile?.role === 'admin' || profile?.subscription_tier === 'unlimited';

/**
 * Content-access gate for a specific month/level (EN-15 R6). Full-access profiles
 * (admin / unlimited) can open ANY level via the `hasFullContentAccess` short-circuit;
 * everyone else is gated at their paywall progression `unlocked_level` (default 1 for a
 * fresh profile). No MAX_LEVEL literal is used — the bypass grants all authored content,
 * present and future, by short-circuiting rather than comparing against a ceiling.
 *
 * @param profile The user's profile (or null/undefined).
 * @param level The month/level being opened (1-based).
 * @returns true if the profile may access `level`, false if it is locked.
 */
export const canAccessLevel = (
  profile: AccessProfile | null | undefined,
  level: number,
): boolean => hasFullContentAccess(profile) || level <= (profile?.unlocked_level ?? 1);

/**
 * TB-1a §5.3.2 (R11): the highest structured MONTH the learner can currently access — a READ-ONLY,
 * side-effect-free query the FLOW layer uses to bound a placement-derived start DOWN to accessible
 * content (never up, never past the paywall). Full-access profiles (admin / unlimited) are unbounded
 * (the whole authored curriculum); everyone else is bounded at their paywall progression
 * `unlocked_level` (default 1 for a fresh profile). This does NOT mutate `unlocked_level`, open the
 * unlock modal, or re-route the flow — it only reports where the flow may safely begin. The paywall
 * still gates a later *open* if the learner scrolls ahead (§5.3.1).
 *
 * @param profile The user's profile (or null/undefined).
 * @param maxMonth The number of authored structured months (the unbounded ceiling; seed pack = 6).
 * @returns the highest month the profile may currently begin at.
 */
export const highestAccessibleMonth = (
  profile: AccessProfile | null | undefined,
  maxMonth: number,
): number =>
  hasFullContentAccess(profile) ? maxMonth : Math.min(profile?.unlocked_level ?? 1, maxMonth);
