// File: src/platform/speech-fallback.ts
// Description: Optional cloud speech-to-text fallback SEAM. No cloud provider exists
//   today — the server-side STT edge function has not been built — so this module
//   defines the contract only and is NOT in the default resolver path
//   (src/platform/index.ts wires the on-device adapters directly; zero behavior
//   change until a provider is registered).
//
//   Contract for a future provider (CloudSttProvider): the client captures a mic
//   recording via the AudioAdapter (startRecording/stopRecording), POSTs the audio
//   Blob to a Supabase edge function, and receives `{ transcript }` back. The
//   provider MUST be gated by a feature flag in src/config.ts (e.g. a future
//   `featureFlags.cloudStt`) plus an online check — per docs/CONTENT-ARCHITECTURE.md
//   §10, online-only capabilities degrade clearly rather than failing silently.
//
//   `speechWithFallback(primary, fallback?, recorder?)` upgrades a SpeechAdapter to
//   fall back to cloud transcription when on-device recognition is unavailable
//   (isAvailable() false, or start()/recognize() fails with 'unavailable' /
//   'not-implemented'). With no fallback registered it returns `primary` unchanged.
//   The cloud path is record-then-transcribe: no interim results; one aggregated
//   final SpeechResult at stop(), then onEnd.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import {
  AudioAdapter,
  PlatformError,
  SpeechAdapter,
  SpeechRecognizeOptions,
  SpeechResult,
  SpeechStartOptions,
} from './types';
import { SpeechAdapterCore, withRecognize } from './speech-common';
import { logger } from '../lib/logger';

export interface CloudSttTranscribeOptions {
  // BCP-47 tag, e.g. 'pt-PT'.
  language?: string;
}

// Server-side speech-to-text seam. Implementations wrap the (future) STT edge
// function: audio Blob in, plain transcript out. transcribe() rejects with
// PlatformError('speech', 'network' | ...) on failure.
export interface CloudSttProvider {
  // Feature-flag + connectivity gate. False = the fallback is not offered.
  isAvailable(): boolean;
  transcribe(audio: Blob, options?: CloudSttTranscribeOptions): Promise<string>;
}

// The slice of AudioAdapter the cloud path needs for mic capture — pass
// `platform.audio` (or any structural equivalent in tests).
export type CloudSttRecorder = Pick<
  AudioAdapter,
  'isRecordingSupported' | 'startRecording' | 'stopRecording'
>;

// SpeechAdapter over record-then-transcribe. Used only by speechWithFallback;
// exported for direct wiring/tests.
export const createCloudSpeechAdapter = (
  provider: CloudSttProvider,
  recorder: CloudSttRecorder,
): SpeechAdapter => {
  let listening = false;
  let language: string | undefined;

  let startCb: (() => void) | null = null;
  let resultCb: ((result: SpeechResult) => void) | null = null;
  let noMatchCb: (() => void) | null = null;
  let errorCb: ((error: PlatformError) => void) | null = null;
  let endCb: (() => void) | null = null;

  const toPlatformError = (e: unknown, message: string): PlatformError =>
    e instanceof PlatformError
      ? e
      : new PlatformError(
          'speech',
          'network',
          message,
          e instanceof Error ? e.message : String(e),
        );

  const core: SpeechAdapterCore = {
    isAvailable: () => provider.isAvailable() && recorder.isRecordingSupported(),
    isListening: () => listening,
    onStart: (cb) => { startCb = cb; },
    onResult: (cb) => { resultCb = cb; },
    onNoMatch: (cb) => { noMatchCb = cb; },
    onError: (cb) => { errorCb = cb; },
    onEnd: (cb) => { endCb = cb; },

    start(options?: SpeechStartOptions) {
      if (listening) {
        // Contract parity with the on-device adapters: safe no-op, re-fire onStart.
        startCb?.();
        return;
      }
      if (!core.isAvailable()) {
        throw new PlatformError(
          'speech',
          'unavailable',
          'Cloud speech transcription is not available.',
        );
      }
      language = options?.language;
      listening = true;
      recorder
        .startRecording()
        .then(() => { startCb?.(); })
        .catch((e) => {
          listening = false;
          // EN-27 P1.7: log before the OPTIONAL errorCb — if no callback is bound the failure would
          // otherwise vanish (user can't start cloud transcription, no trace).
          logger.error('CLOUD_SPEECH_START_RECORDING_FAILED', 'could not start microphone recording for cloud transcription', {
            category: 'SYSTEM_HEALTH',
            error: e,
          });
          errorCb?.(
            e instanceof PlatformError
              ? e
              : new PlatformError(
                  'speech',
                  'audio-capture',
                  'Could not start microphone recording for cloud transcription.',
                  e instanceof Error ? e.message : String(e),
                ),
          );
        });
    },

    stop() {
      if (!listening) return;
      listening = false;
      recorder
        .stopRecording()
        .then((audio) => provider.transcribe(audio, { language }))
        .then((transcript) => {
          const text = transcript.trim();
          if (text) {
            resultCb?.({ transcript: text, isFinal: true });
          } else {
            noMatchCb?.();
          }
          endCb?.();
        })
        .catch((e) => {
          // EN-27 P1.7: log before the OPTIONAL errorCb — the user's captured speech failed to
          // transcribe; without this it's lost with no trace when no callback is bound.
          logger.error('CLOUD_SPEECH_TRANSCRIPTION_FAILED', 'cloud speech transcription failed — captured audio was not transcribed', {
            category: 'SYSTEM_HEALTH',
            error: e,
          });
          errorCb?.(toPlatformError(e, 'Cloud speech transcription failed.'));
          endCb?.();
        });
    },
  };

  return withRecognize(core);
};

// Codes on which the primary adapter yields to the cloud fallback.
const shouldFallBack = (e: unknown): boolean =>
  e instanceof PlatformError &&
  (e.code === 'unavailable' || e.code === 'not-implemented');

// Wrap an on-device SpeechAdapter with an optional cloud fallback. With no
// provider/recorder registered this is the identity function — the default
// resolver keeps calling the on-device adapters directly and nothing changes.
export const speechWithFallback = (
  primary: SpeechAdapter,
  fallback?: CloudSttProvider,
  recorder?: CloudSttRecorder,
): SpeechAdapter => {
  if (!fallback || !recorder) return primary;

  const cloud = createCloudSpeechAdapter(fallback, recorder);
  // Whichever adapter the current/most-recent session runs on. Only one is
  // active at a time, so callbacks are registered on both unconditionally.
  let active: SpeechAdapter = primary;

  const pick = (): SpeechAdapter => (primary.isAvailable() ? primary : cloud);

  return {
    isAvailable: () => primary.isAvailable() || cloud.isAvailable(),
    isListening: () => active.isListening(),
    onStart: (cb) => { primary.onStart(cb); cloud.onStart(cb); },
    onResult: (cb) => { primary.onResult(cb); cloud.onResult(cb); },
    onNoMatch: (cb) => { primary.onNoMatch(cb); cloud.onNoMatch(cb); },
    onError: (cb) => { primary.onError(cb); cloud.onError(cb); },
    onEnd: (cb) => { primary.onEnd(cb); cloud.onEnd(cb); },

    start(options?: SpeechStartOptions) {
      active = pick();
      try {
        active.start(options);
      } catch (e) {
        if (active === primary && shouldFallBack(e) && cloud.isAvailable()) {
          active = cloud;
          cloud.start(options);
          return;
        }
        throw e;
      }
    },

    stop: () => active.stop(),

    recognize(options?: SpeechRecognizeOptions): Promise<string> {
      active = pick();
      if (active !== primary) return cloud.recognize(options);
      return primary.recognize(options).catch((e: unknown) => {
        if (shouldFallBack(e) && cloud.isAvailable()) {
          active = cloud;
          return cloud.recognize(options);
        }
        throw e;
      });
    },
  };
};
