// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/patterns/PhraseDrill.tsx
// Description: Degraded pattern drill for bare {id, base} phrase patterns (the seed-content
//   reality until the enrichment step fills slots/variants). Sequential recall card: prompt
//   side first (EN translation when authored; otherwise audio-first — tap-to-hear with the
//   Portuguese hidden), reveal the PT phrase, tap-to-hear any time, then self-grade recall
//   (got it / almost / missed → Coach signal via the parent). Mount with key={pattern.id} so
//   the reveal state resets per pattern.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useState } from 'react';
import { Eye, Volume2 } from 'lucide-react';
import type { PhrasePattern } from '../../../content';
import type { PatternGrade } from './drill';
import { GradeRow } from './GradeRow';

interface PhraseDrillProps {
  pattern: PhrasePattern;
  onGrade: (grade: PatternGrade, phrase: string) => void;
  playPhrase: (text: string) => void;
  isPlaying: boolean;
}

export const PhraseDrill = ({ pattern, onGrade, playPhrase, isPlaying }: PhraseDrillProps) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const hasTranslation = Boolean(pattern.translation);

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-gray text-center">
        {hasTranslation
          ? 'Say it in Portuguese before you reveal it.'
          : 'Listen first, say it back, then reveal to check yourself.'}
      </p>

      {/* Recall card: prompt → reveal → hear */}
      <div className="bg-card rounded-2xl ios-shadow px-4 py-6 text-center space-y-3">
        {hasTranslation && <p className="text-sm text-ios-gray">{pattern.translation}</p>}

        {isRevealed ? (
          <p className="text-lg font-bold leading-relaxed">{pattern.base}</p>
        ) : (
          <button
            onClick={() => setIsRevealed(true)}
            className="w-full py-4 bg-ios-bg rounded-xl text-sm font-semibold text-ios-blue inline-flex items-center justify-center space-x-2 active:scale-95 transition-transform"
          >
            <Eye className="w-4 h-4" />
            <span>Reveal the Portuguese</span>
          </button>
        )}

        <button
          onClick={() => playPhrase(pattern.base)}
          className="px-5 py-2.5 bg-ios-bg rounded-xl text-sm font-semibold inline-flex items-center space-x-2 active:scale-95 transition-transform"
        >
          <Volume2 className={`w-4 h-4 ${isPlaying ? 'text-[#5856D6] animate-pulse' : 'text-ios-blue'}`} />
          <span>Hear it</span>
        </button>
      </div>

      {/* Self-grading only makes sense once the answer is visible */}
      {isRevealed ? (
        <GradeRow onGrade={(grade) => onGrade(grade, pattern.base)} />
      ) : (
        <p className="text-[11px] text-ios-gray text-center">
          Reveal the phrase to grade your recall.
        </p>
      )}
    </div>
  );
};
