// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/patterns/SlottedPatternDrill.tsx
// Description: Slot-substitution drill card for the Pattern Builder (docs/ui-mockup/
//   intended-ui-v3.html "Pattern builder" screen). Renders the base phrase with the active
//   slot value highlighted, one chip row per drillable slot (tap a chip → the slot text swaps
//   live), a "Hear it" button that speaks the currently ASSEMBLED phrase via TTS, and the
//   self-grade row (got it / almost / missed). Mount with key={pattern.id} so chip selections
//   reset per pattern. Pure presentation — composition/grading semantics live in ./drill.ts.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { Fragment, useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { PhrasePattern } from '../../../content';
import {
  assemblePhrase,
  defaultSelections,
  drillableSlots,
  parseBaseSegments,
  slotValue,
  type PatternGrade,
  type SlotSelections,
} from './drill';
import { GradeRow } from './GradeRow';

interface SlottedPatternDrillProps {
  pattern: PhrasePattern;
  onGrade: (grade: PatternGrade, assembledPhrase: string) => void;
  playPhrase: (text: string) => void;
  isPlaying: boolean;
}

export const SlottedPatternDrill = ({ pattern, onGrade, playPhrase, isPlaying }: SlottedPatternDrillProps) => {
  const [selections, setSelections] = useState<SlotSelections>(() => defaultSelections(pattern));
  const slots = drillableSlots(pattern);
  const assembled = assemblePhrase(pattern, selections);

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-gray text-center">
        One base phrase → many real situations. Tap a chip to swap the slot.
      </p>

      {/* Phrase card: base text with live slot values highlighted (mockup chip-swap card) */}
      <div className="bg-card rounded-2xl ios-shadow px-4 py-6 text-center space-y-2">
        <p className="text-lg font-bold leading-relaxed">
          {parseBaseSegments(pattern.base).map((segment, i) =>
            segment.kind === 'text' ? (
              <Fragment key={i}>{segment.text}</Fragment>
            ) : (
              <span key={i} className="text-[#5856D6] bg-[#5856D6]/10 px-1.5 py-0.5 rounded-lg">
                {slotValue(pattern, segment.name, selections)}
              </span>
            ),
          )}
        </p>
        {pattern.translation && <p className="text-xs text-ios-gray">{pattern.translation}</p>}
        <button
          onClick={() => playPhrase(assembled)}
          className="mt-2 px-5 py-2.5 bg-ios-bg rounded-xl text-sm font-semibold inline-flex items-center space-x-2 active:scale-95 transition-transform"
        >
          <Volume2 className={`w-4 h-4 ${isPlaying ? 'text-[#5856D6] animate-pulse' : 'text-ios-blue'}`} />
          <span>Hear it</span>
        </button>
      </div>

      {/* One chip row per drillable slot; tapping swaps that slot's text live */}
      {slots.map((slot) => (
        <div key={slot.name} className="space-y-1.5">
          {slots.length > 1 && (
            <p className="text-[10px] font-bold text-ios-gray uppercase text-center">
              {slot.description ?? slot.name}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {slot.options.map((option, index) => {
              const isActive = (selections[slot.name] ?? 0) === index;
              return (
                <button
                  key={`${slot.name}-${option}`}
                  onClick={() => {
                    const next = { ...selections, [slot.name]: index };
                    setSelections(next);
                    // Chip tap speaks the newly assembled phrase — hear the variation
                    // immediately (core loop "Vary" step, CONTENT-ARCHITECTURE §5).
                    playPhrase(assemblePhrase(pattern, next));
                  }}
                  aria-pressed={isActive}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-colors active:scale-95 ${
                    isActive ? 'bg-[#5856D6] text-white' : 'bg-card text-ios-gray ios-shadow'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-[11px] text-ios-gray text-center">
        Say each one out loud — the pattern is the point, not the words.
      </p>

      <GradeRow onGrade={(grade) => onGrade(grade, assembled)} />
    </div>
  );
};
