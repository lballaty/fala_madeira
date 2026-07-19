// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/proficiency.ts
// Description: TB-1 (Option B) — the ONE shared write path for the learner's proficiency_level, so
//   the Settings "Your level" control and the client backfill-heal persist it identically (never
//   two divergent writers; REQUIREMENTS §5.5). setProficiencyLevel writes three places in lock-step:
//     (1) profiles.proficiency_level (DB source of truth, owner-RLS via .eq('id', userId)),
//     (2) the durable local OnboardingRecord.placementLevel mirror (offline/instant-read + the
//         backfill-heal source, §6/§7),
//     (3) the in-memory profile via setProfile (optimistic UI).
//   SEPARATION INVARIANT (§2): this writer touches ONLY proficiency_level — it NEVER reads, copies,
//   or writes unlocked_level or any paywall field. Every failure routes through src/lib/logger with
//   correlation IDs (observability doctrine); a DB failure is logged, never silent, and never throws
//   at the caller (best-effort, matching useOnboarding's discipline).
// Author: TB-1 Option B (proficiency_level)
// Created: 2026-07-19

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PracticalLevel } from '../../content/schema';
import type { UserProfile } from '../../types';
import { logger } from '../../lib/logger';
import { platform } from '../../platform';
import { coerceRecord, storageKeyFor } from './onboardingRecord';

export interface SetProficiencyLevelDeps {
  supabase: SupabaseClient | null;
  userId: string | null;
  level: PracticalLevel;
  /** Optimistic in-memory profile update (App threads the profile setter). */
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  /** Correlation id for tracing this write across the log surface. */
  correlationId?: string;
}

/**
 * Persist the learner's proficiency_level to the DB, the local mirror, and the in-memory profile.
 * Best-effort + fully logged; never throws. Returns true if the DB write succeeded (callers may
 * use this to gate a toast), false otherwise. NEVER touches unlocked_level (separation invariant).
 */
export const setProficiencyLevel = async ({
  supabase,
  userId,
  level,
  setProfile,
  correlationId,
}: SetProficiencyLevelDeps): Promise<boolean> => {
  // (3) Optimistic in-memory mirror first so the UI reflects the choice immediately.
  setProfile((prev) => (prev ? { ...prev, proficiency_level: level } : prev));

  if (!userId) return false;

  // (2) Durable local mirror: read-modify-write the OnboardingRecord's placementLevel so the
  // offline/instant-read value + the backfill-heal source stay in sync with the DB.
  try {
    const raw = await platform.storage.get<unknown>(storageKeyFor(userId));
    const record = coerceRecord(raw);
    await platform.storage.set(storageKeyFor(userId), { ...record, placementLevel: level });
  } catch (error) {
    logger.warn('PROFICIENCY_MIRROR_PERSIST_FAILED', 'could not update the local proficiency mirror — the DB write still stands', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
  }

  // (1) DB source of truth. Only proficiency_level — no paywall/unlocked_level field is referenced.
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ proficiency_level: level })
      .eq('id', userId);
    if (error) throw error;
    logger.info('PROFICIENCY_LEVEL_PERSISTED', 'proficiency level recorded on the profile', {
      category: 'USER_ACTION',
      correlationId,
      details: { proficiencyLevel: level },
    });
    return true;
  } catch (error) {
    logger.error('PROFICIENCY_LEVEL_PERSIST_FAILED', 'could not persist proficiency level to the profile', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
    return false;
  }
};
