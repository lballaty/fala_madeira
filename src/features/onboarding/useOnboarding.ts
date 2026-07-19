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
//   TB-7 / DF11: the gate ALSO reads the DB consent flags as a returning-user signal — consent is
//   the terminal onboarding step, so `has_accepted_terms && has_accepted_ai_usage` proves prior
//   completion even with no local record (new device / cleared storage). This is what stops the app
//   re-running the whole first-run flow (and re-asking Terms) on every login; a heal effect then
//   writes the local mirror so it never flashes again on that device. Full spec: docs/USER-WORKFLOWS-AND-STORIES.md.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { PracticalLevel } from '../../content/schema';
import type { UserProfile } from '../../types';
import { logger } from '../../lib/logger';
import { platform } from '../../platform';
import { DEFAULT_RECORD, coerceRecord, storageKeyFor } from './onboardingRecord';
import type { OnboardingRecord } from './onboardingRecord';

export type { OnboardingRecord } from './onboardingRecord';

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

  // Returning-user gate (TB-7 / DF11): the consent step is the TERMINAL onboarding step, so a
  // profile with BOTH consent flags set is proof onboarding was already completed — even on a
  // device with no local record (new device / cleared storage / private mode). Deriving the gate
  // from this DB signal is what stops the app re-running the whole first-run flow (and re-asking
  // Terms) on every login. On cold boot the profile is loaded before this gate renders
  // (useAuth.checkUser awaits fetchProfile); on post-login it lands a beat later (deferred), so a
  // new-device sign-in may briefly show the flow until the profile arrives — the heal effect below
  // then writes the local mirror so it never recurs on that device.
  const consentComplete =
    profile?.has_accepted_terms === true && profile?.has_accepted_ai_usage === true;

  // Heal the local mirror: once the DB tells us a user without a local record has already completed
  // onboarding, write the durable record so subsequent loads on THIS device are instant (no flash)
  // and downstream reads see completion. Functional update + guard so it settles after one heal and
  // never loops. Deferred set stays effect-safe (react-hooks/set-state-in-effect), matching the
  // load effect above.
  useEffect(() => {
    if (!userId || record.complete || !consentComplete) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setRecord((prev) => (prev.complete ? prev : { ...prev, complete: true }));
    });
    void platform.storage
      .set(storageKeyFor(userId), { ...record, complete: true })
      .catch((error) => {
        logger.warn('ONBOARDING_RECORD_HEAL_FAILED', 'could not heal the onboarding record from the profile consent signal', {
          category: 'DATA_PROCESSING',
          error,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, record, consentComplete]);

  /**
   * Persist consent AND the placement proficiency to the profiles row (DB source of truth) and
   * mirror both onto the profile state. TB-1 (Option B): placement is written to
   * profiles.proficiency_level in this SAME single profiles.update — a field wholly separate from
   * the paywall unlocked_level (separation invariant, REQUIREMENTS §2): this write NEVER touches
   * unlocked_level. Best-effort: a write failure is logged with correlation IDs and never re-gates
   * the learner (local completion still stands).
   */
  const persistConsent = useCallback(
    async (result: OnboardingResult): Promise<void> => {
      if (!user) return;
      // Optimistic local mirror so the rest of the app sees consent + proficiency immediately.
      if (profile) {
        setProfile({
          ...profile,
          has_accepted_terms: result.acceptedTerms,
          has_accepted_ai_usage: result.acceptedAiUsage,
          proficiency_level: result.placementLevel,
        });
      }
      if (!supabase) return;
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            has_accepted_terms: result.acceptedTerms,
            has_accepted_ai_usage: result.acceptedAiUsage,
            proficiency_level: result.placementLevel,
          })
          .eq('id', user.id);
        if (error) throw error;
        logger.info('ONBOARDING_CONSENT_PERSISTED', 'onboarding consent + placement proficiency recorded on the profile', {
          category: 'SECURITY',
          details: {
            acceptedTerms: result.acceptedTerms,
            acceptedAiUsage: result.acceptedAiUsage,
            proficiencyLevel: result.placementLevel,
          },
        });
      } catch (error) {
        logger.error('ONBOARDING_CONSENT_PERSIST_FAILED', 'could not persist onboarding consent + proficiency to the profile', {
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
    /**
     * Gate signal for App.tsx: only show the flow to a signed-in, not-yet-onboarded user.
     * True if the local record says complete OR the DB profile shows consent was already given
     * (TB-7): a returning user — on any device — skips the whole first-run flow, never re-consents.
     */
    isComplete: record.complete || consentComplete,
    /** True once the durable record has been read (prevents a flash of onboarding). */
    isLoaded,
    /** The placement chosen previously (defaults to L0 for a fresh user). */
    placementLevel: record.placementLevel,
    complete,
  };
};
