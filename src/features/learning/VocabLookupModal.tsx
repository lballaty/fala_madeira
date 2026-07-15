// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/learning/VocabLookupModal.tsx
// Description: Vocabulary lookup modal (extracted from App.tsx). Accepts a Portuguese OR
//   English word and translates in either direction (EN-10). Controlled component; the
//   inventory-first + AI-fallback lookup handler lives in useLessonModals.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Volume2, X } from 'lucide-react';
import { VocabResult } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface VocabLookupModalProps {
  isVocabModalOpen: boolean;
  setIsVocabModalOpen: (open: boolean) => void;
  vocabQuery: string;
  setVocabQuery: (query: string) => void;
  vocabResult: VocabResult | null;
  setVocabResult: (result: VocabResult | null) => void;
  isVocabLoading: boolean;
  handleVocabLookup: (e: React.FormEvent) => Promise<void>;
  playSpeech: (text: string) => void;
}

export const VocabLookupModal = ({
  isVocabModalOpen,
  setIsVocabModalOpen,
  vocabQuery,
  setVocabQuery,
  vocabResult,
  setVocabResult,
  isVocabLoading,
  handleVocabLookup,
  playSpeech
}: VocabLookupModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleClose = () => {
    setIsVocabModalOpen(false);
    setVocabResult(null);
    setVocabQuery('');
  };
  useFocusTrap(dialogRef, isVocabModalOpen, handleClose);
  return (
  <AnimatePresence>
    {isVocabModalOpen && (
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
            <h2 id={titleId} className="text-xl font-bold tracking-tight">Vocabulary Lookup</h2>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="p-2 bg-ios-bg rounded-full active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <form onSubmit={handleVocabLookup} className="space-y-4">
              <div className="relative">
                <input
                  value={vocabQuery}
                  onChange={(e) => setVocabQuery(e.target.value)}
                  placeholder="Portuguese or English word..."
                  aria-label="Portuguese or English word"
                  className="w-full bg-ios-bg p-4 rounded-2xl outline-none text-sm pr-12"
                />
                <button
                  type="submit"
                  disabled={isVocabLoading}
                  aria-label="Search"
                  className="absolute right-2 top-2 p-2 bg-ios-blue text-white rounded-xl disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  {isVocabLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Search className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>

            {vocabResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 p-4 bg-ios-bg rounded-2xl"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-ios-blue">{vocabQuery}</h3>
                    <p className="text-sm font-medium">{vocabResult.translation}</p>
                  </div>
                  <button
                    onClick={() => playSpeech(vocabQuery)}
                    aria-label="Play pronunciation"
                    className="p-2 bg-card rounded-xl text-ios-blue shadow-sm active:scale-95 transition-transform min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-ios-gray font-bold uppercase tracking-widest">Explanation</p>
                  <p className="text-sm leading-relaxed">{vocabResult.explanation}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-ios-gray font-bold uppercase tracking-widest">Example</p>
                  <div className="bg-card p-3 rounded-xl border border-ios-blue/10">
                    <p className="text-sm font-bold italic">"{vocabResult.example_pt}"</p>
                    <p className="text-xs text-ios-gray mt-1">{vocabResult.example_en}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {!vocabResult && !isVocabLoading && (
              <div className="text-center py-8 space-y-3">
                <div className="w-16 h-16 bg-ios-blue/5 text-ios-blue/30 rounded-full flex items-center justify-center mx-auto">
                  <Search className="w-8 h-8" />
                </div>
                <p className="text-sm text-ios-gray px-8">
                  Type a Portuguese or English word to translate in either direction — matched against the
                  course vocabulary first, with an AI-powered translation and Madeiran context for anything else.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
