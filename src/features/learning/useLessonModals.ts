// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/useLessonModals.ts
// Description: Learning-slice modal store hook extracted from App.tsx. Owns the state and
//   submit handlers for the lesson-request, video-suggestion, correction-report, and
//   vocabulary-lookup modals. State lives at App level (not modal-local) so drafts survive
//   tab switches exactly as in the original monolith.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { Lesson, UserProfile, VideoSuggestion, VocabResult } from '../../types';
import { geminiService } from '../../services/geminiService';
import { TUTORS } from '../../data/tutors';
import { ShowToast } from '../../hooks/useToast';
import { logger, userMessage } from '../../lib/logger';

interface LessonModalsDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
  selectedLesson: Lesson | null;
  videoSuggestions: VideoSuggestion[];
  setVideoSuggestions: React.Dispatch<React.SetStateAction<VideoSuggestion[]>>;
}

export const useLessonModals = ({
  supabase,
  user,
  profile,
  showToast,
  handleSupabaseError,
  selectedLesson,
  videoSuggestions,
  setVideoSuggestions
}: LessonModalsDeps) => {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestTheme, setRequestTheme] = useState('');
  const [requestDesc, setRequestDesc] = useState('');
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [suggestionUrl, setSuggestionUrl] = useState('');
  const [suggestionNote, setSuggestionNote] = useState('');
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [isCorrectionLoading, setIsCorrectionLoading] = useState(false);
  const [isVocabModalOpen, setIsVocabModalOpen] = useState(false);
  const [vocabQuery, setVocabQuery] = useState('');
  const [vocabResult, setVocabResult] = useState<VocabResult | null>(null);
  const [isVocabLoading, setIsVocabLoading] = useState(false);

  const handleRequestLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestTheme.trim() || !requestDesc.trim()) return;

    if (supabase && user) {
      const { error } = await supabase.from('lesson_requests').insert({
        user_id: user.id,
        theme: requestTheme,
        description: requestDesc,
        status: 'pending'
      });

      if (error) {
        handleSupabaseError(error, 'handleRequestLesson', 'lesson_requests');
      } else {
        showToast("Request submitted successfully!", "success");
        setIsRequestModalOpen(false);
        setRequestTheme('');
        setRequestDesc('');
      }
    } else {
      // Mock success if no supabase
      showToast("Request submitted (Demo Mode)", "success");
      setIsRequestModalOpen(false);
    }
  };

  const handleSuggestVideo = async () => {
    if (!selectedLesson || !suggestionUrl.trim() || !supabase || !user) return;

    const newSuggestion = {
      lesson_id: selectedLesson.id,
      user_id: user.id,
      video_url: suggestionUrl,
      note: suggestionNote,
      status: 'pending'
    };

    try {
      const { data, error } = await supabase
        .from('video_suggestions')
        .insert(newSuggestion)
        .select()
        .single();

      if (error) throw error;

      setVideoSuggestions([data, ...videoSuggestions]);
      setIsSuggestionModalOpen(false);
      setSuggestionUrl('');
      setSuggestionNote('');
      showToast('Suggestion submitted for review!', 'success');
    } catch (err) {
      handleSupabaseError(err, 'insert', 'video_suggestions');
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionText.trim() || !selectedLesson || isCorrectionLoading) return;

    setIsCorrectionLoading(true);
    if (supabase && user) {
      const { error } = await supabase.from('lesson_corrections').insert({
        lesson_id: selectedLesson.id,
        user_id: user.id,
        correction_text: correctionText,
        status: 'pending'
      });

      if (error) {
        handleSupabaseError(error, 'handleSubmitCorrection', 'lesson_corrections');
      } else {
        showToast("Correction submitted for review!", "success");
        setIsCorrectionModalOpen(false);
        setCorrectionText('');
      }
    } else {
      showToast("Correction submitted (Demo Mode)", "success");
      setIsCorrectionModalOpen(false);
      setCorrectionText('');
    }
    setIsCorrectionLoading(false);
  };

  const handleVocabLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vocabQuery.trim() || isVocabLoading) return;

    setIsVocabLoading(true);
    setVocabResult(null);
    try {
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      const result = await geminiService.translateWord(vocabQuery, tutor);
      setVocabResult(result ?? null);
    } catch (err) {
      const event = logger.error('vocab_lookup_failed', 'Vocab lookup error', { category: 'AI_DECISION', error: err });
      showToast(userMessage('VOCAB_LOOKUP_FAILED', 'Failed to lookup word', event.request_id), 'error');
    } finally {
      setIsVocabLoading(false);
    }
  };

  return {
    isRequestModalOpen, setIsRequestModalOpen,
    requestTheme, setRequestTheme,
    requestDesc, setRequestDesc,
    isSuggestionModalOpen, setIsSuggestionModalOpen,
    suggestionUrl, setSuggestionUrl,
    suggestionNote, setSuggestionNote,
    isCorrectionModalOpen, setIsCorrectionModalOpen,
    correctionText, setCorrectionText,
    isCorrectionLoading,
    isVocabModalOpen, setIsVocabModalOpen,
    vocabQuery, setVocabQuery,
    vocabResult, setVocabResult,
    isVocabLoading,
    handleRequestLesson,
    handleSuggestVideo,
    handleSubmitCorrection,
    handleVocabLookup,
  };
};
