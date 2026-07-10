// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/RequestLessonModal.tsx
// Description: Lesson theme request modal extracted verbatim from App.tsx. Controlled
//   component; state and submit handler live in useLessonModals.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface RequestLessonModalProps {
  isRequestModalOpen: boolean;
  setIsRequestModalOpen: (open: boolean) => void;
  requestTheme: string;
  setRequestTheme: (theme: string) => void;
  requestDesc: string;
  setRequestDesc: (desc: string) => void;
  handleRequestLesson: (e: React.FormEvent) => Promise<void>;
}

export const RequestLessonModal = ({
  isRequestModalOpen,
  setIsRequestModalOpen,
  requestTheme,
  setRequestTheme,
  requestDesc,
  setRequestDesc,
  handleRequestLesson
}: RequestLessonModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, isRequestModalOpen, () => setIsRequestModalOpen(false));
  return (
  <AnimatePresence>
    {isRequestModalOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-elevated w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
        >
          <div className="p-6 border-b border-ios-bg flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold">Request Lesson</h2>
            <button onClick={() => setIsRequestModalOpen(false)} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleRequestLesson} className="p-6 space-y-4">
            <div className="space-y-1">
              <label htmlFor="request-lesson-theme" className="text-[10px] font-bold text-ios-gray uppercase ml-1">Theme / Subject</label>
              <input
                id="request-lesson-theme"
                type="text"
                value={requestTheme}
                onChange={(e) => setRequestTheme(e.target.value)}
                placeholder="e.g., Wine Tasting, Football..."
                className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="request-lesson-description" className="text-[10px] font-bold text-ios-gray uppercase ml-1">Description</label>
              <textarea
                id="request-lesson-description"
                value={requestDesc}
                onChange={(e) => setRequestDesc(e.target.value)}
                placeholder="What would you like to learn?"
                className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm h-32 resize-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
            >
              Submit Request
            </button>
          </form>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
