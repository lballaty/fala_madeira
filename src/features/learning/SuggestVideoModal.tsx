// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/SuggestVideoModal.tsx
// Description: YouTube video suggestion modal extracted verbatim from App.tsx. Controlled
//   component; state and submit handler live in useLessonModals.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface SuggestVideoModalProps {
  isSuggestionModalOpen: boolean;
  setIsSuggestionModalOpen: (open: boolean) => void;
  suggestionUrl: string;
  setSuggestionUrl: (url: string) => void;
  suggestionNote: string;
  setSuggestionNote: (note: string) => void;
  handleSuggestVideo: () => Promise<void>;
}

export const SuggestVideoModal = ({
  isSuggestionModalOpen,
  setIsSuggestionModalOpen,
  suggestionUrl,
  setSuggestionUrl,
  suggestionNote,
  setSuggestionNote,
  handleSuggestVideo
}: SuggestVideoModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, isSuggestionModalOpen, () => setIsSuggestionModalOpen(false));
  return (
  <AnimatePresence>
    {isSuggestionModalOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-elevated w-full max-w-sm rounded-[32px] p-6 space-y-6 ios-shadow"
        >
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">Suggest a Video</h2>
            <button onClick={() => setIsSuggestionModalOpen(false)} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="suggest-video-url" className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">YouTube URL</label>
              <input
                id="suggest-video-url"
                type="text"
                value={suggestionUrl}
                onChange={(e) => setSuggestionUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full p-4 bg-ios-bg rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue/20"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="suggest-video-note" className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Note (Optional)</label>
              <textarea
                id="suggest-video-note"
                value={suggestionNote}
                onChange={(e) => setSuggestionNote(e.target.value)}
                placeholder="Why is this video good for this lesson?"
                className="w-full p-4 bg-ios-bg rounded-2xl text-sm h-24 focus:outline-none focus:ring-2 focus:ring-ios-blue/20 resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSuggestVideo}
            className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
          >
            Submit Suggestion
          </button>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
