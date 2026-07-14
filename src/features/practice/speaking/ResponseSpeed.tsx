// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/ResponseSpeed.tsx
// Description: Response-speed drill (Speaking Coach, CONTENT-ARCHITECTURE §3): show the prompt
//   (the English translation), start listening, and measure time-to-speech-start from the
//   recognition onStart event to the first result event — then give gentle pacing feedback
//   (this trains the 'retrieve' dimension, §6). Persists a latency-scored pronunciation_attempts
//   row + Coach signal. REQUIRES speech recognition; when unavailable the drill is not offered
//   (SpeakingView hides the tile with a note) — this component renders a clear explainer if
//   ever mounted without it, never a dead button.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Timer } from 'lucide-react';
import { platform, PlatformError, SpeechResult } from '../../../platform';
import { errorMessage, logger } from '../../../lib/logger';
import { SpeakingItem } from './speakingItems';
import { speakingConfig } from './speakingConfig';
import { AttemptPersistStatus, recordPronunciationAttempt } from './attempts';
import { SaveStatusNote } from './SharedControls';

interface ResponseSpeedProps {
  items: SpeakingItem[];
  sttAvailable: boolean;
}

type Phase = 'ready' | 'listening' | 'scored';

const latencyFeedback = (latencyMs: number): string => {
  if (latencyMs <= speakingConfig.instantLatencyMs) return 'Instant — that came out without thinking. That is fluency.';
  if (latencyMs <= speakingConfig.goodLatencyMs) return 'Good pace — a touch quicker each time and it becomes automatic.';
  return 'You got there — the goal is answering before you translate in your head. Try once more.';
};

export const ResponseSpeed = ({ items, sttAvailable }: ResponseSpeedProps) => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AttemptPersistStatus | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const measuredRef = useRef(false);
  const cancelledRef = useRef(false);

  const item = items[index % items.length];

  const clearSpeechCallbacks = () => {
    platform.speech.onStart(null);
    platform.speech.onResult(null);
    platform.speech.onError(null);
    platform.speech.onEnd(null);
  };

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      clearSpeechCallbacks();
      platform.speech.stop();
    };
  }, []);

  const finishAttempt = async (measured: number) => {
    setLatencyMs(measured);
    setMessage(latencyFeedback(measured));
    setPhase('scored');
    platform.speech.stop();
    clearSpeechCallbacks();
    const status = await recordPronunciationAttempt(item.key, { mode: 'speed', latencyMs: Math.round(measured) });
    if (!cancelledRef.current) setSaveStatus(status);
  };

  const start = () => {
    if (!sttAvailable) return;
    setMessage(null);
    setLatencyMs(null);
    setSaveStatus(null);
    measuredRef.current = false;
    startedAtRef.current = null;
    setPhase('listening');

    // onStart marks the recognition-armed instant; the first onResult is the
    // learner's first sound → the difference is time-to-speech-start.
    platform.speech.onStart(() => {
      startedAtRef.current = performance.now();
    });
    platform.speech.onResult((result: SpeechResult) => {
      if (measuredRef.current || startedAtRef.current === null) return;
      if (result.transcript.trim() === '') return;
      measuredRef.current = true;
      void finishAttempt(performance.now() - startedAtRef.current);
    });
    platform.speech.onError((err: PlatformError) => {
      if (cancelledRef.current) return;
      logger.warn('speech_recognition_error', 'response-speed speech recognition reported an error', {
        category: 'AI_DECISION',
        details: { code: err.code, detail: err.detail },
      });
      clearSpeechCallbacks();
      setPhase('ready');
      setMessage(
        err.code === 'no-speech' || err.code === 'timeout'
          ? "Didn't hear a response — press start and answer out loud."
          : errorMessage(err) || 'Listening failed — try again.'
      );
    });
    platform.speech.onEnd(() => {
      if (cancelledRef.current || measuredRef.current) return;
      clearSpeechCallbacks();
      setPhase('ready');
      setMessage("Didn't catch a response — press start and answer out loud.");
    });

    try {
      platform.speech.start({
        language: speakingConfig.recognitionLanguage,
        continuous: false,
        interimResults: true,
      });
    } catch (err) {
      clearSpeechCallbacks();
      setPhase('ready');
      setMessage(errorMessage(err) || 'Could not start listening on this device.');
    }
  };

  const next = () => {
    setIndex((i) => (i + 1) % items.length);
    setPhase('ready');
    setLatencyMs(null);
    setMessage(null);
    setSaveStatus(null);
  };

  if (!sttAvailable) {
    return (
      <p className="text-sm text-ios-gray text-center py-8">
        The response-speed drill needs speech recognition, which isn&apos;t available on this device. Try
        Repeat-after-me or Record-and-compare instead — they work here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-gray font-semibold uppercase tracking-wide text-center">
        Prompt {(index % items.length) + 1} of {items.length}
      </p>

      <div className="bg-card rounded-2xl ios-shadow p-5 text-center space-y-1">
        <p className="text-xs text-ios-gray uppercase tracking-wide">Say this in Portuguese</p>
        <p className="text-lg font-bold">{item.translation ?? item.text}</p>
      </div>

      <p className="text-xs text-ios-gray text-center">
        Answer out loud as fast as you can — we time how quickly you start speaking, not what you say.
      </p>

      <button
        onClick={start}
        disabled={phase === 'listening'}
        className="w-full py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-transform disabled:opacity-50"
      >
        <Timer className="w-4 h-4" />
        <span>{phase === 'listening' ? 'Listening — go!' : 'Start'}</span>
      </button>

      {message && <p className="text-sm text-center font-semibold">{message}</p>}

      {latencyMs !== null && (
        <div className="bg-ios-bg rounded-2xl p-4 text-center space-y-1">
          <p className="text-2xl font-bold">{(latencyMs / 1000).toFixed(1)}s</p>
          <p className="text-xs text-ios-gray">time to start speaking</p>
        </div>
      )}

      <SaveStatusNote status={saveStatus} />

      {phase === 'scored' && (
        <button
          onClick={next}
          className="w-full py-3 bg-card ios-shadow rounded-2xl font-bold text-sm text-ios-blue flex items-center justify-center space-x-1 active:scale-95 transition-transform"
        >
          <span>Next prompt</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
