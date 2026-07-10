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
