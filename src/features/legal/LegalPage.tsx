// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/legal/LegalPage.tsx
// Description: Renders any of the three legal documents (Terms / Privacy / AI Disclosure)
//   in a consistent bottom-sheet modal (same pattern as settings/SupportModal): draft
//   banner, version + last-updated line, intro, then generically rendered sections.
//   Controlled component — pass `doc` (or null to hide) and `onClose`. Reused by
//   SettingsView, AuthScreen, and (later) onboarding.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { LegalDocId, LegalDocument } from './types';
import { TERMS_OF_SERVICE } from './terms';
import { PRIVACY_POLICY } from './privacy';
import { AI_USE_DISCLOSURE } from './ai-use';

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
  'ai-use': AI_USE_DISCLOSURE,
};

interface LegalPageProps {
  /** Which document to show; null hides the page. */
  doc: LegalDocId | null;
  onClose: () => void;
}

export const LegalPage = ({ doc, onClose }: LegalPageProps) => {
  const activeDoc = doc ? LEGAL_DOCUMENTS[doc] : null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, activeDoc !== null, onClose);

  return (
    <AnimatePresence>
      {activeDoc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="bg-card w-full max-w-lg rounded-t-[32px] sm:rounded-[40px] overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-ios-bg flex items-center justify-between shrink-0">
              <div>
                <h2 id={titleId} className="text-xl font-bold tracking-tight">{activeDoc.title}</h2>
                <p className="text-[10px] font-bold text-ios-gray uppercase tracking-wider mt-1">
                  Version {activeDoc.version} · Updated {activeDoc.lastUpdated}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {activeDoc.status === 'draft' && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl flex items-start space-x-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-200 leading-snug">
                    DRAFT — pending legal review. This document is not yet final.
                  </p>
                </div>
              )}

              {activeDoc.intro?.map((paragraph) => (
                <p key={paragraph} className="text-sm text-ios-gray leading-relaxed">
                  {paragraph}
                </p>
              ))}

              {activeDoc.sections.map((section) => (
                <section key={section.heading} className="space-y-2">
                  <h3 className="font-bold text-sm">{section.heading}</h3>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="text-sm text-ios-gray leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets && (
                    <ul className="list-disc pl-5 space-y-1.5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="text-sm text-ios-gray leading-relaxed">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              <p className="text-[10px] text-ios-gray pt-2 pb-4 text-center uppercase tracking-wider font-bold">
                SearchingFool · support@searchingfool.com
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
