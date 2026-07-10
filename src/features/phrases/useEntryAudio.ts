// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/phrases/useEntryAudio.ts
// Description: Per-entry 🔊 TTS playback hook for the Phrase Library. Routes through
//   geminiService.playSpeech (server TTS + platform audio adapter + clip cache — cached clips
//   replay offline) at the config default speed, debounces rapid taps, tracks which entry is
//   playing, and surfaces failures via src/lib/logger + an inline userMessage (never a bare
//   console call, never silent). SEAM: the user's selected tutor voice + playback speed live in
//   App-level state (src/hooks/useSpeechPlayback deps) and are NOT threaded through
//   PracticeModeProps — when the hub grows a shared audio context, swap the defaults here.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useRef, useState } from 'react';
import { geminiService } from '../../services/geminiService';
import { config } from '../../config';
import { errorMessage, logger, userMessage } from '../../lib/logger';

// Phrase-library tunable. NOTE: belongs in src/config.ts (AGENTS.md §3 "config, not
// magic values") but that file is under an active write claim by the parallel
// srs-adaptive-engine step — migrate once the claim is released. Mirrors the
// 300ms debounce in src/hooks/useSpeechPlayback.
export const phrasesAudioConfig = {
  /** Minimum gap between two play taps (debounce, ms). */
  playDebounceMs: 300,
} as const;

export const useEntryAudio = () => {
  const lastPlayTimeRef = useRef(0);
  /** Entry id currently playing (drives the per-row 🔊 active state), or null. */
  const [playingId, setPlayingId] = useState<string | null>(null);
  /** User-visible playback error (code + ref via userMessage), or null. */
  const [audioError, setAudioError] = useState<string | null>(null);

  const play = async (entryId: string, text: string): Promise<void> => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < phrasesAudioConfig.playDebounceMs) return;
    lastPlayTimeRef.current = now;

    setAudioError(null);
    try {
      setPlayingId(entryId);
      // Default tutor voice + config default speed (see SEAM note in the header).
      await geminiService.playSpeech(text, undefined, config.audio.defaultPlaybackSpeed, () => {
        setPlayingId((current) => (current === entryId ? null : current));
      });
    } catch (err) {
      const event = logger.error('PHRASE_AUDIO_FAILED', 'phrase library TTS playback failed', {
        category: 'AI_DECISION',
        error: err,
        details: { entryId, textLength: text.length },
      });
      setAudioError(
        userMessage('PHRASE_AUDIO_FAILED', errorMessage(err) || 'Audio playback failed', event.request_id),
      );
      setPlayingId((current) => (current === entryId ? null : current));
    }
  };

  return { playingId, audioError, play };
};
