// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/patterns/GradeRow.tsx
// Description: Shared self-grade row for Pattern Builder drills — the three-way recall grade
//   (got it / almost / missed) both the slotted and the degraded phrase drill emit through
//   drill.ts emitPatternGrade (the Coach signal, CONTENT-ARCHITECTURE §6b). Presentation only;
//   the parent owns advancing the queue and emitting the signal.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { Check, Minus, X } from 'lucide-react';
import { GRADE_LABELS, type PatternGrade } from './drill';

// iOS system palette accents (only ios-blue/gray/bg are theme tokens in index.css;
// accent colors follow the codebase's arbitrary-value convention, e.g. bg-[#5856D6]).
const GRADE_STYLES: Record<PatternGrade, { button: string; Icon: typeof Check }> = {
  'got-it': { button: 'bg-[#34C759]/10 text-[#34C759]', Icon: Check },
  almost: { button: 'bg-[#FF9F0A]/10 text-[#FF9F0A]', Icon: Minus },
  missed: { button: 'bg-[#FF3B30]/10 text-[#FF3B30]', Icon: X },
};

interface GradeRowProps {
  onGrade: (grade: PatternGrade) => void;
}

export const GradeRow = ({ onGrade }: GradeRowProps) => (
  <div className="space-y-2">
    <p className="text-[10px] font-bold text-ios-gray uppercase text-center">How did it go?</p>
    <div className="grid grid-cols-3 gap-2">
      {(Object.keys(GRADE_STYLES) as PatternGrade[]).map((grade) => {
        const { button, Icon } = GRADE_STYLES[grade];
        return (
          <button
            key={grade}
            onClick={() => onGrade(grade)}
            className={`py-3 rounded-2xl text-xs font-bold flex flex-col items-center space-y-1 active:scale-95 transition-transform ${button}`}
          >
            <Icon className="w-4 h-4" />
            <span>{GRADE_LABELS[grade]}</span>
          </button>
        );
      })}
    </div>
  </div>
);
