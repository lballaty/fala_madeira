// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/UserManualModal.tsx
// Description: User manual sheet: learning philosophy, daily ritual, AI-practice guide (read-aloud
//   is opt-in), learning paths + goal chooser, practice modes incl. the Situation Simulator, vocab
//   lookup, offline downloads, navigation (sign-out in the sidebar), in-app help, and voice-practice
//   fair-use copy. Kept in sync with EN-16 (companion to the chat help prompt in _shared/gemini.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09
// Last Updated: 2026-07-15
// Last Updated By: Lane A (with assistant) — EN-16(b) content refresh

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
                  This is the heart of FalaMadeira. Type to your tutor any time, or tap the microphone to
                  speak. Your tutor knows which lesson you're on and guides you through that day's patterns.
                  The tutor no longer reads every reply aloud by default — use the Mute / Unmute control to
                  turn read-aloud on, or tap the play button on any message to hear just that one.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Choose How You Learn</h4>
                <p className="text-sm text-ios-gray leading-relaxed">
                  In Profile → Learning Path you can switch between four paths at any time — your progress is
                  shared across all of them:
                </p>
                <ul className="text-sm text-ios-gray leading-relaxed list-disc pl-5 space-y-1">
                  <li>Structured course — month by month, the app leads.</li>
                  <li>Goal track — pick a life goal (e.g. Survival, Work) and the app orders that track by level. When you choose Goal track, a "Choose your goal" list appears right below — pick one so the app knows which track to follow.</li>
                  <li>Adaptive guided — a ~30-minute daily session built around you.</li>
                  <li>Free — pick any situation, level, or mode yourself.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Practice Modes</h4>
                <p className="text-sm text-ios-gray leading-relaxed">
                  Beyond lessons and the tutor, the Practice area has focused drills — listening, pattern
                  building, and quizzes — plus the Situation Simulator, a role-play where you hold a real
                  conversation (by choosing replies or speaking your own) at difficulty levels 1–5.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Look Up Any Word</h4>
                <p className="text-sm text-ios-gray leading-relaxed">
                  The vocabulary lookup accepts either a Portuguese or an English word and gives you the
                  translation in the right direction. It ignores accents and small typos, so "cafe" still
                  finds "café". Words outside the course vocabulary fall back to an AI translation (online).
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Use It Offline</h4>
                <p className="text-sm text-ios-gray leading-relaxed">
                  In Profile you can download lessons for offline use — by whole track or one situation at a
                  time, so downloads stay small and finish reliably. Audio you play is saved on your device
                  to load faster and cut data use; you can set the storage limit or clear it in Profile.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Getting Around</h4>
                <p className="text-sm text-ios-gray leading-relaxed">
                  Move between Home, Learning, Practice, the Tutor, and Profile from the navigation. Sign Out
                  is always available at the bottom of the navigation sidebar (you no longer have to scroll to
                  the end of Profile to find it). Appearance (light / dark / system), audio speed, your tutor,
                  legal pages, and account settings all live in Profile.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Need Help In The App?</h4>
                <p className="text-sm text-ios-gray leading-relaxed">
                  You can ask the in-app help chat how to do something ("How do I change my level?", "Where
                  are downloads?") and it will point you to the right place. This manual and the Support option
                  (to report a problem or send a message) are both in Profile.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Voice Practice Limits</h4>
                <div className="p-4 bg-gradient-to-br from-ios-blue/5 to-ios-blue/10 rounded-2xl border border-ios-blue/10">
                  <p className="text-xs font-medium text-ios-blue leading-relaxed">
                    FalaMadeira is free to use. Voice practice has a fair-use daily limit that resets every
                    day; your account may have its own limit set for you, otherwise the app default applies.
                    Text chat with your tutor is always available, with no limit.
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
