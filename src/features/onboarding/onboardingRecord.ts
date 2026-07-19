// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/onboardingRecord.ts
// Description: The durable per-user onboarding record (platform.storage) — its shape, defaults,
//   structural coercion guard, and the per-user storage key. Extracted from useOnboarding so the
//   shared proficiency writer (TB-1, proficiency.ts) and the onboarding hook read/write the SAME
//   local mirror without a circular import. Consent lives on the profiles row; this record holds
//   the first-run completion flag + the chosen placement level (the proficiency mirror + backfill
//   source, REQUIREMENTS §6/§7).
// Author: TB-1 Option B (proficiency_level)
// Created: 2026-07-19

import type { PracticalLevel } from '../../content/schema';
import { config } from '../../config';

/** Persisted per-user onboarding record (platform.storage). Consent lives on the profile row. */
export interface OnboardingRecord {
  /** True once the learner has finished the first-run flow (App.tsx gates on this). */
  complete: boolean;
  /** Placement level chosen at onboarding — a sensible starting point, never a lock (§5). */
  placementLevel: PracticalLevel;
  /** ISO timestamp the flow completed (diagnostics only). */
  completedAt: string | null;
}

export const DEFAULT_RECORD: OnboardingRecord = {
  complete: false,
  placementLevel: 0,
  completedAt: null,
};

export const isPracticalLevel = (value: unknown): value is PracticalLevel =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;

/** Structural guard for a record read back from platform.storage (tolerates corruption). */
export const coerceRecord = (value: unknown): OnboardingRecord => {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_RECORD };
  const v = value as Record<string, unknown>;
  return {
    complete: v.complete === true,
    placementLevel: isPracticalLevel(v.placementLevel) ? v.placementLevel : DEFAULT_RECORD.placementLevel,
    completedAt: typeof v.completedAt === 'string' ? v.completedAt : null,
  };
};

export const storageKeyFor = (userId: string): string => `${config.onboarding.recordStorageKeyPrefix}${userId}`;
