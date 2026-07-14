// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/PracticeHubView.tsx
// Description: Practice tab view (docs/ui-mockup/intended-ui-v3.html Practice hub): mode tiles
//   from the engine registry (./registry.ts — Listening, Speaking & Pronunciation, Pattern
//   Builder, Situation Simulator, Missions, Vocabulary Review, Phrase Library, Culture), a
//   "Browse situations" entry (SituationPicker — any track/level/situation, soft prereqs
//   advisory only), and the existing lesson Quiz entry. Owns the mode-screen chrome (back
//   header) and mounts the active mode's lazy Component with PracticeModeProps; routing state
//   lives in usePractice (PracticeRoute). Never hard-gates: coming-soon modes open a
//   ComingSoon screen, every situation is always tappable (CONTENT-ARCHITECTURE §5/§12).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { Suspense, useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, GraduationCap, Wifi } from 'lucide-react';
import { Lesson } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import { PRACTICE_MODES, getPracticeMode } from './registry';
import { PracticeRoute } from './usePractice';
import { SituationPicker } from './SituationPicker';

interface PracticeHubViewProps {
  route: PracticeRoute;
  openMode: (modeId: string, situationId?: string | null) => void;
  closeMode: () => void;
  /** Opens the existing lesson quiz overlay (App-level PracticeQuiz mount). */
  openQuiz: () => void;
  selectedLesson: Lesson | null;
  showToast: ShowToast;
}

const modeSuspenseFallback = (
  <div className="flex items-center justify-center py-16">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
  </div>
);

export const PracticeHubView = ({
  route,
  openMode,
  closeMode,
  openQuiz,
  selectedLesson,
  showToast,
}: PracticeHubViewProps) => {
  const [isBrowsing, setIsBrowsing] = useState(false);

  // ── Active mode screen (hub owns the chrome; the engine renders the body) ──
  if (route.activeMode) {
    const mode = getPracticeMode(route.activeMode);
    if (!mode) {
      // Defensive: a stale/unknown mode id (e.g. after a registry change) falls back
      // to the hub instead of a blank screen — logged, never silent.
      logger.error('PRACTICE_MODE_UNKNOWN', `no registered practice mode for id "${route.activeMode}"`, {
        category: 'SYSTEM_HEALTH',
        details: { modeId: route.activeMode, situationId: route.situationId },
      });
      closeMode();
      return null;
    }
    const ModeComponent = mode.Component;
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 flex items-center space-x-2 border-b border-ios-bg bg-card/80 ios-blur">
          <button
            onClick={closeMode}
            className="p-2 -ml-2 text-ios-blue flex items-center text-sm font-semibold"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Practice</span>
          </button>
          <div className="flex items-center space-x-2">
            <div className={`w-7 h-7 rounded-lg ${mode.iconBgClassName} flex items-center justify-center`}>
              <mode.icon className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold">{mode.title}</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-24">
          {ModeComponent ? (
            <Suspense fallback={modeSuspenseFallback}>
              <ModeComponent situationId={route.situationId} onExit={closeMode} />
            </Suspense>
          ) : (
            <p className="text-sm text-ios-gray text-center py-16">
              This mode has no screen registered yet.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Situation browser (free navigation entry, §5) ──
  if (isBrowsing) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 flex items-center space-x-2 border-b border-line bg-card/80 ios-blur">
          <button
            onClick={() => setIsBrowsing(false)}
            className="p-2 -ml-2 text-ios-blue flex items-center text-sm font-semibold"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Practice</span>
          </button>
          <h2 className="font-bold">Situations</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 pb-24">
          <SituationPicker
            onPick={(situationId, modeId) => {
              setIsBrowsing(false);
              openMode(modeId, situationId);
            }}
          />
        </div>
      </div>
    );
  }

  // ── Hub: mode tiles per the v3 mockup ──
  return (
    <div className="p-6 space-y-3 overflow-y-auto h-full pb-32">
      <header className="space-y-1 pb-2">
        <h1 className="text-3xl font-bold tracking-tight">Practice</h1>
        <p className="text-ios-gray text-sm">Every mode works on the same situations. Pick your lens.</p>
      </header>

      {/* Situation browsing entry — any track, level, situation (§5 free navigation) */}
      <button
        onClick={() => setIsBrowsing(true)}
        className="w-full bg-ios-blue p-4 rounded-2xl text-white shadow-lg flex items-center justify-between active:scale-95 transition-transform"
      >
        <div className="flex items-center space-x-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold block text-sm">Browse situations</span>
            <span className="text-blue-50 text-xs">Any track · any level · nothing locked</span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 opacity-70" />
      </button>

      {/* Mode tiles from the engine registry. Mobile: single-column stack (space-y-3 above).
          Desktop (md+/lg+): a widening grid so the hub uses the room instead of a tall list (U2). */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {PRACTICE_MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => openMode(mode.id)}
          className="w-full bg-card p-4 rounded-2xl ios-shadow flex items-center space-x-3 text-left active:scale-95 transition-transform"
        >
          <div className={`w-10 h-10 rounded-xl ${mode.iconBgClassName} flex items-center justify-center flex-shrink-0`}>
            <mode.icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm">{mode.title}</span>
              {mode.requiresOnline && (
                <span className="text-[9px] font-bold uppercase text-ios-blue bg-ios-blue/10 px-1.5 py-0.5 rounded-full inline-flex items-center space-x-0.5">
                  <Wifi className="w-2.5 h-2.5" />
                  <span>online</span>
                </span>
              )}
              {mode.status === 'coming-soon' && (
                <span className="text-[9px] font-bold uppercase text-ios-gray bg-ios-bg px-1.5 py-0.5 rounded-full">
                  soon
                </span>
              )}
            </div>
            <span className="text-xs text-ios-gray block truncate">{mode.subtitle}</span>
          </div>
          <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
        </button>
      ))}

      {/* Existing lesson quiz entry (kept working — App-level PracticeQuiz overlay) */}
      <button
        onClick={() => {
          if (selectedLesson) {
            openQuiz();
          } else {
            showToast('Open a lesson in the Learning tab first, then quiz it here.');
          }
        }}
        className="w-full bg-card p-4 rounded-2xl ios-shadow flex items-center space-x-3 text-left active:scale-95 transition-transform"
      >
        <div className="w-10 h-10 rounded-xl bg-[#0A84FF] flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-bold text-sm">Lesson Quiz</span>
          <span className="text-xs text-ios-gray block truncate">
            {selectedLesson ? `Quiz: ${selectedLesson.title}` : 'Pick a lesson in Learning first'}
          </span>
        </div>
        <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
      </button>
      </div>
    </div>
  );
};

export default PracticeHubView;
