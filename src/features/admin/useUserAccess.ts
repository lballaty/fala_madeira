// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/useUserAccess.ts
// Description: Admin "grant content access" data hook (EN-15 §4). Searches users by PARTIAL email
//   (EN-26 — case-insensitive substring; an empty query browses all users, bounded), returns a
//   short list to pick from, then sets the chosen user's subscription_tier (and optionally
//   unlocked_level / per-user voice_limit) so the EN-15 content-access bypass grants that user all
//   levels ("grant all" = tier 'unlimited'). Admin SELECT + UPDATE of ANY profile is already
//   permitted by RLS (00001_initial_schema.sql:119/121), so this is a client-side admin write — no
//   service-role key. Every search + grant routes through src/lib/logger with correlation IDs
//   (structured audit: who searched/set what for whom) and handleSupabaseError; no bare console,
//   no swallowed errors, no hardcoded fallbacks.
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

/** The most matches a single search returns — bounds an empty/broad "browse all" query (EN-26). */
export const USER_SEARCH_LIMIT = 50;

export interface UserAccessState {
  target: AccessTarget | null;
  /** The current search matches to pick from (EN-26). Empty until a search runs; collapsed on select. */
  results: AccessTarget[];
  /** True when the last search hit the result cap (more users exist than are shown). */
  resultsTruncated: boolean;
  isLooking: boolean;
  isSaving: boolean;
  /**
   * Search profiles by PARTIAL email (case-insensitive substring). An empty query browses all users
   * (bounded to USER_SEARCH_LIMIT, ordered by email). Populates `results`; a single unambiguous match
   * is auto-selected as `target`, zero matches clears both. (EN-26)
   */
  searchUsers: (query: string) => Promise<void>;
  /** Choose one search result as the grant target (collapses the results list). */
  selectTarget: (user: AccessTarget) => void;
  /** Set the target's subscription tier (and optionally unlocked_level / per-user voice_limit) via an RLS-gated UPDATE. */
  grantAccess: (tier: SubscriptionTier, unlockedLevel?: number | null, voiceLimit?: number | null) => Promise<void>;
  /** Clear the current target + results (e.g. after a grant or when starting a new search). */
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
  const [results, setResults] = useState<AccessTarget[]>([]);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const [isLooking, setIsLooking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const clearTarget = useCallback(() => {
    setTarget(null);
    setResults([]);
    setResultsTruncated(false);
  }, []);

  const searchUsers = useCallback(
    async (query: string): Promise<void> => {
      const trimmed = query.trim();
      if (!supabase || !isAdmin) {
        const event = logger.error('ADMIN_ACCESS_NO_CLIENT', 'cannot search users: no client / not admin', {
          category: 'SECURITY',
          details: { hasClient: !!supabase, isAdmin },
        });
        showToast(userMessage('ADMIN_ACCESS_UNAVAILABLE', 'Not connected — cannot search users.', event.request_id), 'error');
        return;
      }

      const correlationId = newCorrelationId();
      setIsLooking(true);
      try {
        // Admin SELECT on any profile is granted by RLS (00001:119). PARTIAL, case-insensitive email
        // match: `%q%` is a substring match; an empty query yields `%%` → every user, bounded + ordered
        // (the "browse all users" affordance). One extra row over the cap tells us the list was cut.
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, subscription_tier, unlocked_level, voice_limit, role')
          .ilike('email', `%${trimmed}%`)
          .order('email', { ascending: true })
          .limit(USER_SEARCH_LIMIT + 1);
        if (error) throw error;

        const rows = (data ?? []) as AccessTarget[];
        const truncated = rows.length > USER_SEARCH_LIMIT;
        const shown = truncated ? rows.slice(0, USER_SEARCH_LIMIT) : rows;
        // Auto-select a single unambiguous match so the grant form appears directly (and collapse the
        // list, mirroring selectTarget); otherwise show the picklist with no target. A miss clears both.
        if (shown.length === 1) {
          setResults([]);
          setResultsTruncated(false);
          setTarget(shown[0]);
        } else {
          setResults(shown);
          setResultsTruncated(truncated);
          setTarget(null);
        }

        logger.info(shown.length ? 'ADMIN_ACCESS_SEARCH_HIT' : 'ADMIN_ACCESS_SEARCH_MISS', 'admin searched users by email', {
          category: 'USER_ACTION',
          correlationId,
          details: { actorId, query: trimmed, count: shown.length, truncated },
        });
        if (!shown.length) showToast('No users match that search.', 'error');
      } catch (error) {
        logger.error('ADMIN_ACCESS_SEARCH_FAILED', 'failed to search users by email', {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
          details: { actorId, query: trimmed },
        });
        handleSupabaseError(error, 'searchUsers', 'profiles');
      } finally {
        setIsLooking(false);
      }
    },
    [supabase, isAdmin, actorId, showToast, handleSupabaseError],
  );

  const selectTarget = useCallback(
    (user: AccessTarget): void => {
      setTarget(user);
      setResults([]);
      setResultsTruncated(false);
      logger.info('ADMIN_ACCESS_SELECT', 'admin selected a user to grant access', {
        category: 'USER_ACTION',
        details: { actorId, targetId: user.id, email: user.email },
      });
    },
    [actorId],
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

  return { target, results, resultsTruncated, isLooking, isSaving, searchUsers, selectTarget, grantAccess, clearTarget };
};
