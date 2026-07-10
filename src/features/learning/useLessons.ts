// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/useLessons.ts
// Description: Learning-slice store hook extracted from App.tsx. Owns lesson catalog state
//   (static + custom + approved-video overlays), curriculum month selection, review-mode
//   ordering, month activation (audio cache reset), level unlock, video-suggestion
//   moderation, and AI-generated lesson saving. resetForLogout is invoked by the auth slice.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useMemo, useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { Lesson, UserProfile, VideoSuggestion } from '../../types';
import { INITIAL_LESSONS } from '../../data/lessons';
import { ShowToast } from '../../hooks/useToast';
import { logger, userMessage } from '../../lib/logger';
import { config } from '../../config';

interface LessonsDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
}

export const useLessons = ({ supabase, user, profile, setProfile, showToast, handleSupabaseError }: LessonsDeps) => {
  const [lessons, setLessons] = useState<Lesson[]>(INITIAL_LESSONS);
  const [customLessons, setCustomLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [videoSuggestions, setVideoSuggestions] = useState<VideoSuggestion[]>([]);
  const [unlockKey, setUnlockKey] = useState('');
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);

  // Called from the auth bootstrap (works for signed-out visitors too).
  const fetchApprovedVideos = async () => {
    if (!supabase) return;
    try {
      const { data: suggestionsData } = await supabase
        .from('video_suggestions')
        .select('*')
        .eq('status', 'approved');

      if (suggestionsData && suggestionsData.length > 0) {
        setLessons(prev => {
          return prev.map(lesson => {
            const suggestion = suggestionsData
              .filter(s => s.lesson_id === lesson.id)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            if (suggestion) {
              return { ...lesson, video_url: suggestion.video_url };
            }
            return lesson;
          });
        });
      }
    } catch (err) {
      // No user surface: approved-video enrichment is a background fetch; lessons render without it.
      logger.error('approved_videos_fetch_failed', 'Error fetching approved videos', { category: 'DATA_PROCESSING', error: err });
    }
  };

  const fetchCustomLessons = async (userId: string, userRole?: string) => {
    if (!supabase) return;

    // Fetch custom lessons
    const { data: customLessonsData } = await supabase
      .from('lessons')
      .select('*')
      .eq('user_id', userId);

    // Fetch video suggestions
    let suggestionsQuery = supabase.from('video_suggestions').select('*');
    if (userRole !== 'admin') {
      suggestionsQuery = suggestionsQuery.or(`status.eq.approved,user_id.eq.${userId}`);
    }
    const { data: suggestionsData } = await suggestionsQuery;

    if (suggestionsData) {
      setVideoSuggestions(suggestionsData);
    }

    let mergedLessons = [...INITIAL_LESSONS];
    if (customLessonsData) {
      mergedLessons = [...mergedLessons, ...customLessonsData];
    }

    // Apply approved video suggestions to lessons
    if (suggestionsData) {
      const approvedSuggestions = suggestionsData.filter(s => s.status === 'approved');
      mergedLessons = mergedLessons.map(lesson => {
        // Find the most recently approved suggestion for this lesson
        const suggestion = approvedSuggestions
          .filter(s => s.lesson_id === lesson.id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (suggestion) {
          return { ...lesson, video_url: suggestion.video_url };
        }
        return lesson;
      });
    }

    setLessons(mergedLessons);
  };

  const handleActivateMonth = async (month: number) => {
    if (supabase && user) {
      const { error } = await supabase.from('profiles').update({ active_month: month }).eq('id', user.id);
      if (error) {
        handleSupabaseError(error, 'handleActivateMonth', 'profiles');
      } else {
        setProfile(prev => prev ? { ...prev, active_month: month } : null);
        showToast(`Month ${month} activated! Local audio cache cleared for new month.`, "success");
        // Clear audio cache for new month
        import('../../lib/audioCache').then(({ audioCache }) => audioCache.clear());
        // In a real app, we would trigger a background download here
        localStorage.setItem(`active_lessons_month_${month}`, JSON.stringify(lessons.filter(l => l.level === month)));
      }
    } else {
      setProfile(prev => prev ? { ...prev, active_month: month } : null);
      localStorage.setItem(`active_lessons_month_${month}`, JSON.stringify(lessons.filter(l => l.level === month)));
      showToast(`Month ${month} activated! Local audio cache cleared.`, "success");
      import('../../lib/audioCache').then(({ audioCache }) => audioCache.clear());
    }
  };

  const sortedLessons = useMemo(() => {
    const monthLessons = lessons.filter(l => l.level === selectedMonth);
    if (!profile?.completed_lessons_order) return monthLessons.sort((a, b) => (a.day || 0) - (b.day || 0));

    const completed = monthLessons.filter(l => profile.completed_lessons.includes(l.id));
    const others = monthLessons.filter(l => !profile.completed_lessons.includes(l.id));

    const orderedCompleted = [...completed].sort((a, b) => {
      const aIdx = profile.completed_lessons_order!.indexOf(a.id);
      const bIdx = profile.completed_lessons_order!.indexOf(b.id);
      if (aIdx === -1 && bIdx === -1) return (a.day || 0) - (b.day || 0);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    return [...orderedCompleted, ...others.sort((a, b) => (a.day || 0) - (b.day || 0))];
  }, [lessons, selectedMonth, profile?.completed_lessons, profile?.completed_lessons_order]);

  const handleReorder = (newOrder: Lesson[]) => {
    if (!profile) return;

    // Only update order for completed lessons
    const completedIds = newOrder
      .filter(l => profile.completed_lessons.includes(l.id))
      .map(l => l.id);

    setProfile({ ...profile, completed_lessons_order: completedIds });
  };

  const handleApproveSuggestion = async (suggestion: VideoSuggestion) => {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('video_suggestions')
        .update({ status: 'approved' })
        .eq('id', suggestion.id);

      if (error) throw error;

      // Update lesson with new video URL
      setLessons(prev => prev.map(l =>
        l.id === suggestion.lesson_id ? { ...l, video_url: suggestion.video_url } : l
      ));

      // Update suggestion status
      setVideoSuggestions(prev => prev.map(s =>
        s.id === suggestion.id ? { ...s, status: 'approved' } : s
      ));
      showToast('Video approved and added to lesson!', 'success');
    } catch (err) {
      handleSupabaseError(err, 'update', 'video_suggestions');
    }
  };

  const handleRejectSuggestion = async (suggestion: VideoSuggestion) => {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('video_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestion.id);

      if (error) throw error;

      setVideoSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      showToast('Suggestion rejected', 'success');
    } catch (err) {
      handleSupabaseError(err, 'update', 'video_suggestions');
    }
  };

  const handleUnlockLevel = async () => {
    if (!supabase || !user) return;

    // The unlock key lives in global_settings (key: level_unlock_key), never in source
    // (ENGINEERING-STANDARDS §7). If the setting is unreachable or missing, DENY the
    // unlock — there is no hardcoded fallback key.
    const { data: keySetting, error: settingsError } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', config.globalSettingsKeys.levelUnlockKey)
      .single();

    if (settingsError || !keySetting?.value) {
      const event = logger.error(
        'unlock_key_setting_unreachable',
        'Could not read level_unlock_key from global_settings; denying unlock',
        {
          category: 'SECURITY',
          error: settingsError ?? undefined,
          details: { key: config.globalSettingsKeys.levelUnlockKey },
        }
      );
      showToast(
        userMessage('UNLOCK_KEY_UNAVAILABLE', 'Level unlock is temporarily unavailable. Please try again later.', event.request_id),
        'error'
      );
      return;
    }

    if (unlockKey.trim().toUpperCase() === keySetting.value.trim().toUpperCase()) {
      const nextLevel = (profile?.unlocked_level || 1) + 1;
      const { error } = await supabase
        .from('profiles')
        .update({ unlocked_level: nextLevel })
        .eq('id', user.id);

      if (!error) {
        setProfile(prev => prev ? { ...prev, unlocked_level: nextLevel } : null);
        showToast(`Level ${nextLevel} unlocked!`, "success");
        setUnlockKey('');
        setIsUnlockModalOpen(false);
      } else {
        showToast(error.message, "error");
      }
    } else {
      showToast("Invalid key. Ask your instructor for the current access key.", "error");
    }
  };

  const saveGeneratedLesson = async (lessonData: Partial<Lesson>) => {
    if (!supabase || !user) return;
    const newLesson: Partial<Lesson> & { user_id: string } = {
      ...lessonData,
      user_id: user.id,
      is_static: false,
      level: profile?.unlocked_level || 1,
      category: 'custom'
    };

    const { data, error } = await supabase.from('lessons').insert(newLesson).select().single();
    if (data) {
      setLessons(prev => [...prev, data]);
      showToast("Lesson saved to your library!", "success");
    } else if (error) {
      handleSupabaseError(error, 'saveGeneratedLesson', 'lessons');
    }
  };

  // Invoked by the auth slice on logout (original behavior: lessons emptied, not reseeded).
  const resetForLogout = () => {
    setLessons([]);
    setCustomLessons([]);
  };

  return {
    lessons, setLessons,
    customLessons, setCustomLessons,
    selectedLesson, setSelectedLesson,
    selectedMonth, setSelectedMonth,
    isReviewMode, setIsReviewMode,
    videoSuggestions, setVideoSuggestions,
    unlockKey, setUnlockKey,
    isUnlockModalOpen, setIsUnlockModalOpen,
    sortedLessons,
    fetchApprovedVideos,
    fetchCustomLessons,
    handleActivateMonth,
    handleReorder,
    handleApproveSuggestion,
    handleRejectSuggestion,
    handleUnlockLevel,
    saveGeneratedLesson,
    resetForLogout,
  };
};
