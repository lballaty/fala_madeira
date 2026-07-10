// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/auth/useAuth.ts
// Description: Auth-slice store hook extracted from App.tsx. Owns the Supabase session (user),
//   the user profile row, the auth-loading gate, and the auth screen mode. Runs the auth
//   bootstrap (getUser + onAuthStateChange) and profile fetch/create. Cross-slice work
//   (preference application, lesson fetches, logout cleanup) is injected through depsRef so
//   the App shell can wire slices without circular hook dependencies; depsRef is assigned
//   during every App render, before effects run.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { UserProfile } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { errorMessage, logger, userMessage } from '../../lib/logger';

export type AuthMode = 'login' | 'signup' | 'reset' | 'verifyOtp' | 'updatePassword' | 'none';

// Cross-slice callbacks the App shell provides. Assigned on every render so the
// closures always see fresh state (mirrors the original monolith's behavior).
export interface AuthCrossSliceDeps {
  getPrefsForNewProfile: () => { playbackSpeed: number; isSoundEnabled: boolean };
  applyProfilePrefs: (data: UserProfile) => void;
  fetchApprovedVideos: () => Promise<void>;
  fetchCustomLessons: (userId: string, userRole?: string) => Promise<void>;
  onLogoutCleanup: () => void;
}

interface AuthDeps {
  supabase: SupabaseClient | null;
  showToast: ShowToast;
  depsRef: React.MutableRefObject<AuthCrossSliceDeps | null>;
}

export const useAuth = ({ supabase, showToast, depsRef }: AuthDeps) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('none');

  const handleSupabaseError = (error: unknown, operation: string, path: string) => {
    const event = logger.error('supabase_error', `Supabase error in ${operation}`, {
      category: 'DATA_PROCESSING',
      error,
      details: { operation, path, userId: user?.id },
    });
    showToast(
      userMessage('SUPABASE_ERROR', errorMessage(error) || 'Database operation failed', event.request_id),
      'error'
    );
    return error;
  };

  const fetchProfile = async (userId: string) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const prefs = depsRef.current!.getPrefsForNewProfile();
          const newProfile: UserProfile = {
            id: userId,
            email: user?.email || '',
            streak: 0,
            xp: 0,
            unlocked_level: 1,
            completed_lessons: [],
            last_active: new Date().toISOString(),
            playback_speed: prefs.playbackSpeed,
            is_sound_enabled: prefs.isSoundEnabled
          };
          const { data: created, error: insertError } = await supabase.from('profiles').insert(newProfile).select().single();
          if (insertError) throw insertError;
          setProfile(created);
          return created;
        } else {
          throw error;
        }
      } else if (data) {
        setProfile(data);
        depsRef.current!.applyProfilePrefs(data);
        return data;
      }
    } catch (err) {
      handleSupabaseError(err, 'fetchProfile', 'profiles');
    }
    return null;
  };

  useEffect(() => {
    logger.debug('auth_bootstrap', 'App Supabase check', {
      category: 'SYSTEM_HEALTH',
      details: { hasSupabase: !!supabase, hasAuth: !!supabase?.auth },
    });
    if (!supabase) {
      logger.warn('auth_bootstrap', 'Supabase not configured, stopping auth check', { category: 'SYSTEM_HEALTH' });
      // Intentional synchronous bail-out: clears the auth-loading gate immediately when
      // Supabase is unconfigured (setup-guide path). Kept as-is to avoid behavior changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional bail-out
      setIsAuthLoading(false);
      return;
    }

    const checkUser = async () => {
      const timeout = setTimeout(() => {
        logger.warn('auth_check_timeout', 'Auth check timed out after 5s', { category: 'SYSTEM_HEALTH' });
        setIsAuthLoading(false);
      }, 5000);

      try {
        logger.debug('auth_check', 'Checking current user');
        const { data: { user } } = await supabase.auth.getUser();
        logger.debug('auth_check', 'Current user check result', { details: { userId: user?.id } });
        logger.setUser(user?.id ?? null);
        setUser(user);
        if (user) {
          const fetchedProfile = await fetchProfile(user.id);
          await depsRef.current!.fetchCustomLessons(user.id, fetchedProfile?.role);
        }
      } catch (err) {
        logger.error('auth_check_failed', 'Error in checkUser', { category: 'SECURITY', error: err });
      } finally {
        clearTimeout(timeout);
        setIsAuthLoading(false);
      }
    };

    depsRef.current!.fetchApprovedVideos();
    checkUser();

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.debug('auth_state_changed', `Auth state changed: ${event}`, {
        category: 'SECURITY',
        details: { event, userId: session?.user?.id },
      });

      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('updatePassword');
      }

      if (event === 'SIGNED_OUT') {
        logger.setUser(null);
        setUser(null);
        setProfile(null);
        setAuthMode('none');
        return;
      }

      const currentUser = session?.user || null;
      logger.setUser(currentUser?.id ?? null);
      setUser(currentUser);
      if (currentUser) {
        const fetchedProfile = await fetchProfile(currentUser.id);
        await depsRef.current!.fetchCustomLessons(currentUser.id, fetchedProfile?.role);
      } else {
        setProfile(null);
      }
    });

    return () => {
      if (data?.subscription) {
        logger.debug('auth_bootstrap', 'Unsubscribing from auth state changes');
        data.subscription.unsubscribe();
      }
    };
    // Intentional run-once auth bootstrap (getUser + onAuthStateChange subscription);
    // fresh closures are provided via depsRef, assigned on every render (see file header).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional run-once bootstrap
  }, []);

  const handleLogout = async () => {
    logger.info('logout_started', 'Initiating logout process', { category: 'USER_ACTION' });
    if (!supabase) {
      logger.error('logout_failed', 'Supabase client not available for logout', { category: 'SYSTEM_HEALTH' });
      return;
    }

    try {
      // Force local state clearing immediately for better UX
      setUser(null);
      setProfile(null);
      setAuthMode('none');
      depsRef.current!.onLogoutCleanup();

      // Attempt server-side sign out
      const { error } = await supabase.auth.signOut();
      if (error) {
        handleSupabaseError(error, 'handleLogout', 'auth');
      } else {
        showToast("Signed out successfully", "success");
      }

      logger.info('logout_completed', 'Logout process completed successfully', { category: 'USER_ACTION' });
    } catch (error) {
      const event = logger.critical('logout_failed', 'Critical logout error', { category: 'SECURITY', error });
      showToast(userMessage('LOGOUT_FAILED', 'Signed out with errors', event.request_id), 'error');
    }
  };

  return {
    user,
    profile,
    setProfile,
    isAuthLoading,
    authMode,
    setAuthMode,
    handleSupabaseError,
    handleLogout,
  };
};
