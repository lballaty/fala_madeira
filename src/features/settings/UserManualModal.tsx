// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/UserManualModal.tsx
// Description: User manual sheet extracted from App.tsx: learning philosophy, daily
//   ritual, AI practice guide, and voice-practice fair-use copy (free launch).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface UserManualModalProps {
  isUserManualOpen: boolean;
  setIsUserManualOpen: (open: boolean) => void;
}

export const UserManualModal = ({ isUserManualOpen, setIsUserManualOpen }: UserManualModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleClose = () => setIsUserManualOpen(false);
  useFocusTrap(dialogRef, isUserManualOpen, handleClose);
  return (
  <AnimatePresence>
    {isUserManualOpen && (
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
          className="bg-card w-full max-w-md h-[80vh] rounded-[32px] overflow-hidden flex flex-col ios-shadow"
        >
          <div className="p-6 border-b border-ios-bg flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">User Manual</h2>
            <button onClick={handleClose} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
            <div className="space-y-6">
              <section className="space-y-2">
                <h3 className="text-ios-blue font-bold text-lg">The Learning Philosophy</h3>
                <p className="text-sm text-ios-gray leading-relaxed">
                  FalaMadeira isn't just about grammar; it's about **culture and connection**. Our curriculum is designed to take you from zero to conversational in 6 months, focusing on the specific phonetic nuances and vocabulary of the Madeira archipelago.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Your Daily Ritual</h4>
                <ul className="space-y-3">
                  <li className="flex items-start space-x-3">
                    <div className="w-5 h-5 bg-ios-blue/10 rounded-full flex items-center justify-center text-ios-blue mt-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                    <p className="text-sm text-ios-gray flex-1">**The Dashboard:** Every day, you'll see a featured lesson. We recommend following the sequence.</p>
                  </li>
                  <li className="flex items-start space-x-3">
                    <div className="w-5 h-5 bg-ios-blue/10 rounded-full flex items-center justify-center text-ios-blue mt-0.5">
                      <Check className="w-3 h-3" />
                    </div>
                    <p className="text-sm text-ios-gray flex-1">**Streak & XP:** Consistency is key. Your streak tracks consecutive days of practice.</p>
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">AI Practice: Your 24/7 Tutor</h4>
                <p className="text-sm text-ios-gray leading-relaxed">
                  This is the heart of FalaMadeira. Speak naturally using the microphone icon. Your tutor knows exactly which lesson you're on and will guide you through the specific patterns of that day.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Voice Practice Limits</h4>
                <div className="p-4 bg-gradient-to-br from-ios-blue/5 to-ios-blue/10 rounded-2xl border border-ios-blue/10">
                  <p className="text-xs font-medium text-ios-blue leading-relaxed">
                    FalaMadeira is free to use. Voice practice has a fair-use daily limit that
                    resets every day — text chat with your tutor is always available.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
