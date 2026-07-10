// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/tutor/TutorPracticeModal.tsx
// Description: AI practice session modal extracted verbatim from App.tsx: tutor header with
//   help-mode/sound/close controls, markdown transcript with per-message TTS and speaking
//   highlight, loading indicator, and voice-enabled input form. State machine lives in
//   useTutorSession; this is presentational + wiring.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Mic, Send as SendIcon, Sparkles, Volume2, X } from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from '../../lib/utils';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { TUTORS } from '../../data/tutors';
import { learningPlan } from '../../data/curriculum';
import { UserProfile } from '../../types';

interface TutorPracticeModalProps {
  isAIPracticeOpen: boolean;
  profile: UserProfile | null;
  selectedMonth: number;
  isHelpMode: boolean;
  toggleHelpMode: () => void;
  isSoundEnabled: boolean;
  setIsSoundEnabled: (enabled: boolean) => void;
  closeAIPractice: () => void;
  chatHistory: { role: 'user' | 'model', text: string }[];
  isAiLoading: boolean;
  currentlySpeakingIndex: number | null;
  playMessageInChunks: (text: string, index: number) => Promise<void>;
  handleAIPractice: (e: React.FormEvent) => Promise<void>;
  aiMessage: string;
  setAiMessage: (text: string) => void;
  isRecording: boolean;
  toggleRecording: () => void;
}

export const TutorPracticeModal = ({
  isAIPracticeOpen,
  profile,
  selectedMonth,
  isHelpMode,
  toggleHelpMode,
  isSoundEnabled,
  setIsSoundEnabled,
  closeAIPractice,
  chatHistory,
  isAiLoading,
  currentlySpeakingIndex,
  playMessageInChunks,
  handleAIPractice,
  aiMessage,
  setAiMessage,
  isRecording,
  toggleRecording
}: TutorPracticeModalProps) => {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, isAIPracticeOpen, closeAIPractice);

  return (
    <AnimatePresence>
      {isAIPracticeOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="bg-card w-full max-w-lg h-[98vh] rounded-t-[32px] sm:rounded-[40px] overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-ios-bg flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 rounded-full bg-ios-blue flex items-center justify-center text-white mr-4 overflow-hidden shadow-sm">
                  <img
                    src={TUTORS.find(t => t.id === profile?.selected_tutor_id)?.avatar || TUTORS[0].avatar}
                    alt="AI Tutor"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h2 id={titleId} className="text-xl font-bold tracking-tight">AI {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'} Tutor</h2>
                  <p className="text-xs text-ios-gray font-medium">Practicing: {learningPlan[selectedMonth-1].title}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleHelpMode}
                  aria-label={isHelpMode ? "Turn off help mode" : "Turn on help mode"}
                  aria-pressed={isHelpMode}
                  className={cn(
                    "p-2 rounded-full transition-all min-w-[44px] min-h-[44px] flex items-center justify-center",
                    isHelpMode ? "bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-300" : "bg-ios-bg text-ios-gray"
                  )}
                  title="Get Help"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                  aria-label={isSoundEnabled ? "Mute tutor audio" : "Unmute tutor audio"}
                  aria-pressed={isSoundEnabled}
                  className={cn(
                    "p-2 rounded-full transition-all min-w-[44px] min-h-[44px] flex items-center justify-center",
                    isSoundEnabled ? "bg-ios-blue/10 text-ios-blue" : "bg-ios-bg text-ios-gray"
                  )}
                >
                  {isSoundEnabled ? <Volume2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
                </button>
                <button
                  onClick={closeAIPractice}
                  aria-label="Close practice session"
                  className="p-2 bg-ios-bg rounded-full active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {chatHistory.length === 0 && (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-ios-blue/10 text-ios-blue rounded-full flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <p className="text-sm text-ios-gray px-8">
                    Olá! I'm {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'}. Let's practice some Portuguese from Month {selectedMonth}. I'll guide you through today's lesson!
                  </p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={`history-${i}`} className={cn(
                  "flex items-start space-x-2",
                  msg.role === 'user' ? "flex-row-reverse space-x-reverse" : "flex-row"
                )}>
                  <div className={cn(
                    "max-w-[96%] p-5 rounded-2xl text-sm relative group break-words transition-all duration-300",
                    msg.role === 'user' ? "bg-ios-blue text-white rounded-tr-none" : "bg-ios-bg text-text rounded-tl-none",
                    currentlySpeakingIndex === i && msg.role === 'model' ? "ring-2 ring-ios-blue ring-offset-2 scale-[1.02] shadow-lg" : ""
                  )}>
                    <div className="markdown-body">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                    {msg.role === 'model' && (
                      <button
                        onClick={() => playMessageInChunks(msg.text, i)}
                        aria-label={currentlySpeakingIndex === i ? "Playing message audio" : "Play message audio"}
                        className={cn(
                          "absolute -right-10 top-0 p-2 bg-ios-bg rounded-full transition-all text-ios-blue shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center",
                          currentlySpeakingIndex === i ? "opacity-100 scale-110" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <Volume2 className={cn("w-4 h-4", currentlySpeakingIndex === i && "animate-pulse")} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex flex-col items-start space-y-2">
                  <div className="bg-ios-bg p-4 rounded-2xl rounded-tl-none flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-ios-gray rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-ios-gray rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-ios-gray rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <p className="text-[10px] text-ios-gray font-medium ml-1 animate-pulse">Tutor is preparing your lesson...</p>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleAIPractice} className="p-4 bg-ios-bg/30 border-t border-line">
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={aiMessage}
                    onChange={(e) => setAiMessage(e.target.value)}
                    placeholder="Type in Portuguese..."
                    className="w-full p-3 bg-card rounded-2xl outline-none text-sm shadow-sm border border-transparent focus:border-ios-blue/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={toggleRecording}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                    aria-pressed={isRecording}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center",
                      isRecording ? "bg-red-500 text-white animate-pulse" : "text-ios-gray hover:text-ios-blue"
                    )}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={isAiLoading || isRecording || !aiMessage.trim()}
                  aria-label="Send message"
                  className="p-3 bg-ios-blue text-white rounded-2xl shadow-md active:scale-95 transition-all disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <SendIcon className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
