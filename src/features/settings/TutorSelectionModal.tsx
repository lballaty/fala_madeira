// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/TutorSelectionModal.tsx
// Description: AI tutor persona selection sheet extracted verbatim from App.tsx. Controlled
//   component; selection handler lives in useSettings.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TUTORS } from '../../data/tutors';
import { UserProfile } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface TutorSelectionModalProps {
  isTutorSelectionOpen: boolean;
  setIsTutorSelectionOpen: (open: boolean) => void;
  profile: UserProfile | null;
  handleSelectTutor: (tutorId: string) => Promise<void>;
}

export const TutorSelectionModal = ({
  isTutorSelectionOpen,
  setIsTutorSelectionOpen,
  profile,
  handleSelectTutor
}: TutorSelectionModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleClose = () => setIsTutorSelectionOpen(false);
  useFocusTrap(dialogRef, isTutorSelectionOpen, handleClose);
  return (
  <AnimatePresence>
    {isTutorSelectionOpen && (
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
          className="bg-card w-full max-w-md h-[80vh] rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-ios-bg flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold">Choose Your Tutor</h2>
            <button onClick={handleClose} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {TUTORS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelectTutor(t.id)}
                className={cn(
                  "w-full p-4 rounded-3xl flex items-center space-x-4 transition-all border-2",
                  profile?.selected_tutor_id === t.id ? "border-ios-blue bg-ios-blue/5" : "border-transparent bg-ios-bg"
                )}
              >
                <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 shadow-sm">
                  <img src={t.avatar} alt={t.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="text-left flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{t.name}, {t.age}</h3>
                    {profile?.selected_tutor_id === t.id && <CheckCircle2 className="w-5 h-5 text-ios-blue" />}
                  </div>
                  <p className="text-xs text-ios-gray line-clamp-2">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
