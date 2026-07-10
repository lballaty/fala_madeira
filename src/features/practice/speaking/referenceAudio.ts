// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/referenceAudio.ts
// Description: Reference-audio helper for the Speaking Coach — wraps geminiService.playSpeech
//   (server TTS, cached PCM via the platform audio adapter) into a promise that resolves when
//   the clip FINISHES (playSpeech itself resolves at playback start), which the shadowing loop
//   and repeat-after-me sequencing need. TTS needs the network on a cache miss; failures are
//   logged here with correlation IDs and re-thrown so each drill degrades honestly in place
//   (inline message, never a dead button).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { geminiService } from '../../../services/geminiService';
import { logger } from '../../../lib/logger';

/**
 * Play the TTS reference for a phrase and resolve when playback ends.
 * Rejects on TTS/edge-function/playback failure (already logged).
 */
export const playReference = (text: string, speed: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    geminiService.playSpeech(text, undefined, speed, resolve).catch((err: unknown) => {
      logger.error('speaking_reference_audio_failed', 'Reference TTS playback failed in speaking mode', {
        category: 'AI_DECISION',
        error: err,
        details: { textLength: text.length, speed },
      });
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

/** Stop any in-flight reference playback (safe when idle). */
export const stopReference = (): void => {
  geminiService.stopSpeech();
};
