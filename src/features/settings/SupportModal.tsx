// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/SupportModal.tsx
// Description: Support & feedback sheet extracted verbatim from App.tsx: ticket submission
//   form plus diagnostic log collection. Controlled component; state and handlers live in
//   useSettings. This is where the settings submissions section (tickets/logs) lives.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface SupportModalProps {
  isSupportModalOpen: boolean;
  setIsSupportModalOpen: (open: boolean) => void;
  supportSubject: string;
  setSupportSubject: (subject: string) => void;
  supportDescription: string;
  setSupportDescription: (description: string) => void;
  isSubmittingSupport: boolean;
  handleOpenTicket: () => Promise<void>;
  handleCollectLogs: () => Promise<void>;
}

export const SupportModal = ({
  isSupportModalOpen,
  setIsSupportModalOpen,
  supportSubject,
  setSupportSubject,
  supportDescription,
  setSupportDescription,
  isSubmittingSupport,
  handleOpenTicket,
  handleCollectLogs
}: SupportModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleClose = () => setIsSupportModalOpen(false);
  useFocusTrap(dialogRef, isSupportModalOpen, handleClose);
  return (
  <AnimatePresence>
    {isSupportModalOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          className="bg-card w-full max-w-lg rounded-t-[32px] sm:rounded-[40px] overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="p-6 border-b border-ios-bg flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">Support & Feedback</h2>
            <button onClick={handleClose} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto">
            <div className="space-y-4">
              <div className="p-4 bg-ios-blue/5 rounded-2xl border border-ios-blue/10">
                <p className="text-sm text-ios-blue font-medium">
                  Need help or found a bug? Open a ticket or send us your app logs to help us investigate.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="support-ticket-subject" className="text-[10px] font-bold text-ios-gray uppercase tracking-wider ml-1">Subject</label>
                <input
                  id="support-ticket-subject"
                  type="text"
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="e.g., Audio not playing"
                  className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm border border-transparent focus:border-ios-blue/30 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="support-ticket-description" className="text-[10px] font-bold text-ios-gray uppercase tracking-wider ml-1">Description</label>
                <textarea
                  id="support-ticket-description"
                  value={supportDescription}
                  onChange={(e) => setSupportDescription(e.target.value)}
                  placeholder="Please describe the issue in detail..."
                  rows={4}
                  className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm border border-transparent focus:border-ios-blue/30 transition-all resize-none"
                />
              </div>

              <button
                onClick={handleOpenTicket}
                disabled={isSubmittingSupport}
                className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50"
              >
                {isSubmittingSupport ? "Submitting..." : "Submit Ticket"}
              </button>
            </div>

            <div className="pt-6 border-t border-ios-bg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">Diagnostic Logs</h3>
                  <p className="text-xs text-ios-gray">Help us fix issues faster by sharing app state</p>
                </div>
                <button
                  onClick={handleCollectLogs}
                  className="px-4 py-2 bg-ios-bg text-ios-blue rounded-xl text-xs font-bold active:scale-95 transition-all"
                >
                  Send Logs
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
