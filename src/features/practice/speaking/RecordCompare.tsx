// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/RecordCompare.tsx
// Description: Record-and-compare drill (Pronunciation Trainer, CONTENT-ARCHITECTURE §3):
//   record the learner via the platform audio adapter, then play the user's recording and the
//   TTS reference side by side so they self-assess ("nailed it / close / again"). No automated
//   score — hearing yourself against the model is the exercise. Persists a self-graded
//   pronunciation_attempts row (audio_ref stays null — the recorded Blob is held in memory
//   only for playback this session; the AUDIO UPLOAD SEAM in ./attempts.ts is where uploads
//   land later). Degrades honestly: no recording support → reference-only listen + self-grade.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';
import { platform, PlatformError } from '../../../platform';
import { errorMessage } from '../../../lib/logger';
import { SpeakingItem } from './speakingItems';
import { speakingConfig } from './speakingConfig';
import { AttemptPersistStatus, SelfGrade, recordPronunciationAttempt } from './attempts';
import { playReference, stopReference } from './referenceAudio';
import { PhraseCard, SaveStatusNote, SelfAssessButtons, SpeedToggle } from './SharedControls';

interface RecordCompareProps {
  items: SpeakingItem[];
  recordingSupported: boolean;
}

type Phase = 'idle' | 'recording' | 'recorded';

const friendlyRecordError = (err: unknown): string => {
  if (err instanceof PlatformError && err.code === 'permission-denied') {
    return 'Microphone access was denied. Allow it to record and compare — or just listen to the reference.';
  }
  return errorMessage(err) || 'Recording failed — try again, or listen to the reference instead.';
};

export const RecordCompare = ({ items, recordingSupported }: RecordCompareProps) => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [speed, setSpeed] = useState<number>(speakingConfig.defaultPlaybackSpeed);
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AttemptPersistStatus | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const revokeRecording = () => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      stopReference();
      revokeRecording();
    };
  }, []);

  const item = items[index % items.length];

  const resetForItem = () => {
    revokeRecording();
    setPhase('idle');
    setMessage(null);
    setSaveStatus(null);
  };

  const startRecording = async () => {
    setMessage(null);
    try {
      await platform.audio.startRecording();
      if (cancelledRef.current) return;
      setPhase('recording');
    } catch (err) {
      if (!cancelledRef.current) setMessage(friendlyRecordError(err));
    }
  };

  const stopRecording = async () => {
    try {
      const blob = await platform.audio.stopRecording();
      if (cancelledRef.current) return;
      revokeRecording();
      recordingUrlRef.current = URL.createObjectURL(blob);
      setPhase('recorded');
      setMessage('Now compare: play yours, then the reference.');
    } catch (err) {
      if (!cancelledRef.current) {
        setMessage(friendlyRecordError(err));
        setPhase('idle');
      }
    }
  };

  const playMine = async () => {
    if (!recordingUrlRef.current) return;
    stopReference();
    try {
      await platform.audio.play(recordingUrlRef.current);
    } catch (err) {
      if (!cancelledRef.current) setMessage(errorMessage(err) || 'Could not play your recording.');
    }
  };

  const playRef = async () => {
    setMessage(null);
    try {
      await playReference(item.text, speed);
    } catch (err) {
      if (!cancelledRef.current) setMessage(errorMessage(err) || 'Could not play the reference audio.');
    }
  };

  const selfGrade = async (grade: SelfGrade) => {
    setMessage(
      grade === 'nailed'
        ? 'Nice — that comparison is how the ear learns.'
        : grade === 'close'
          ? 'Close — record it once more and compare again.'
          : 'All good — go again whenever you like.'
    );
    const status = await recordPronunciationAttempt(item.key, { mode: 'compare', selfGrade: grade });
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

      {!recordingSupported && (
        <p className="text-xs text-ios-gray text-center">
          Recording isn&apos;t available on this device — listen to the reference, say it out loud, and rate yourself.
        </p>
      )}

      {recordingSupported && (
        <button
          onClick={() => (phase === 'recording' ? void stopRecording() : void startRecording())}
          className={`w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-transform ${
            phase === 'recording' ? 'bg-[#FF3B30] text-white' : 'bg-card ios-shadow text-[#FF3B30]'
          }`}
        >
          {phase === 'recording' ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          <span>{phase === 'recording' ? 'Stop recording' : 'Record yourself'}</span>
        </button>
      )}

      <div className="flex space-x-2">
        {phase === 'recorded' && recordingSupported && (
          <button
            onClick={playMine}
            className="flex-1 py-3 bg-ios-bg rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-transform"
          >
            <Volume2 className="w-4 h-4" />
            <span>Play mine</span>
          </button>
        )}
        <button
          onClick={playRef}
          className="flex-1 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-transform"
        >
          <Volume2 className="w-4 h-4" />
          <span>Reference</span>
        </button>
      </div>

      {message && <p className="text-sm text-center font-semibold">{message}</p>}

      {(phase === 'recorded' || !recordingSupported) && (
        <div className="space-y-2">
          <p className="text-sm text-center font-semibold">How close was it?</p>
          <SelfAssessButtons onGrade={selfGrade} />
        </div>
      )}

      <SaveStatusNote status={saveStatus} />

      {(phase === 'recorded' || saveStatus !== null) && (
        <button
          onClick={next}
          className="w-full py-3 bg-card ios-shadow rounded-2xl font-bold text-sm text-ios-blue active:scale-95 transition-transform"
        >
          Next phrase
        </button>
      )}
    </div>
  );
};
