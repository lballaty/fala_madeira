// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/CorrectionModal.tsx
// Description: Lesson correction report modal extracted verbatim from App.tsx. Controlled
//   component; state and submit handler live in useLessonModals.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface CorrectionModalProps {
  isCorrectionModalOpen: boolean;
  setIsCorrectionModalOpen: (open: boolean) => void;
  correctionText: string;
  setCorrectionText: (text: string) => void;
  isCorrectionLoading: boolean;
  handleSubmitCorrection: (e: React.FormEvent) => Promise<void>;
}

export const CorrectionModal = ({
  isCorrectionModalOpen,
  setIsCorrectionModalOpen,
  correctionText,
  setCorrectionText,
  isCorrectionLoading,
  handleSubmitCorrection
}: CorrectionModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleClose = () => {
    setIsCorrectionModalOpen(false);
    setCorrectionText('');
  };
  useFocusTrap(dialogRef, isCorrectionModalOpen, handleClose);
  return (
  <AnimatePresence>
    {isCorrectionModalOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-elevated w-full max-w-md rounded-[32px] overflow-hidden flex flex-col ios-shadow"
        >
          <div className="p-6 border-b border-ios-bg flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">Report Correction</h2>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="p-2 bg-ios-bg rounded-full active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <p className="text-sm text-ios-gray">
                Found an error in this lesson? Please describe the correction below. Our team will review it.
              </p>
              <textarea
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                placeholder="Describe the correction needed..."
                className="w-full bg-ios-bg p-4 rounded-2xl outline-none text-sm min-h-[120px] resize-none"
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleClose}
                className="flex-1 py-4 bg-ios-bg text-ios-gray rounded-2xl font-bold active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCorrection}
                disabled={isCorrectionLoading || !correctionText.trim()}
                className="flex-1 py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {isCorrectionLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                ) : (
                  "Submit"
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
