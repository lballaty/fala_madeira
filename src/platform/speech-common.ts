// File: src/platform/speech-common.ts
// Description: Shared speech-adapter helpers. `withRecognize` implements the one-shot
//   `SpeechAdapter.recognize()` convenience ONCE on top of a callback-only adapter core
//   (start/stop/onResult/onError/onEnd), so the web and native implementations share
//   identical one-shot semantics: resolve with the aggregated final transcript; reject
//   with typed PlatformError('speech', 'unavailable' | 'permission-denied' | 'timeout'
//   | 'no-speech' | 'aborted' | ...). The wrapper multiplexes the adapter's single
//   recognition channel — externally registered callbacks keep firing during a
//   recognize() run.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import {
  PlatformError,
  SpeechAdapter,
  SpeechRecognizeOptions,
  SpeechResult,
} from './types';

// Everything an implementation must provide; recognize() is derived from it.
export type SpeechAdapterCore = Omit<SpeechAdapter, 'recognize'>;

// After a timeout-driven stop(), how long to wait for the platform to flush a
// last final transcript (the native plugin only emits its final from the cached
// partial at session end) before rejecting with 'timeout'.
const TIMEOUT_STOP_FLUSH_GRACE_MS = 1500;

export const withRecognize = (core: SpeechAdapterCore): SpeechAdapter => {
  interface RecognizeTap {
    onResult(result: SpeechResult): void;
    onError(error: PlatformError): void;
    onEnd(): void;
  }

  // Externally registered callbacks (the normal SpeechAdapter surface).
  let extStart: (() => void) | null = null;
  let extResult: ((result: SpeechResult) => void) | null = null;
  let extNoMatch: (() => void) | null = null;
  let extError: ((error: PlatformError) => void) | null = null;
  let extEnd: (() => void) | null = null;

  // Internal tap, set only while a recognize() call is in flight.
  let tap: RecognizeTap | null = null;

  // The wrapper owns the core exclusively — register its dispatchers once and
  // let external callers register through the wrapper's setters below.
  core.onStart(() => { extStart?.(); });
  core.onResult((result) => { tap?.onResult(result); extResult?.(result); });
  core.onNoMatch(() => { extNoMatch?.(); });
  core.onError((error) => { tap?.onError(error); extError?.(error); });
  core.onEnd(() => { tap?.onEnd(); extEnd?.(); });

  const recognize = (options?: SpeechRecognizeOptions): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      if (tap || core.isListening()) {
        reject(new PlatformError(
          'speech',
          'aborted',
          'A speech recognition session is already in progress.',
        ));
        return;
      }
      if (!core.isAvailable()) {
        reject(new PlatformError(
          'speech',
          'unavailable',
          'Speech recognition is not available on this platform.',
        ));
        return;
      }

      let finalText = '';
      let timedOut = false;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const settle = (outcome: () => void): void => {
        tap = null;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (flushTimer) clearTimeout(flushTimer);
        outcome();
      };

      // Session-over resolution: any collected final transcript wins; otherwise
      // the rejection code distinguishes a caller-budget timeout from a session
      // that simply heard nothing.
      const finish = (): void => {
        const transcript = finalText.trim();
        if (transcript) {
          settle(() => resolve(transcript));
        } else if (timedOut) {
          settle(() => reject(new PlatformError(
            'speech',
            'timeout',
            `No transcript within ${options?.timeoutMs}ms.`,
          )));
        } else {
          settle(() => reject(new PlatformError(
            'speech',
            'no-speech',
            'No speech was recognized.',
          )));
        }
      };

      tap = {
        onResult: (result) => {
          if (result.isFinal) {
            finalText += (finalText ? ' ' : '') + result.transcript;
          }
        },
        onError: (error) => settle(() => reject(error)),
        onEnd: finish,
      };

      if (options?.timeoutMs && options.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          timedOut = true;
          core.stop();
          // stop() ends the session asynchronously; onEnd normally drives
          // finish(). The flush timer is the backstop when it never fires.
          flushTimer = setTimeout(finish, TIMEOUT_STOP_FLUSH_GRACE_MS);
        }, options.timeoutMs);
      }

      try {
        // One-shot: single utterance, interim results on (the native adapter
        // derives its end-of-session final from cached partials).
        core.start({
          language: options?.language,
          continuous: false,
          interimResults: true,
        });
      } catch (e) {
        settle(() => reject(
          e instanceof PlatformError
            ? e
            : new PlatformError(
                'speech',
                'unknown',
                'Could not start speech recognition.',
                e instanceof Error ? e.message : String(e),
              ),
        ));
      }
    });

  return {
    isAvailable: () => core.isAvailable(),
    isListening: () => core.isListening(),
    onStart: (cb) => { extStart = cb; },
    onResult: (cb) => { extResult = cb; },
    onNoMatch: (cb) => { extNoMatch = cb; },
    onError: (cb) => { extError = cb; },
    onEnd: (cb) => { extEnd = cb; },
    start: (options) => core.start(options),
    stop: () => core.stop(),
    recognize,
  };
};
