// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useTimeTracking.ts
// Description: Session time-tracking hook extracted from App.tsx. TB-17 fix: it now measures ACTIVE
//   study time (visible tab AND interaction within a 30s idle window) instead of raw wall-clock
//   seconds — a backgrounded/idle tab no longer inflates the total — and flushes the sub-minute tail
//   to profiles.total_time_spent on logout instead of discarding it. Persists in whole-minute
//   additive increments. resetTimeTracking is called by the auth slice on logout. The active-second
//   and flush math live as pure helpers in src/lib/timeTracking.ts (unit-tested). NB: this is the
//   CLIENT fix only; the server-side additive write (cross-device last-writer-wins race, see
//   sync-queue.ts COUNTER SEAM) is HELD pending DB-migration approval.
// Author: Libor Ballaty (with assistant); TB-17 active-time fix 2026-07-17
// Created: 2026-07-09

import { useEffect, useRef, useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { UserProfile } from '../types';
import { SECONDS_PER_SYNC, shouldCountSecond, unsyncedSeconds } from '../lib/timeTracking';

interface TimeTrackingDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
}

/** DOM events that reset the idle timer (a real user doing something). */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;

export const useTimeTracking = ({ supabase, user, profile, setProfile, handleSupabaseError }: TimeTrackingDeps) => {
  // Active study seconds this session (NOT wall-clock — only counts while visible + interacting).
  const [totalTimeInSeconds, setTotalTimeInSeconds] = useState(0);
  // Timestamp (ms epoch) of the last qualifying activity; null until the first interaction.
  const lastActivityRef = useRef<number | null>(null);
  // How many active seconds have already been persisted (whole minutes) — used to flush the tail.
  const syncedSecondsRef = useRef(0);

  // Track user activity + tab visibility so the tick can tell active time from idle/background time.
  useEffect(() => {
    const markActive = () => { lastActivityRef.current = Date.now(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') markActive(); };
    // Opening/returning to the app counts as activity so counting starts immediately (not after the
    // first stray event).
    markActive();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, markActive, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Tick once a second, but only accrue the second if it is ACTIVE study time.
  useEffect(() => {
    const interval = setInterval(() => {
      const active = shouldCountSecond({
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'visible',
        now: Date.now(),
        lastActivityAt: lastActivityRef.current,
      });
      if (active) setTotalTimeInSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Persist active time to the profile in whole-minute additive increments.
  useEffect(() => {
    const syncTime = async () => {
      if (!supabase || !user) return;
      const pending = totalTimeInSeconds - syncedSecondsRef.current;
      if (pending < SECONDS_PER_SYNC) return;
      const whole = Math.floor(pending / SECONDS_PER_SYNC) * SECONDS_PER_SYNC;
      const newTotal = (profile?.total_time_spent || 0) + whole;
      const { error } = await supabase.from('profiles').update({ total_time_spent: newTotal }).eq('id', user.id);
      if (error) {
        handleSupabaseError(error, 'syncTime', 'profiles');
      } else {
        syncedSecondsRef.current += whole;
        setProfile(prev => prev ? { ...prev, total_time_spent: newTotal } : null);
      }
    };
    void syncTime();
    // Keyed to the active-seconds tick; supabase/setProfile/handleSupabaseError are stable per
    // session and adding them would not change when the sync fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to the tick only
  }, [totalTimeInSeconds, user, profile?.total_time_spent]);

  // Called on logout: flush the unsynced sub-minute tail (TB-17 under-persist fix) then reset.
  const resetTimeTracking = () => {
    const pending = unsyncedSeconds(totalTimeInSeconds, syncedSecondsRef.current);
    if (supabase && user && pending > 0) {
      const newTotal = (profile?.total_time_spent || 0) + pending;
      // Fire-and-forget: the auth slice calls this synchronously during teardown. Errors still route
      // through the centralized handler; the local profile is dropped on logout so no setProfile.
      void (async () => {
        const { error } = await supabase.from('profiles').update({ total_time_spent: newTotal }).eq('id', user.id);
        if (error) handleSupabaseError(error, 'flushTimeOnReset', 'profiles');
      })();
    }
    syncedSecondsRef.current = 0;
    setTotalTimeInSeconds(0);
  };

  return { totalTimeInSeconds, resetTimeTracking };
};
