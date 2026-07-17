// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/useUserAccess.ts
// Description: Admin "grant content access" data hook (EN-15 §4). Looks up a user by email and
//   sets their subscription_tier (and optionally unlocked_level) so the EN-15 content-access
//   bypass grants that user all levels ("grant all" = tier 'unlimited'). Admin SELECT + UPDATE
//   of ANY profile is already permitted by RLS (00001_initial_schema.sql:119/121), so this is a
//   client-side admin write — no service-role key. Every lookup + grant routes through
//   src/lib/logger with correlation IDs (structured audit: who set what for whom) and
//   handleSupabaseError; no bare console, no swallowed errors, no hardcoded fallbacks.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { useCallback, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ShowToast } from '../../hooks/useToast';
import { logger, userMessage, errorMessage } from '../../lib/logger';

/** A subscription tier the admin control can assign. */
export type SubscriptionTier = 'free' | 'premium' | 'unlimited';

/** The profile fields the access panel reads/writes for a looked-up target user. */
export interface AccessTarget {
  id: string;
  email: string;
  subscription_tier: SubscriptionTier | null;
  unlocked_level: number | null;
  voice_limit: number | null;
  role: 'user' | 'admin' | null;
}

interface UserAccessDeps {
  supabase: SupabaseClient | null;
  isAdmin: boolean;
  actorId: string | null;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
}

export interface UserAccessState {
  target: AccessTarget | null;
  isLooking: boolean;
  isSaving: boolean;
  /** Look up a profile by email (exact, case-insensitive). Clears the target on miss. */
  lookupByEmail: (email: string) => Promise<void>;
  /** Set the target's subscription tier (and optionally unlocked_level / per-user voice_limit) via an RLS-gated UPDATE. */
  grantAccess: (tier: SubscriptionTier, unlockedLevel?: number | null, voiceLimit?: number | null) => Promise<void>;
  /** Clear the current target (e.g. after a grant or when starting a new lookup). */
  clearTarget: () => void;
}

const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

export const useUserAccess = ({
  supabase,
  isAdmin,
  actorId,
  showToast,
  handleSupabaseError,
}: UserAccessDeps): UserAccessState => {
  const [target, setTarget] = useState<AccessTarget | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const clearTarget = useCallback(() => setTarget(null), []);

  const lookupByEmail = useCallback(
    async (email: string): Promise<void> => {
      const trimmed = email.trim();
      if (!trimmed) {
        showToast('Enter an email to look up.', 'error');
        return;
      }
      if (!supabase || !isAdmin) {
        const event = logger.error('ADMIN_ACCESS_NO_CLIENT', 'cannot look up user: no client / not admin', {
          category: 'SECURITY',
          details: { hasClient: !!supabase, isAdmin },
        });
        showToast(userMessage('ADMIN_ACCESS_UNAVAILABLE', 'Not connected — cannot look up user.', event.request_id), 'error');
        return;
      }

      const correlationId = newCorrelationId();
      setIsLooking(true);
      try {
        // Admin SELECT on any profile is granted by RLS (00001:119). ilike = case-insensitive exact.
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, subscription_tier, unlocked_level, voice_limit, role')
          .ilike('email', trimmed)
          .maybeSingle();
        if (error) throw error;

        if (!data) {
          setTarget(null);
          logger.info('ADMIN_ACCESS_LOOKUP_MISS', 'no profile matched the looked-up email', {
            category: 'USER_ACTION',
            correlationId,
            details: { actorId, email: trimmed },
          });
          showToast('No user found with that email.', 'error');
          return;
        }

        setTarget(data as AccessTarget);
        logger.info('ADMIN_ACCESS_LOOKUP_HIT', 'admin looked up a user profile by email', {
          category: 'USER_ACTION',
          correlationId,
          details: { actorId, targetId: (data as AccessTarget).id, email: trimmed },
        });
      } catch (error) {
        logger.error('ADMIN_ACCESS_LOOKUP_FAILED', 'failed to look up user by email', {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
          details: { actorId, email: trimmed },
        });
        handleSupabaseError(error, 'lookupByEmail', 'profiles');
      } finally {
        setIsLooking(false);
      }
    },
    [supabase, isAdmin, actorId, showToast, handleSupabaseError],
  );

  const grantAccess = useCallback(
    async (tier: SubscriptionTier, unlockedLevel?: number | null, voiceLimit?: number | null): Promise<void> => {
      if (!target) {
        showToast('Look up a user first.', 'error');
        return;
      }
      if (!supabase || !isAdmin) {
        const event = logger.error('ADMIN_ACCESS_NO_CLIENT', 'cannot grant access: no client / not admin', {
          category: 'SECURITY',
          details: { hasClient: !!supabase, isAdmin, targetId: target.id },
        });
        showToast(userMessage('ADMIN_ACCESS_UNAVAILABLE', 'Not connected — cannot save.', event.request_id), 'error');
        return;
      }

      const correlationId = newCorrelationId();
      const previous = {
        subscription_tier: target.subscription_tier,
        unlocked_level: target.unlocked_level,
        voice_limit: target.voice_limit,
      };
      const update: { subscription_tier: SubscriptionTier; unlocked_level?: number; voice_limit?: number | null } = {
        subscription_tier: tier,
      };
      if (typeof unlockedLevel === 'number' && Number.isFinite(unlockedLevel)) {
        update.unlocked_level = Math.max(1, Math.trunc(unlockedLevel));
      }
      if (voiceLimit !== undefined) {
        update.voice_limit = voiceLimit === null ? null : Math.max(0, Math.trunc(voiceLimit));
      }

      setIsSaving(true);
      try {
        // Admin UPDATE of any profile is granted by RLS (00001:121) — no service-role key needed.
        const { error } = await supabase.from('profiles').update(update).eq('id', target.id);
        if (error) throw error;

        setTarget((prev) => (prev ? { ...prev, ...update } : prev));
        // Structured audit: who set what for whom, with correlation IDs (EN-15 AC4).
        logger.info('ADMIN_ACCESS_GRANTED', `admin set access for ${target.email}`, {
          category: 'USER_ACTION',
          correlationId,
          details: {
            actorId,
            targetId: target.id,
            targetEmail: target.email,
            from: previous,
            to: update,
          },
        });
        showToast(`Access updated for ${target.email} → tier "${tier}".`, 'success');
      } catch (error) {
        logger.error('ADMIN_ACCESS_GRANT_FAILED', `failed to set access for ${target.email}`, {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
          details: { actorId, targetId: target.id, attempted: update },
        });
        showToast(errorMessage(error) || 'Could not update access.', 'error');
        handleSupabaseError(error, 'grantAccess', 'profiles');
      } finally {
        setIsSaving(false);
      }
    },
    [target, supabase, isAdmin, actorId, showToast, handleSupabaseError],
  );

  return { target, isLooking, isSaving, lookupByEmail, grantAccess, clearTarget };
};
