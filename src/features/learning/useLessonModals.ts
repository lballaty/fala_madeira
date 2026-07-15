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
import { lookupVocabInventory } from '../phrases/vocabSearch';
import { TUTORS } from '../../data/tutors';
import { ShowToast } from '../../hooks/useToast';
import { logger, userMessage } from '../../lib/logger';
import { config } from '../../config';
import { validateText, validateUrl } from '../../lib/validation';

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
    // Validate + limit before persisting (ENGINEERING-STANDARDS §4): trim, reject-empty, cap length.
    const themeCheck = validateText(requestTheme, 'Theme', config.limits.requestThemeMax);
    if (!themeCheck.ok) { showToast(themeCheck.reason, 'error'); return; }
    const descCheck = validateText(requestDesc, 'Description', config.limits.requestDescMax);
    if (!descCheck.ok) { showToast(descCheck.reason, 'error'); return; }

    if (supabase && user) {
      const { error } = await supabase.from('lesson_requests').insert({
        user_id: user.id,
        theme: themeCheck.value,
        description: descCheck.value,
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
    if (!selectedLesson || !supabase || !user) return;
    // Validate the URL (must be a real http(s) link) and cap the optional note.
    const urlCheck = validateUrl(suggestionUrl, 'Video link');
    if (!urlCheck.ok) { showToast(urlCheck.reason, 'error'); return; }
    const note = suggestionNote.trim();
    if (note.length > config.limits.suggestionNoteMax) {
      showToast(`Note is too long (max ${config.limits.suggestionNoteMax} characters).`, 'error');
      return;
    }

    const newSuggestion = {
      lesson_id: selectedLesson.id,
      user_id: user.id,
      video_url: urlCheck.value,
      note,
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
    if (!selectedLesson || isCorrectionLoading) return;
    const check = validateText(correctionText, 'Correction', config.limits.correctionTextMax);
    if (!check.ok) { showToast(check.reason, 'error'); return; }

    setIsCorrectionLoading(true);
    if (supabase && user) {
      const { error } = await supabase.from('lesson_corrections').insert({
        lesson_id: selectedLesson.id,
        user_id: user.id,
        correction_text: check.value,
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
    if (isVocabLoading) return;
    const check = validateText(vocabQuery, 'Word', config.limits.vocabQueryMax);
    if (!check.ok) { showToast(check.reason, 'error'); return; }

    setIsVocabLoading(true);
    setVocabResult(null);
    try {
      // Inventory-first (EN-10): search the curated {PT word ↔ EN translation} set in
      // BOTH directions, diacritic-insensitive + fuzzy, offline-capable. Only a MISS
      // falls through to the AI translate path below.
      const inventoryHit = await lookupVocabInventory(check.value);
      if (inventoryHit) {
        setVocabResult(inventoryHit);
        return;
      }
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      const result = await geminiService.translateWord(check.value, tutor);
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
