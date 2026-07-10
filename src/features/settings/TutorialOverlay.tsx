// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/TutorialOverlay.tsx
// Description: Five-step app tutorial overlay extracted verbatim from App.tsx (welcome,
//   dashboard, curriculum, AI tutor, settings). Controlled component; step state lives in
//   useSettings.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Home, Mic, Settings, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface TutorialOverlayProps {
  showTutorial: boolean;
  setShowTutorial: (show: boolean) => void;
  tutorialStep: number;
  setTutorialStep: React.Dispatch<React.SetStateAction<number>>;
}

export const TutorialOverlay = ({ showTutorial, setShowTutorial, tutorialStep, setTutorialStep }: TutorialOverlayProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleClose = () => setShowTutorial(false);
  useFocusTrap(dialogRef, showTutorial, handleClose);
  return (
  <AnimatePresence>
    {showTutorial && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card w-full max-w-sm rounded-[40px] p-10 space-y-8 text-center ios-shadow border border-ios-bg"
        >
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 bg-ios-blue/10 rounded-[32px] blur-xl animate-pulse" />
            <div className="relative w-24 h-24 bg-card text-ios-blue rounded-[32px] flex items-center justify-center shadow-xl border border-ios-bg">
              {tutorialStep === 0 && <Sparkles className="w-12 h-12" />}
              {tutorialStep === 1 && <Home className="w-12 h-12" />}
              {tutorialStep === 2 && <BookOpen className="w-12 h-12" />}
              {tutorialStep === 3 && <Mic className="w-12 h-12" />}
              {tutorialStep === 4 && <Settings className="w-12 h-12" />}
            </div>
          </div>

          <div className="space-y-3">
            <h2 id={titleId} className="text-3xl font-bold tracking-tight text-ios-blue">
              {tutorialStep === 0 && "Welcome"}
              {tutorialStep === 1 && "Dashboard"}
              {tutorialStep === 2 && "Curriculum"}
              {tutorialStep === 3 && "AI Tutor"}
              {tutorialStep === 4 && "Settings"}
            </h2>
            <p className="text-base text-ios-gray leading-relaxed px-2">
              {tutorialStep === 0 && "Welcome to FalaMadeira. Let's take a quick tour of your new language learning companion."}
              {tutorialStep === 1 && "Your daily hub. Track your streak, earn XP, and jump straight into today's lesson."}
              {tutorialStep === 2 && "A structured 6-month roadmap. Complete quizzes to unlock new challenges and master the dialect."}
              {tutorialStep === 3 && "The heart of the app. Speak naturally with our AI tutors to perfect your pronunciation."}
              {tutorialStep === 4 && "Choose your tutor, adjust playback speed, and manage your profile with ease."}
            </p>
          </div>

          <div className="flex flex-col space-y-3 pt-4">
            <button
              onClick={() => {
                if (tutorialStep < 4) {
                  setTutorialStep(prev => prev + 1);
                } else {
                  setShowTutorial(false);
                }
              }}
              className="w-full py-5 bg-ios-blue text-white rounded-3xl font-bold text-lg shadow-xl shadow-ios-blue/20 active:scale-95 transition-all"
            >
              {tutorialStep < 4 ? "Continue" : "Start Learning"}
            </button>
            {tutorialStep > 0 && (
              <button
                onClick={() => setTutorialStep(prev => prev - 1)}
                className="w-full py-4 text-ios-gray font-bold text-sm active:scale-95 transition-all"
              >
                Go Back
              </button>
            )}
          </div>

          <div className="flex justify-center space-x-1.5 pt-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  tutorialStep === i ? "w-6 bg-ios-blue" : "w-1.5 bg-ios-bg"
                )}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
