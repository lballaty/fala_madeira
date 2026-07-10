// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/SharedControls.tsx
// Description: Small shared UI pieces for the speaking drills — the "nailed it / close /
//   again" self-assessment button row (record-and-compare, shadowing wrap-up, and the no-STT
//   repeat fallback), the reference playback-speed toggle, the phrase card, and the quiet
//   save-status line ('skipped'/'failed' persistence is shown honestly, never silently).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { SpeakingItem } from './speakingItems';
import { AttemptPersistStatus, SelfGrade } from './attempts';
import { speakingConfig } from './speakingConfig';

// ---------------------------------------------------------------------------
// Self-assessment row
// ---------------------------------------------------------------------------

const SELF_GRADES: { grade: SelfGrade; label: string; className: string }[] = [
  { grade: 'nailed', label: 'Nailed it', className: 'bg-[#34C759] text-white' },
  { grade: 'close', label: 'Close', className: 'bg-ios-blue text-white' },
  { grade: 'again', label: 'Again', className: 'bg-ios-bg text-ios-gray' },
];

export const SelfAssessButtons = ({
  onGrade,
  disabled = false,
}: {
  onGrade: (grade: SelfGrade) => void;
  disabled?: boolean;
}) => (
  <div className="flex space-x-2">
    {SELF_GRADES.map(({ grade, label, className }) => (
      <button
        key={grade}
        onClick={() => onGrade(grade)}
        disabled={disabled}
        className={`flex-1 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform disabled:opacity-50 ${className}`}
      >
        {label}
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Playback-speed toggle (reference audio)
// ---------------------------------------------------------------------------

export const SpeedToggle = ({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (speed: number) => void;
}) => (
  <div className="inline-flex rounded-xl bg-ios-bg p-0.5">
    {speakingConfig.playbackSpeeds.map((option) => (
      <button
        key={option}
        onClick={() => onChange(option)}
        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
          speed === option ? 'bg-card ios-shadow text-ios-blue' : 'text-ios-gray'
        }`}
      >
        {option === 1 ? 'Normal' : 'Slow'}
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Phrase card
// ---------------------------------------------------------------------------

export const PhraseCard = ({ item, hideText = false }: { item: SpeakingItem; hideText?: boolean }) => (
  <div className="bg-card rounded-2xl ios-shadow p-5 space-y-1 text-center">
    {hideText ? (
      <p className="text-lg font-bold text-ios-gray">Say it in Portuguese…</p>
    ) : (
      <p className="text-lg font-bold">{item.text}</p>
    )}
    {item.translation && <p className="text-sm text-ios-gray">{item.translation}</p>}
    {!hideText && item.pronunciation && (
      <p className="text-xs text-ios-gray italic">{item.pronunciation}</p>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Persistence status (honest, quiet)
// ---------------------------------------------------------------------------

export const SaveStatusNote = ({ status }: { status: AttemptPersistStatus | null }) => {
  if (status === null || status === 'persisted') return null;
  return (
    <p className="text-[11px] text-ios-gray text-center">
      {status === 'skipped'
        ? 'Progress not saved — sign in to keep your pronunciation history.'
        : 'Could not save this attempt right now — your practice still counts here.'}
    </p>
  );
};
