// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/patterns/useDrillAudio.ts
// Description: TTS playback hook for the Pattern Builder drills. PracticeModeProps carries no
//   playSpeech dependency (registry contract: modes receive only situationId + onExit), so the
//   engine plays audio itself via geminiService.playSpeech with the app-default tutor voice and
//   playback speed (config.audio.defaultPlaybackSpeed). Debounces rapid taps (same 300ms guard
//   as hooks/useSpeechPlayback), tracks isPlaying for the wave affordance, and surfaces
//   failures as an inline user-visible message (userMessage code + Ref) paired with a
//   centralized logger.error record — never a silent catch.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useRef, useState } from 'react';
import { geminiService } from '../../../services/geminiService';
import { TUTORS } from '../../../data/tutors';
import { config } from '../../../config';
import { errorMessage, logger, userMessage } from '../../../lib/logger';
import { patternDrillConfig } from './drill';

export interface DrillAudio {
  /** Speak a Portuguese phrase (debounced; cached clips replay offline). */
  playPhrase: (text: string) => void;
  isPlaying: boolean;
  /** User-visible playback failure ("message (Ref: …)"), cleared on the next successful play. */
  audioError: string | null;
}

export const useDrillAudio = (): DrillAudio => {
  const lastPlayTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Leaving the drill (unmount) stops any in-flight clip instead of letting it
  // play over the next screen.
  useEffect(() => () => geminiService.stopSpeech(), []);

  const playPhrase = useCallback((text: string) => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < patternDrillConfig.speechDebounceMs) return;
    lastPlayTimeRef.current = now;

    void (async () => {
      try {
        setIsPlaying(true);
        // No profile in PracticeModeProps → app-default tutor voice (TUTORS[0]),
        // matching useSpeechPlayback's fallback when no tutor is selected.
        await geminiService.playSpeech(text, TUTORS[0], config.audio.defaultPlaybackSpeed, () => {
          setIsPlaying(false);
        });
        setAudioError(null);
      } catch (error) {
        const event = logger.error('PATTERN_TTS_FAILED', 'pattern drill phrase playback failed', {
          category: 'AI_DECISION',
          error,
          details: { textLength: text.length },
        });
        setAudioError(
          userMessage('PATTERN_TTS_FAILED', errorMessage(error) || 'Audio playback failed', event.request_id),
        );
        setIsPlaying(false);
      }
    })();
  }, []);

  return { playPhrase, isPlaying, audioError };
};
