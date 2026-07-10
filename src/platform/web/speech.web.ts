// File: src/platform/web/speech.web.ts
// Description: Web implementation of SpeechAdapter on top of the Web Speech API
//   (SpeechRecognition / webkitSpeechRecognition). Aggregates final transcripts per
//   result event (matching the pre-adapter App.tsx behavior), maps browser error
//   strings to typed PlatformError codes, and treats start()-while-listening as a
//   safe no-op that re-fires onStart.
//   Known limitations (engineering rationale for the native Capacitor plugin,
//   featureFlags.nativeSpeech): on iOS Safari / iOS WebView, webkitSpeechRecognition is
//   intermittent — sessions end after short silences regardless of `continuous`, results
//   sometimes never arrive, and recognition can silently stop mid-utterance. There is no
//   reliable continuous mode there, so the native shell uses SFSpeechRecognizer via
//   @capgo/capacitor-speech-recognition instead (src/platform/native/speech.native.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import {
  PlatformError,
  PlatformErrorCode,
  SpeechAdapter,
  SpeechResult,
  SpeechStartOptions,
} from '../types';
import { SpeechAdapterCore, withRecognize } from '../speech-common';

// Minimal structural typing for the Web Speech API (not in lib.dom.d.ts).
// Only the members this adapter actually uses.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onnomatch: (() => void) | null;
  onerror: ((event: { error?: unknown }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const getRecognitionCtor = (): (new () => SpeechRecognitionLike) | null => {
  const w = globalThis as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const mapErrorCode = (webError: string): PlatformErrorCode => {
  switch (webError) {
    case 'not-allowed':
      return 'permission-denied';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'audio-capture';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    default:
      return 'unknown';
  }
};

export const createWebSpeechAdapter = (): SpeechAdapter => {
  let recognition: SpeechRecognitionLike | null = null;
  let listening = false;

  let startCb: (() => void) | null = null;
  let resultCb: ((result: SpeechResult) => void) | null = null;
  let noMatchCb: (() => void) | null = null;
  let errorCb: ((error: PlatformError) => void) | null = null;
  let endCb: (() => void) | null = null;

  const getRecognition = (): SpeechRecognitionLike | null => {
    if (recognition) return recognition;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;

    recognition = new Ctor();

    recognition.onstart = () => {
      listening = true;
      startCb?.();
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (!resultCb) return;
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      // One aggregated final result per event — append-safe for callers.
      if (finalTranscript) {
        resultCb({ transcript: finalTranscript, isFinal: true });
      }
      if (interimTranscript) {
        resultCb({ transcript: interimTranscript, isFinal: false });
      }
    };

    recognition.onnomatch = () => {
      noMatchCb?.();
    };

    recognition.onerror = (event: { error?: unknown }) => {
      listening = false;
      const raw = String(event?.error ?? 'unknown');
      errorCb?.(
        new PlatformError('speech', mapErrorCode(raw), `Speech recognition error: ${raw}`, raw),
      );
    };

    recognition.onend = () => {
      listening = false;
      endCb?.();
    };

    return recognition;
  };

  const core: SpeechAdapterCore = {
    isAvailable: () => getRecognitionCtor() !== null,
    isListening: () => listening,
    onStart: (cb) => { startCb = cb; },
    onResult: (cb) => { resultCb = cb; },
    onNoMatch: (cb) => { noMatchCb = cb; },
    onError: (cb) => { errorCb = cb; },
    onEnd: (cb) => { endCb = cb; },

    start(options?: SpeechStartOptions) {
      const rec = getRecognition();
      if (!rec) {
        throw new PlatformError(
          'speech',
          'unavailable',
          'Speech recognition is not supported in this browser.',
        );
      }
      rec.lang = options?.language ?? 'pt-PT';
      rec.continuous = options?.continuous ?? true;
      rec.interimResults = options?.interimResults ?? true;
      try {
        rec.start();
        listening = true;
      } catch (e) {
        // The Web Speech API throws InvalidStateError when recognition is
        // already running — treat as already-listening rather than a failure.
        if (e instanceof Error && (e.name === 'InvalidStateError' || e.message.includes('already started'))) {
          listening = true;
          startCb?.();
          return;
        }
        listening = false;
        throw new PlatformError(
          'speech',
          'unknown',
          'Could not start speech recognition.',
          e instanceof Error ? e.message : String(e),
        );
      }
    },

    stop() {
      if (recognition && listening) {
        recognition.stop();
      }
    },
  };

  // recognize() (one-shot promise surface) is shared across implementations.
  return withRecognize(core);
};
