// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/LessonDetailModal.tsx
// Description: Lesson detail bottom sheet extracted verbatim from App.tsx: video, goals,
//   background, patterns and vocabulary with TTS playback, plus entry points to practice
//   session, quiz, vocab lookup, video suggestion, and correction report.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Search, Volume2, X, Youtube } from 'lucide-react';
import { Lesson } from '../../types';
import { VideoPlayer } from '../../components/VideoPlayer';
import { AudioButton } from '../../components/AudioButton';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface LessonDetailModalProps {
  selectedLesson: Lesson | null;
  setSelectedLesson: (lesson: Lesson | null) => void;
  playSpeech: (text: string) => void;
  startAIPractice: (lesson: Lesson, isHelp?: boolean) => Promise<void>;
  openQuiz: () => void;
  setIsVocabModalOpen: (open: boolean) => void;
  setIsSuggestionModalOpen: (open: boolean) => void;
  setIsCorrectionModalOpen: (open: boolean) => void;
}

export const LessonDetailModal = ({
  selectedLesson,
  setSelectedLesson,
  playSpeech,
  startAIPractice,
  openQuiz,
  setIsVocabModalOpen,
  setIsSuggestionModalOpen,
  setIsCorrectionModalOpen
}: LessonDetailModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, selectedLesson !== null, () => setSelectedLesson(null));
  return (
  <AnimatePresence>
    {selectedLesson && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          className="bg-elevated w-full max-w-md h-[90vh] rounded-t-[40px] overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-ios-bg flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold">Lesson Details</h2>
            <button onClick={() => setSelectedLesson(null)} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
            {selectedLesson.video_url && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider flex items-center">
                  <Youtube className="w-3 h-3 mr-1 text-red-500" />
                  <span>Video Lesson</span>
                </h4>
                <VideoPlayer url={selectedLesson.video_url} />
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-2xl font-bold">{selectedLesson.title}</h3>
              <p className="text-ios-gray">{selectedLesson.description}</p>
            </div>

            {selectedLesson.goals && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Lesson Goals</h4>
                <ul className="space-y-2">
                  {selectedLesson.goals.map((goal, i) => (
                    <li key={i} className="flex items-start space-x-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedLesson.explanation && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Background & Context</h4>
                <div className="p-4 bg-ios-bg rounded-2xl text-sm leading-relaxed">
                  {selectedLesson.explanation}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Common Patterns</h4>
              <div className="space-y-2">
                {selectedLesson.patterns.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-ios-bg rounded-2xl">
                    <span className="font-medium text-sm">{p}</span>
                    <AudioButton onPlay={() => playSpeech(p)} label="Play pronunciation" />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Vocabulary</h4>
              <div className="grid grid-cols-1 gap-2">
                {selectedLesson.vocabulary.map((v, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border-b border-ios-bg last:border-0">
                    <div>
                      <p className="font-bold text-sm">{v.word}</p>
                      <p className="text-xs text-ios-gray">{v.translation}</p>
                    </div>
                    <AudioButton onPlay={() => playSpeech(v.word)} label="Play pronunciation" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 bg-elevated border-t border-ios-bg space-y-3">
            <button
              onClick={() => {
                if (selectedLesson) startAIPractice(selectedLesson);
              }}
              className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
            >
              Start Practice Session
            </button>
            <button
              onClick={openQuiz}
              className="w-full py-4 bg-ios-bg text-ios-blue rounded-2xl font-bold active:scale-95 transition-transform"
            >
              Start Practice Quiz
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setIsVocabModalOpen(true)}
                className="py-3 bg-ios-bg text-ios-blue rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1"
              >
                <Search className="w-4 h-4" />
                <span>Vocab</span>
              </button>
              <button
                onClick={() => setIsSuggestionModalOpen(true)}
                className="py-3 bg-ios-bg text-ios-blue rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1"
              >
                <Youtube className="w-4 h-4" />
                <span>Suggest Video</span>
              </button>
              <button
                onClick={() => setIsCorrectionModalOpen(true)}
                className="py-3 bg-ios-bg text-ios-gray rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Correction</span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
