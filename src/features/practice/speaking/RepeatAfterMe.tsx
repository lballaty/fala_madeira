// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/RepeatAfterMe.tsx
// Description: Repeat-after-me drill (Speaking Coach core, CONTENT-ARCHITECTURE §3): play the
//   TTS reference, the learner repeats, speech recognition compares the transcript against
//   the target (normalized word-level Levenshtein — ./accuracy.ts) and gives forgiving
//   feedback. Degrades honestly: without recognition the same flow runs with self-assessment
//   buttons instead of a score (never a dead button). Every result persists an append-only
//   pronunciation_attempts row and emits the Coach micro-signal (./attempts.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Ear, Mic, Volume2 } from 'lucide-react';
import { platform, PlatformError } from '../../../platform';
import { errorMessage } from '../../../lib/logger';
import { SpeakingItem } from './speakingItems';
import { speakingConfig } from './speakingConfig';
import { wordAccuracy, WordAccuracyResult } from './accuracy';
import { AttemptPersistStatus, SelfGrade, recordPronunciationAttempt } from './attempts';
import { playReference, stopReference } from './referenceAudio';
import { PhraseCard, SaveStatusNote, SelfAssessButtons, SpeedToggle } from './SharedControls';

interface RepeatAfterMeProps {
  items: SpeakingItem[];
  sttAvailable: boolean;
}

type Phase = 'idle' | 'playing' | 'listening' | 'awaiting-self-grade' | 'scored';

const friendlySpeechError = (err: unknown): string => {
  if (err instanceof PlatformError) {
    switch (err.code) {
      case 'no-speech':
      case 'timeout':
        return "Didn't catch anything — get a little closer to the mic and try again.";
      case 'permission-denied':
        return 'Microphone access was denied. Allow it in your browser/OS settings to get scoring.';
      case 'unavailable':
        return 'Speech recognition is not available on this device.';
      default:
        return errorMessage(err) || 'Listening failed — try again.';
    }
  }
  return errorMessage(err) || 'Listening failed — try again.';
};

const accuracyFeedback = (result: WordAccuracyResult): string => {
  if (result.accuracy >= speakingConfig.greatAccuracy) return 'Nailed it — that sounded right!';
  if (result.accuracy >= speakingConfig.closeAccuracy) {
    return result.missingWords.length > 0
      ? `Close! Listen again for: ${result.missingWords.join(', ')}`
      : 'Close! One more listen and you have it.';
  }
  return 'Good try — play it once more and repeat it in chunks.';
};

export const RepeatAfterMe = ({ items, sttAvailable }: RepeatAfterMeProps) => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [speed, setSpeed] = useState<number>(speakingConfig.defaultPlaybackSpeed);
  const [result, setResult] = useState<WordAccuracyResult | null>(null);
  const [recognized, setRecognized] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AttemptPersistStatus | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      stopReference();
      platform.speech.stop();
    };
  }, []);

  const item = items[index % items.length];

  const resetForItem = () => {
    setPhase('idle');
    setResult(null);
    setRecognized(null);
    setMessage(null);
    setSaveStatus(null);
  };

  const listen = async () => {
    setPhase('playing');
    setMessage(null);
    try {
      await playReference(item.text, speed);
    } catch (err) {
      if (!cancelledRef.current) {
        setMessage(errorMessage(err) || 'Could not play the reference audio — check your connection.');
        setPhase('idle');
        return;
      }
    }
    if (cancelledRef.current) return;
    // Without recognition the learner still repeats aloud, then self-assesses.
    setPhase(sttAvailable ? 'idle' : 'awaiting-self-grade');
  };

  const speak = async () => {
    setPhase('listening');
    setMessage(null);
    try {
      const transcript = await platform.speech.recognize({
        language: speakingConfig.recognitionLanguage,
        timeoutMs: speakingConfig.recognizeTimeoutMs,
      });
      if (cancelledRef.current) return;
      const scored = wordAccuracy(item.text, transcript);
      setRecognized(transcript);
      setResult(scored);
      setMessage(accuracyFeedback(scored));
      setPhase('scored');
      const status = await recordPronunciationAttempt(item.key, {
        mode: 'repeat',
        accuracy: Number(scored.accuracy.toFixed(3)),
      });
      if (!cancelledRef.current) setSaveStatus(status);
    } catch (err) {
      if (cancelledRef.current) return;
      setMessage(friendlySpeechError(err));
      setPhase('idle');
    }
  };

  const selfGrade = async (grade: SelfGrade) => {
    setPhase('scored');
    setMessage(
      grade === 'nailed'
        ? 'Great — trust that ear!'
        : grade === 'close'
          ? 'Close counts — one more listen locks it in.'
          : 'No problem — replay it and try again whenever you like.'
    );
    const status = await recordPronunciationAttempt(item.key, { mode: 'repeat', selfGrade: grade });
    if (!cancelledRef.current) setSaveStatus(status);
  };

  const next = () => {
    setIndex((i) => (i + 1) % items.length);
    resetForItem();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ios-gray font-semibold uppercase tracking-wide">
          Phrase {(index % items.length) + 1} of {items.length}
        </p>
        <SpeedToggle speed={speed} onChange={setSpeed} />
      </div>

      <PhraseCard item={item} />

      {!sttAvailable && (
        <p className="text-xs text-ios-gray text-center">
          Speech recognition isn&apos;t available on this device — repeat out loud and rate yourself instead.
        </p>
      )}

      <div className="flex space-x-2">
        <button
          onClick={listen}
          disabled={phase === 'playing' || phase === 'listening'}
          className="flex-1 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-transform disabled:opacity-50"
        >
          <Volume2 className="w-4 h-4" />
          <span>{phase === 'playing' ? 'Playing…' : 'Listen'}</span>
        </button>
        {sttAvailable && (
          <button
            onClick={speak}
            disabled={phase === 'playing' || phase === 'listening'}
            className="flex-1 py-3 bg-[#FF3B30] text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            <Mic className="w-4 h-4" />
            <span>{phase === 'listening' ? 'Listening…' : 'Speak'}</span>
          </button>
        )}
      </div>

      {phase === 'awaiting-self-grade' && (
        <div className="space-y-2">
          <p className="text-sm text-center font-semibold">Say it out loud — how did it go?</p>
          <SelfAssessButtons onGrade={selfGrade} />
        </div>
      )}

      {message && <p className="text-sm text-center font-semibold">{message}</p>}

      {result && recognized !== null && (
        <div className="bg-ios-bg rounded-2xl p-4 space-y-1 text-center">
          <p className="text-xs text-ios-gray flex items-center justify-center space-x-1">
            <Ear className="w-3 h-3" />
            <span>Heard: “{recognized}”</span>
          </p>
          <p className="text-2xl font-bold">{Math.round(result.accuracy * 100)}%</p>
          <p className="text-xs text-ios-gray">word accuracy</p>
        </div>
      )}

      <SaveStatusNote status={saveStatus} />

      {phase === 'scored' && (
        <button
          onClick={next}
          className="w-full py-3 bg-card ios-shadow rounded-2xl font-bold text-sm text-ios-blue flex items-center justify-center space-x-1 active:scale-95 transition-transform"
        >
          <span>Next phrase</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
