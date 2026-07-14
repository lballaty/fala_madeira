// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/useOnboarding.ts
// Description: First-run onboarding gate + persistence (docs/CONTENT-ARCHITECTURE.md §5).
//   Owns the "has this user finished onboarding?" signal that App.tsx gates on, and the
//   commit path the flow calls on finish. Persistence seam (documented): the profiles table
//   (docs/DATABASE_DESIGN.md) has NO onboarding-complete or placement column — only the
//   consent flags has_accepted_terms / has_accepted_ai_usage. So this hook splits persistence:
//     - onboarding-complete flag + chosen placement level -> platform.storage, keyed per user
//       (`${config.onboarding.recordStorageKeyPrefix}${userId}`), a durable client mirror that
//       survives reload/offline. Promote to a profiles column later without touching the flow.
//     - path type (+ active track) -> usePathSelection (src/paths) — the DB is authoritative for
//       the active track (user_track_selection); the flow drives it directly, this hook does not.
//     - consent (terms + AI use) -> profiles.has_accepted_terms / has_accepted_ai_usage (the DB
//       source of truth), updated through the existing profile row + setProfile.
//   Every failure routes through the logger with correlation IDs; a storage/DB write failure is
//   logged, never silent, and the local completion still stands so the learner is not re-gated.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { PracticalLevel } from '../../content/schema';
import type { UserProfile } from '../../types';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { platform } from '../../platform';

/** Persisted per-user onboarding record (platform.storage). Consent lives on the profile row. */
export interface OnboardingRecord {
  /** True once the learner has finished the first-run flow (App.tsx gates on this). */
  complete: boolean;
  /** Placement level chosen at onboarding — a sensible starting point, never a lock (§5). */
  placementLevel: PracticalLevel;
  /** ISO timestamp the flow completed (diagnostics only). */
  completedAt: string | null;
}

const DEFAULT_RECORD: OnboardingRecord = {
  complete: false,
  placementLevel: 0,
  completedAt: null,
};

const isPracticalLevel = (value: unknown): value is PracticalLevel =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;

/** Structural guard for a record read back from platform.storage (tolerates corruption). */
const coerceRecord = (value: unknown): OnboardingRecord => {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_RECORD };
  const v = value as Record<string, unknown>;
  return {
    complete: v.complete === true,
    placementLevel: isPracticalLevel(v.placementLevel) ? v.placementLevel : DEFAULT_RECORD.placementLevel,
    completedAt: typeof v.completedAt === 'string' ? v.completedAt : null,
  };
};

const storageKeyFor = (userId: string): string => `${config.onboarding.recordStorageKeyPrefix}${userId}`;

interface OnboardingDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
}

/** What the flow hands back on finish (path type + track persist through usePathSelection). */
export interface OnboardingResult {
  placementLevel: PracticalLevel;
  acceptedTerms: boolean;
  acceptedAiUsage: boolean;
}

/**
 * The first-run onboarding gate. `isComplete` drives App.tsx's decision to show the flow
 * before the main tab shell; `isLoaded` prevents a flash of onboarding before the durable
 * record has been read. `complete()` commits placement + consent and flips the gate.
 */
export type OnboardingApi = ReturnType<typeof useOnboarding>;

export const useOnboarding = ({ supabase, user, profile, setProfile }: OnboardingDeps) => {
  const [record, setRecord] = useState<OnboardingRecord>(DEFAULT_RECORD);
  const [isLoaded, setIsLoaded] = useState(false);

  // Key hydration on the stable userId STRING, not the `user` object (TB-3): gotrue returns a NEW
  // user object on every TOKEN_REFRESHED (tab-focus / "switch pages and go back"). When this effect
  // depended on `user`, that churn re-ran it, toggled isLoaded, and remounted the lazy gate back to
  // step 1 ("Bem-vindo"). Keying on userId re-hydrates only on a real sign-in / user switch.
  const userId = user?.id ?? null;

  // Load the durable per-user record. Signed-out / no-user renders never gate on onboarding
  // (App.tsx already shows the auth screen), so we simply mark loaded with defaults.
  useEffect(() => {
    let cancelled = false;
    // No user (App.tsx shows the auth screen) — resolve to defaults on the next microtask so we
    // never call setState synchronously in the effect body (react-hooks/set-state-in-effect); the
    // resolved promise defers the update off the current render, same effect-safe shape as the
    // storage path below.
    if (!userId) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setRecord(DEFAULT_RECORD);
        setIsLoaded(true);
      });
      return () => {
        cancelled = true;
      };
    }
    // Mark not-loaded until this user's record resolves, so a freshly signed-in (or switched)
    // user is never gated on the previous user's defaults. Deferred to stay effect-safe.
    void Promise.resolve().then(() => {
      if (!cancelled) setIsLoaded(false);
    });
    void platform.storage
      .get<unknown>(storageKeyFor(userId))
      .then((raw) => {
        if (cancelled) return;
        setRecord(coerceRecord(raw));
        setIsLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.warn('ONBOARDING_RECORD_LOAD_FAILED', 'could not read the onboarding record — treating as first run', {
          category: 'DATA_PROCESSING',
          error,
        });
        setRecord(DEFAULT_RECORD);
        setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Persist consent to the profiles row (DB source of truth) and mirror onto the profile state. */
  const persistConsent = useCallback(
    async (result: OnboardingResult): Promise<void> => {
      if (!user) return;
      // Optimistic local mirror so the rest of the app sees consent immediately.
      if (profile) {
        setProfile({
          ...profile,
          has_accepted_terms: result.acceptedTerms,
          has_accepted_ai_usage: result.acceptedAiUsage,
        });
      }
      if (!supabase) return;
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            has_accepted_terms: result.acceptedTerms,
            has_accepted_ai_usage: result.acceptedAiUsage,
          })
          .eq('id', user.id);
        if (error) throw error;
        logger.info('ONBOARDING_CONSENT_PERSISTED', 'onboarding consent recorded on the profile', {
          category: 'SECURITY',
          details: { acceptedTerms: result.acceptedTerms, acceptedAiUsage: result.acceptedAiUsage },
        });
      } catch (error) {
        logger.error('ONBOARDING_CONSENT_PERSIST_FAILED', 'could not persist onboarding consent to the profile', {
          category: 'DATA_PROCESSING',
          error,
        });
      }
    },
    [profile, setProfile, supabase, user]
  );

  /**
   * Commit onboarding: record placement + completion (platform.storage) and consent (profile),
   * then flip the local gate so App.tsx renders the main shell. Best-effort durable — a storage
   * failure is logged, and completion still stands in memory so the learner is not re-gated.
   */
  const complete = useCallback(
    async (result: OnboardingResult): Promise<void> => {
      const next: OnboardingRecord = {
        complete: true,
        placementLevel: result.placementLevel,
        completedAt: new Date().toISOString(),
      };
      setRecord(next);

      await persistConsent(result);

      if (user) {
        try {
          await platform.storage.set(storageKeyFor(user.id), next);
        } catch (error) {
          logger.warn('ONBOARDING_RECORD_PERSIST_FAILED', 'could not persist the onboarding record — completion stands this session', {
            category: 'DATA_PROCESSING',
            error,
          });
        }
      }

      logger.info('ONBOARDING_COMPLETED', 'first-run onboarding completed', {
        category: 'USER_ACTION',
        details: { placementLevel: result.placementLevel },
      });
    },
    [persistConsent, user]
  );

  return {
    /** Gate signal for App.tsx: only show the flow to a signed-in, not-yet-onboarded user. */
    isComplete: record.complete,
    /** True once the durable record has been read (prevents a flash of onboarding). */
    isLoaded,
    /** The placement chosen previously (defaults to L0 for a fresh user). */
    placementLevel: record.placementLevel,
    complete,
  };
};
