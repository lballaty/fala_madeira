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
