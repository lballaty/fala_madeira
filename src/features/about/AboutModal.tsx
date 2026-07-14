// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/about/AboutModal.tsx
// Description: In-app "About" surface (EN-4) — the content you'd expect from a desktop app's
//   Help/About: app name + tagline, the running version (CalVer, injected at build), maker +
//   copyright, per-version release notes (from the canonical CHANGELOG.md), links to the legal
//   docs + support, and platform credits. Rendered as the same bottom-sheet modal pattern as
//   LegalPage (SettingsView owns the open state and the legal/support callbacks). This exists
//   because the native macOS PWA menu-bar "About" is browser-owned and cannot be populated by
//   our web code — so version + release notes live here, reachable on web, installed PWA, and iOS.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { LegalDocId } from '../legal';
import { RELEASES } from './changelog';

const APP_NAME = 'FalaMadeira';
const APP_TAGLINE = 'Learn Madeiran Portuguese — voice-first, at your pace.';
const MAKER = 'SearchingFool';
const SUPPORT_EMAIL = 'support@searchingfool.com';

interface AboutModalProps {
  /** Whether the About sheet is shown. */
  open: boolean;
  onClose: () => void;
  /** Open a legal document (Terms / Privacy / AI-use) — SettingsView owns the LegalPage state. */
  onOpenLegal?: (doc: LegalDocId) => void;
  /** Open the support/contact modal — SettingsView owns it. */
  onOpenSupport?: () => void;
}

export const AboutModal = ({ open, onClose, onOpenLegal, onOpenSupport }: AboutModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, open, onClose);

  return (
    <AnimatePresence>
      {open && (
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
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-ios-blue/10 flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5 text-ios-blue" />
                </div>
                <div>
                  <h2 id={titleId} className="text-xl font-bold tracking-tight">About {APP_NAME}</h2>
                  <p className="text-[10px] font-bold text-ios-gray uppercase tracking-wider mt-1">
                    Version {__APP_VERSION__}
                  </p>
                </div>
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
              {/* Identity */}
              <section className="space-y-1.5">
                <p className="text-sm text-ios-gray leading-relaxed">{APP_TAGLINE}</p>
                <dl className="text-sm mt-3 space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-ios-gray">Version</dt>
                    <dd className="font-bold" data-testid="about-version">{__APP_VERSION__}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ios-gray">Made by</dt>
                    <dd className="font-medium">{MAKER}</dd>
                  </div>
                </dl>
              </section>

              {/* Release notes — per version, newest first, from the canonical CHANGELOG. */}
              <section className="space-y-3">
                <h3 className="font-bold text-sm">Release notes</h3>
                {RELEASES.length === 0 ? (
                  <p className="text-sm text-ios-gray">No release notes available.</p>
                ) : (
                  <div className="space-y-4" data-testid="about-release-notes">
                    {RELEASES.map((release) => (
                      <div key={release.version} className="space-y-1.5">
                        <p className="text-[11px] font-bold text-ios-blue uppercase tracking-wider">
                          {release.version}
                        </p>
                        <ul className="list-disc pl-5 space-y-1.5">
                          {release.notes.map((note, i) => (
                            <li key={i} className="text-sm text-ios-gray leading-relaxed">{note}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Links */}
              <section className="space-y-1">
                <h3 className="font-bold text-sm mb-1">More</h3>
                {onOpenLegal && (
                  <>
                    <button
                      onClick={() => onOpenLegal('terms')}
                      className="w-full py-2.5 flex items-center justify-between text-ios-blue text-sm font-medium active:opacity-60"
                    >
                      Terms of Service
                    </button>
                    <button
                      onClick={() => onOpenLegal('privacy')}
                      className="w-full py-2.5 flex items-center justify-between text-ios-blue text-sm font-medium active:opacity-60"
                    >
                      Privacy Policy
                    </button>
                    <button
                      onClick={() => onOpenLegal('ai-use')}
                      className="w-full py-2.5 flex items-center justify-between text-ios-blue text-sm font-medium active:opacity-60"
                    >
                      AI Disclosure
                    </button>
                  </>
                )}
                {onOpenSupport && (
                  <button
                    onClick={onOpenSupport}
                    className="w-full py-2.5 flex items-center justify-between text-ios-blue text-sm font-medium active:opacity-60"
                  >
                    Contact Support
                  </button>
                )}
              </section>

              {/* Credits */}
              <p className="text-[10px] text-ios-gray pt-2 pb-4 text-center uppercase tracking-wider font-bold leading-relaxed">
                {MAKER} · {SUPPORT_EMAIL}
                <br />
                AI tutor powered by Google Gemini · Backend by Supabase
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
