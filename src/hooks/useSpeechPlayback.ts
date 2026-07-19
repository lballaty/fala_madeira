// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useSpeechPlayback.ts
// Description: Single-utterance TTS playback hook extracted from App.tsx. Debounces rapid
//   plays (300ms) and routes through geminiService.playSpeech with the user's selected tutor
//   voice and playback speed. Used by lesson patterns/vocabulary, chat replies, and the quiz.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useRef, useState } from 'react';
import { geminiService } from '../services/geminiService';
import { TUTORS } from '../data/tutors';
import { UserProfile } from '../types';
import { ShowToast } from './useToast';
import { PlatformError } from '../platform/types';
import { logger, userMessage } from '../lib/logger';
// EN-31 GAP 2/3: the once-per-outage / once-per-session toast-dedupe latches live in a dedicated
// module behind function accessors so this hook never mutates render-reachable module state
// directly (react-compiler rule). See audioNoticeLatch.ts for the rationale.
import { audioNoticeLatch } from './audioNoticeLatch';

interface SpeechPlaybackDeps {
  profile: UserProfile | null;
  playbackSpeed: number;
  showToast: ShowToast;
}

// Re-exported here so existing callers/tests keep importing the resets from this hook module.
export { __resetAudioFailureNotified, __resetAudioDegradedNotified } from './audioNoticeLatch';

// EN-31 WP-C: stable, honest, non-alarming failure copy. A device that cannot synthesize speech at
// all (permanent) is a different situation from a transient provider/network failure, so the two
// carry distinct messages. Both travel with the correlation ref via userMessage (support pivot).
const failureCopy = (err: unknown): { code: string; text: string } => {
  if (err instanceof PlatformError && err.code === 'unavailable') {
    return { code: 'TTS_UNSUPPORTED', text: "This device can't play spoken audio." };
  }
  return { code: 'TTS_FAILED', text: "Couldn't play the audio — check your connection or try again." };
};

export const useSpeechPlayback = ({ profile, playbackSpeed, showToast }: SpeechPlaybackDeps) => {
  const lastPlayTimeRef = useRef(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  // EN-31 WP-C: the failure toast's Retry re-invokes the LATEST playSpeech through this ref rather
  // than closing over playSpeech directly. A direct recursive reference inside the hook body defeats
  // react-compiler's analysis of the whole hook (it then mis-flags the debounce's Date.now as an
  // impure render call); the ref indirection keeps Retry working without that self-reference.
  const playSpeechRef = useRef<((text: string) => void) | null>(null);

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
      }, {
        // EN-31 GAP 2 (WP-D): server TTS degraded to the device voice — surface a calm, once-per-
        // session info notice so the user understands why the audio sounds different. Not an error.
        onDegraded: () => {
          if (audioNoticeLatch.isDegradedNotified()) return;
          audioNoticeLatch.markDegradedNotified();
          showToast("Using your device's voice — premium audio is briefly unavailable.", 'info');
        },
      });
      // Recovered: re-arm the failure notification so the next outage is surfaced again.
      audioNoticeLatch.rearmFailure();
    } catch (err) {
      // Always log every failure (observability); dedupe only the user-facing toast so a
      // session-long outage doesn't spam one toast per play (EN-31 GAP 3).
      const event = logger.error('speech_playback_failed', 'Play speech error', { category: 'AI_DECISION', error: err });
      if (!audioNoticeLatch.isFailureNotified()) {
        const { code, text: message } = failureCopy(err);
        // EN-31 WP-C: stable copy (never a raw error string) + a Retry that re-invokes the SAME play.
        // Transient provider/network blips are the common case, so Retry saves re-hunting the control.
        showToast(userMessage(code, message, event.request_id), 'error', {
          actions: [{ label: 'Retry', onClick: () => { playSpeechRef.current?.(text); } }],
        });
        audioNoticeLatch.markFailureNotified();
      }
      setIsAudioPlaying(false);
    }
  };

  // Keep the Retry indirection ref pointing at the latest playSpeech. Done in an effect (not during
  // render) so it's a lint-clean ref mutation and avoids the render-scope self-reference that would
  // defeat react-compiler's analysis of this hook.
  useEffect(() => {
    playSpeechRef.current = playSpeech;
  });

  return { playSpeech, isAudioPlaying };
};
