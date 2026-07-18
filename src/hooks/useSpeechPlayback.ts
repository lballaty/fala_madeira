// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useSpeechPlayback.ts
// Description: Single-utterance TTS playback hook extracted from App.tsx. Debounces rapid
//   plays (300ms) and routes through geminiService.playSpeech with the user's selected tutor
//   voice and playback speed. Used by lesson patterns/vocabulary, chat replies, and the quiz.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useRef, useState } from 'react';
import { geminiService } from '../services/geminiService';
import { TUTORS } from '../data/tutors';
import { UserProfile } from '../types';
import { ShowToast } from './useToast';
import { errorMessage, logger, userMessage } from '../lib/logger';

interface SpeechPlaybackDeps {
  profile: UserProfile | null;
  playbackSpeed: number;
  showToast: ShowToast;
}

export const useSpeechPlayback = ({ profile, playbackSpeed, showToast }: SpeechPlaybackDeps) => {
  const lastPlayTimeRef = useRef(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const playSpeech = async (text: string) => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < 300) return;
    lastPlayTimeRef.current = now;

    try {
      setIsAudioPlaying(true);
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      // NOTE (EN-8): this hook is shared across CURATED text (lessons, quiz, onboarding) AND
      // free-chat replies (TutorChatView plays msg.text through the same playSpeech) + user vocab
      // lookups. Because the caller isn't distinguishable here, hostable is deliberately left unset
      // (= not-hostable) so free-chat/user text can never be server-hosted (COORD-2 BLOCKING-1).
      // Curated content played via this hook is still hosted through the pre-gen + offline paths.
      // FOLLOW-UP: thread a per-consumer hostable flag so curated lesson/quiz plays opt in safely.
      await geminiService.playSpeech(text, tutor, playbackSpeed, () => {
        setIsAudioPlaying(false);
      });
    } catch (err) {
      const event = logger.error('speech_playback_failed', 'Play speech error', { category: 'AI_DECISION', error: err });
      showToast(userMessage('TTS_FAILED', errorMessage(err) || 'Audio playback failed', event.request_id), 'error');
      setIsAudioPlaying(false);
    }
  };

  return { playSpeech, isAudioPlaying };
};
