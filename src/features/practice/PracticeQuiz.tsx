// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/PracticeQuiz.tsx
// Description: Practice-slice quiz gate extracted from App.tsx. Mounts the shared Quiz
//   component for the selected lesson when the practice slice opens it. Mounted at App-shell
//   level; the future practice hub expands from this slice.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { Quiz } from '../../components/Quiz';
import { Lesson } from '../../types';

interface PracticeQuizProps {
  isQuizOpen: boolean;
  selectedLesson: Lesson | null;
  onComplete: (score: number) => void;
  onClose: () => void;
  playSpeech: (text: string) => void;
}

export const PracticeQuiz = ({ isQuizOpen, selectedLesson, onComplete, onClose, playSpeech }: PracticeQuizProps) => {
  if (!isQuizOpen || !selectedLesson) return null;
  return (
    <Quiz
      lesson={selectedLesson}
      onComplete={onComplete}
      onClose={onClose}
      playSpeech={playSpeech}
    />
  );
};
