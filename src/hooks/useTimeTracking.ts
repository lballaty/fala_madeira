// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useTimeTracking.ts
// Description: Session time-tracking hook extracted from App.tsx. Ticks a per-session seconds
//   counter and syncs 60s increments into profiles.total_time_spent. resetTimeTracking is
//   called by the auth slice on logout.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { UserProfile } from '../types';

interface TimeTrackingDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
}

export const useTimeTracking = ({ supabase, user, profile, setProfile, handleSupabaseError }: TimeTrackingDeps) => {
  const [totalTimeInSeconds, setTotalTimeInSeconds] = useState(0);

  // Time tracking
  useEffect(() => {
    const interval = setInterval(() => {
      setTotalTimeInSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Sync time to profile periodically
  useEffect(() => {
    const syncTime = async () => {
      if (supabase && user && totalTimeInSeconds > 0 && totalTimeInSeconds % 60 === 0) {
        const newTotal = (profile?.total_time_spent || 0) + 60;
        const { error } = await supabase.from('profiles').update({ total_time_spent: newTotal }).eq('id', user.id);
        if (error) {
          handleSupabaseError(error, 'syncTime', 'profiles');
        } else {
          setProfile(prev => prev ? { ...prev, total_time_spent: newTotal } : null);
        }
      }
    };
    syncTime();
    // Intentionally keyed to the seconds tick; supabase/setProfile/handleSupabaseError
    // are stable per session and adding them would not change when the sync fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to the tick only
  }, [totalTimeInSeconds, user, profile?.total_time_spent]);

  const resetTimeTracking = () => setTotalTimeInSeconds(0);

  return { totalTimeInSeconds, resetTimeTracking };
};
