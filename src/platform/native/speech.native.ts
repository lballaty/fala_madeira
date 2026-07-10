// File: src/platform/native/speech.native.ts
// Description: Native (Capacitor) SpeechAdapter on top of @capgo/capacitor-speech-recognition
//   (SPM-compatible, Capacitor 8 fork of @capacitor-community/speech-recognition, same
//   native SFSpeechRecognizer path on iOS). The adapter contract is synchronous
//   (start()/stop() return void; results/errors flow through callbacks), so start()
//   drives an async flow internally: request permissions → attach plugin listeners →
//   start native recognition with partial results. Interim transcripts map from the
//   plugin's `partialResults` events; one aggregated final transcript is emitted from
//   the plugin's cached last partial when the session ends (append-safe, matching the
//   web adapter's per-session final behavior). Plugin import is DYNAMIC so the web
//   bundle never pulls Capacitor plugin code in.
//   TODO(ios-build): add NSSpeechRecognitionUsageDescription and
//   NSMicrophoneUsageDescription to ios/App/App/Info.plist (required — start() will
//   crash the app without them) and validate the permission prompt flow on device.
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

type SpeechPlugin = typeof import('@capgo/capacitor-speech-recognition').SpeechRecognition;
type ListenerHandle = { remove: () => Promise<void> };

// Best-effort mapping of the plugin's free-form native error codes onto the
// adapter's typed codes. Unrecognized codes fall through to 'unknown' with the
// raw code preserved in PlatformError.detail.
const mapErrorCode = (code: string): PlatformErrorCode => {
  const c = code.toLowerCase();
  if (c.includes('permission') || c.includes('denied') || c.includes('restricted')) {
    return 'permission-denied';
  }
  if (c.includes('no-speech') || c.includes('nomatch') || c.includes('no_match')) {
    return 'no-speech';
  }
  if (c.includes('audio') || c.includes('mic')) return 'audio-capture';
  if (c.includes('network')) return 'network';
  if (c.includes('abort') || c.includes('cancel')) return 'aborted';
  if (c.includes('unavailable') || c.includes('not-available')) return 'unavailable';
  return 'unknown';
};

export const createNativeSpeechAdapter = (): SpeechAdapter => {
  let pluginPromise: Promise<SpeechPlugin> | null = null;
  const plugin = async (): Promise<SpeechPlugin> => {
    pluginPromise ??= import('@capgo/capacitor-speech-recognition').then(
      (m) => m.SpeechRecognition,
    );
    return pluginPromise;
  };

  let listening = false;
  let starting = false;
  // True from listener attachment until endSession/fail — makes endSession
  // idempotent when both the 'stopped' event and the stop() fallback fire.
  let sessionOpen = false;
  // Set once the current session has emitted its final transcript, so the
  // stop() path and the listeningState-stopped path never double-emit.
  let finalized = true;
  let handles: ListenerHandle[] = [];

  // Availability is probed lazily in the background; until the probe lands we
  // report true — every supported iOS version ships SFSpeechRecognizer, and a
  // genuinely unavailable recognizer still surfaces as a typed onError at start.
  let available: boolean | null = null;
  let probeStarted = false;

  let startCb: (() => void) | null = null;
  let resultCb: ((result: SpeechResult) => void) | null = null;
  let noMatchCb: (() => void) | null = null;
  let errorCb: ((error: PlatformError) => void) | null = null;
  let endCb: (() => void) | null = null;

  const probeAvailability = (): void => {
    if (probeStarted) return;
    probeStarted = true;
    plugin()
      .then((sr) => sr.available())
      .then((r) => {
        available = r.available;
      })
      .catch(() => {
        available = false;
      });
  };

  const detachListeners = async (): Promise<void> => {
    const doomed = handles;
    handles = [];
    for (const h of doomed) {
      try {
        await h.remove();
      } catch {
        // Listener already gone — nothing to clean up.
      }
    }
  };

  // Emit the plugin's cached transcript as this session's single aggregated
  // final result (append-safe per the SpeechAdapter contract).
  const emitFinalFromCache = async (sr: Awaited<ReturnType<typeof plugin>>): Promise<void> => {
    if (finalized) return;
    finalized = true;
    try {
      const last = await sr.getLastPartialResult();
      if (last.available && last.text) {
        resultCb?.({ transcript: last.text, isFinal: true });
      } else {
        noMatchCb?.();
      }
    } catch {
      noMatchCb?.();
    }
  };

  const endSession = async (sr: Awaited<ReturnType<typeof plugin>>): Promise<void> => {
    if (!sessionOpen) return;
    sessionOpen = false;
    await emitFinalFromCache(sr);
    listening = false;
    await detachListeners();
    endCb?.();
  };

  const fail = (error: PlatformError): void => {
    sessionOpen = false;
    listening = false;
    starting = false;
    finalized = true;
    void detachListeners();
    errorCb?.(error);
  };

  const runStart = async (options?: SpeechStartOptions): Promise<void> => {
    const sr = await plugin();

    // Permission flow. TODO(ios-build): requires NSSpeechRecognitionUsageDescription
    // + NSMicrophoneUsageDescription in Info.plist; validate prompt UX on device.
    const { speechRecognition } = await sr.requestPermissions();
    if (speechRecognition === 'denied') {
      throw new PlatformError(
        'speech',
        'permission-denied',
        'Microphone or speech recognition permission was denied.',
        `permission state: ${speechRecognition}`,
      );
    }

    await detachListeners(); // defensive — no listeners should survive a session
    finalized = false;
    sessionOpen = true;

    handles.push(
      (await sr.addListener('partialResults', (event) => {
        const transcript = event.matches?.[0] ?? event.accumulatedText ?? '';
        if (!transcript) return;
        if (event.forced) {
          // forceStop flush — treat as the session's final transcript.
          if (!finalized) {
            finalized = true;
            resultCb?.({ transcript, isFinal: true });
          }
          return;
        }
        resultCb?.({ transcript, isFinal: false });
      })) as ListenerHandle,
    );

    handles.push(
      (await sr.addListener('error', (event) => {
        fail(
          new PlatformError(
            'speech',
            mapErrorCode(event.code),
            `Speech recognition error: ${event.message}`,
            event.code,
          ),
        );
      })) as ListenerHandle,
    );

    handles.push(
      (await sr.addListener('listeningState', (event) => {
        const state = event.state ?? event.status;
        if (state === 'started') {
          listening = true;
          starting = false;
          startCb?.();
        } else if (state === 'stopped') {
          // Session ended natively (silence timeout, results delivered, or a
          // stop we initiated) — emit the final transcript and close out.
          starting = false;
          void plugin().then(endSession);
        }
      })) as ListenerHandle,
    );

    // partialResults:true streams interim transcripts and resolves immediately;
    // the final transcript is emitted from the cached last partial at session
    // end. The plugin has no true continuous mode on iOS (sessions end on
    // silence) — callers already handle onEnd-driven restarts, matching how
    // Safari's Web Speech implementation behaves on the web today.
    await sr.start({
      language: options?.language ?? 'pt-PT',
      maxResults: 5,
      partialResults: options?.interimResults ?? true,
      addPunctuation: true,
    });
  };

  const core: SpeechAdapterCore = {
    isAvailable: () => {
      probeAvailability();
      return available ?? true;
    },
    isListening: () => listening,
    onStart: (cb) => { startCb = cb; },
    onResult: (cb) => { resultCb = cb; },
    onNoMatch: (cb) => { noMatchCb = cb; },
    onError: (cb) => { errorCb = cb; },
    onEnd: (cb) => { endCb = cb; },

    start(options?: SpeechStartOptions) {
      if (available === false) {
        throw new PlatformError(
          'speech',
          'unavailable',
          'Speech recognition is not available on this device.',
        );
      }
      if (listening || starting) {
        // Contract: start() while already listening is a safe no-op that
        // re-fires onStart.
        startCb?.();
        return;
      }
      starting = true;
      runStart(options).catch((e) => {
        fail(
          e instanceof PlatformError
            ? e
            : new PlatformError(
                'speech',
                'unknown',
                'Could not start speech recognition.',
                e instanceof Error ? e.message : String(e),
              ),
        );
      });
    },

    stop() {
      if (!listening && !starting) return;
      starting = false;
      void plugin()
        .then(async (sr) => {
          await sr.stop();
          // The plugin fires listeningState 'stopped' after stop(), which
          // drives endSession(); this direct call is the fallback in case the
          // event is missed (endSession/emitFinalFromCache are idempotent).
          await endSession(sr);
        })
        .catch((e) => {
          fail(
            new PlatformError(
              'speech',
              'unknown',
              'Could not stop speech recognition.',
              e instanceof Error ? e.message : String(e),
            ),
          );
        });
    },
  };

  // recognize() (one-shot promise surface) is shared across implementations.
  return withRecognize(core);
};
