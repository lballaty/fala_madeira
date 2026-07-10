// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/AdminPanel.tsx
// Description: Floating admin panel extracted verbatim from App.tsx (pending video suggestion
//   moderation). Rendered at App-shell level because it persists across tab switches while
//   admin mode is on. Moderation handlers live in the learning slice (useLessons).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Lock, X } from 'lucide-react';
import { Lesson, VideoSuggestion } from '../../types';

interface AdminPanelProps {
  isAdminMode: boolean;
  setIsAdminMode: (on: boolean) => void;
  videoSuggestions: VideoSuggestion[];
  lessons: Lesson[];
  handleApproveSuggestion: (suggestion: VideoSuggestion) => Promise<void>;
  handleRejectSuggestion: (suggestion: VideoSuggestion) => Promise<void>;
}

export const AdminPanel = ({
  isAdminMode,
  setIsAdminMode,
  videoSuggestions,
  lessons,
  handleApproveSuggestion,
  handleRejectSuggestion
}: AdminPanelProps) => (
  <AnimatePresence>
    {isAdminMode && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-24 left-6 right-6 z-40 bg-card rounded-3xl p-6 ios-shadow border-2 border-ios-blue"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center">
            <Lock className="w-4 h-4 mr-2 text-ios-blue" />
            Admin Panel
          </h2>
          <button onClick={() => setIsAdminMode(false)} className="text-xs font-bold text-ios-gray">Close</button>
        </div>

        <div className="space-y-4 max-h-64 overflow-y-auto no-scrollbar">
          <h3 className="text-xs font-bold text-ios-gray uppercase">Pending Video Suggestions</h3>
          {videoSuggestions.filter(s => s.status === 'pending').length === 0 ? (
            <p className="text-xs text-ios-gray italic">No pending suggestions</p>
          ) : (
            videoSuggestions.filter(s => s.status === 'pending').map(suggestion => (
              <div key={suggestion.id} className="p-3 bg-ios-bg rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-ios-blue">Lesson: {lessons.find(l => l.id === suggestion.lesson_id)?.title}</span>
                  <div className="flex space-x-2">
                    <button onClick={() => handleApproveSuggestion(suggestion)} className="p-1 bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-300 rounded">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleRejectSuggestion(suggestion)} className="p-1 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] truncate">{suggestion.video_url}</p>
                {suggestion.note && <p className="text-[10px] text-ios-gray italic">"{suggestion.note}"</p>}
              </div>
            ))
          )}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);
