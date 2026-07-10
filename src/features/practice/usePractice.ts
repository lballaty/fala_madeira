// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/usePractice.ts
// Description: Practice-slice store hook (ENGINEERING-STANDARDS §1.1). Owns (a) the quiz
//   visibility + completion flow (marking lessons completed at score >= 3, syncing to
//   profiles) and (b) the Practice hub routing state — which mode is active and which
//   situation it was entered with (PracticeRoute). Non-linear by design: any mode can open
//   with any situation, soft prerequisites are advisory only, never a gate
//   (docs/CONTENT-ARCHITECTURE.md §5/§12). Engines register via ./registry.ts.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { Lesson, UserProfile } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

/**
 * Practice-hub routing state: which mode screen is mounted and which Situation
 * (src/content repository id) it was entered with. Free navigation contract
 * (CONTENT-ARCHITECTURE §5): any mode may be opened with any situation or none.
 */
export interface PracticeRoute {
  /** Registry id of the active mode (registry.ts PracticeMode.id); null = hub tile grid. */
  activeMode: string | null;
  /** Situation the mode was entered with; null = the mode's own default content. */
  situationId: string | null;
}

const HUB_ROUTE: PracticeRoute = { activeMode: null, situationId: null };

interface PracticeDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
  selectedLesson: Lesson | null;
}

export const usePractice = ({
  supabase,
  user,
  profile,
  setProfile,
  showToast,
  handleSupabaseError,
  selectedLesson
}: PracticeDeps) => {
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [route, setRoute] = useState<PracticeRoute>(HUB_ROUTE);

  const openQuiz = () => setIsQuizOpen(true);
  const closeQuiz = () => setIsQuizOpen(false);

  /** Enter a practice mode, optionally carrying the situation it should open on. */
  const openMode = (modeId: string, situationId: string | null = null) => {
    logger.debug('practice_open_mode', `Practice: open mode "${modeId}"`, {
      category: 'USER_ACTION',
      details: { modeId, situationId },
    });
    setRoute({ activeMode: modeId, situationId });
  };

  /** Leave the active mode and return to the Practice hub tile grid. */
  const closeMode = () => {
    logger.debug('practice_close_mode', 'Practice: back to hub', {
      category: 'USER_ACTION',
      details: { previousMode: route.activeMode },
    });
    setRoute(HUB_ROUTE);
  };

  const handleQuizComplete = (score: number) => {
    showToast(`Quiz completed! Score: ${score}`, "success");
    setIsQuizOpen(false);
    // Mark lesson as completed if score is good?
    if (score >= 3 && selectedLesson) {
      const updatedCompleted = [...(profile?.completed_lessons || []), selectedLesson.id];
      setProfile(prev => ({ ...prev!, completed_lessons: updatedCompleted }));
      if (supabase && user) {
        supabase.from('profiles').update({ completed_lessons: updatedCompleted }).eq('id', user.id).then(({ error }) => {
          if (error) handleSupabaseError(error, 'updateCompletedLessons', 'profiles');
        }, (err) => handleSupabaseError(err, 'updateCompletedLessons', 'profiles'));
      }
    }
  };

  return { isQuizOpen, openQuiz, closeQuiz, handleQuizComplete, route, openMode, closeMode };
};
