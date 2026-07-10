// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/Shadowing.tsx
// Description: Shadowing drill (Speaking Coach, CONTENT-ARCHITECTURE §3): the phrase list
//   plays continuously at the chosen speed and the learner speaks along WITH the audio (no
//   capture — simultaneity is the exercise). Supports loop mode and a slow/normal toggle;
//   after a pass the learner self-assesses ("nailed it / close / again") and one attempt row
//   is persisted keyed to the situation (Coach micro-signal included). Works without mic or
//   recognition by design.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Repeat } from 'lucide-react';
import { errorMessage } from '../../../lib/logger';
import { SpeakingItem } from './speakingItems';
import { speakingConfig } from './speakingConfig';
import { AttemptPersistStatus, SelfGrade, recordPronunciationAttempt } from './attempts';
import { playReference, stopReference } from './referenceAudio';
import { PhraseCard, SaveStatusNote, SelfAssessButtons, SpeedToggle } from './SharedControls';

interface ShadowingProps {
  items: SpeakingItem[];
  /** Content pointer the pass-level attempt row is keyed to (situation id). */
  attemptKey: string;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const Shadowing = ({ items, attemptKey }: ShadowingProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState<number>(speakingConfig.defaultPlaybackSpeed);
  const [index, setIndex] = useState(0);
  const [passDone, setPassDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AttemptPersistStatus | null>(null);

  // The async play-loop reads live values through refs so toggles apply mid-pass.
  const runIdRef = useRef(0);
  const loopRef = useRef(loop);
  const speedRef = useRef(speed);

  // Keep the refs in sync with state in an effect (never mutate refs during render).
  useEffect(() => {
    loopRef.current = loop;
    speedRef.current = speed;
  }, [loop, speed]);

  useEffect(
    () => () => {
      runIdRef.current += 1; // invalidate any in-flight pass
      stopReference();
    },
    []
  );

  const stop = () => {
    runIdRef.current += 1;
    stopReference();
    setIsRunning(false);
  };

  const start = async (fromIndex: number) => {
    const runId = ++runIdRef.current;
    setIsRunning(true);
    setPassDone(false);
    setMessage(null);
    setSaveStatus(null);

    let i = fromIndex;
    try {
      for (;;) {
        if (runIdRef.current !== runId) return; // stopped / unmounted
        setIndex(i);
        await playReference(items[i].text, speedRef.current);
        if (runIdRef.current !== runId) return;
        await wait(speakingConfig.shadowGapMs);
        if (runIdRef.current !== runId) return;
        i += 1;
        if (i >= items.length) {
          if (!loopRef.current) break;
          i = 0;
        }
      }
      setIsRunning(false);
      setPassDone(true);
      setMessage('Pass complete — how did shadowing feel?');
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setIsRunning(false);
      setMessage(errorMessage(err) || 'Audio stopped — check your connection and press play to continue.');
    }
  };

  const selfGrade = async (grade: SelfGrade) => {
    setPassDone(false);
    setMessage(
      grade === 'again'
        ? 'Shadowing gets easier every pass — go again when ready.'
        : 'Logged — staying with the voice is the whole skill.'
    );
    const status = await recordPronunciationAttempt(attemptKey, { mode: 'shadow', selfGrade: grade });
    setSaveStatus(status);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ios-gray font-semibold uppercase tracking-wide">
          Phrase {index + 1} of {items.length}
        </p>
        <SpeedToggle speed={speed} onChange={setSpeed} />
      </div>

      <p className="text-xs text-ios-gray text-center">
        Speak along <span className="font-semibold">at the same time</span> as the voice — don&apos;t wait for it to finish.
      </p>

      <PhraseCard item={items[index]} />

      <div className="flex space-x-2">
        <button
          onClick={() => (isRunning ? stop() : void start(index))}
          className="flex-1 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-95 transition-transform"
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{isRunning ? 'Pause' : index > 0 ? 'Resume' : 'Start shadowing'}</span>
        </button>
        <button
          onClick={() => setLoop((v) => !v)}
          aria-pressed={loop}
          className={`px-4 py-3 rounded-2xl font-bold text-sm flex items-center space-x-1 active:scale-95 transition-transform ${
            loop ? 'bg-ios-blue text-white' : 'bg-card ios-shadow text-ios-gray'
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>Loop</span>
        </button>
      </div>

      {message && <p className="text-sm text-center font-semibold">{message}</p>}

      {passDone && <SelfAssessButtons onGrade={selfGrade} />}

      <SaveStatusNote status={saveStatus} />
    </div>
  );
};
