// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/home/HomeView.tsx
// Description: Home/dashboard tab (U7/U8/FB4/G1 — docs/ui-mockup/intended-ui-v3.html Home). A pure
//   presenter over useHome's derived state: the progress ring (active-path completion %), the
//   "You can now…" competence line (goals of completed situations), the Review-due card (SRS
//   count, one-tap into the vocabulary/review engine), the coach Focus card (now threaded with
//   the active track + a one-tap practice router so goal-relevance + exact-engine routing are
//   live), the streak + streak-freeze grace, the path-adaptive today CTA, and the level-unlock
//   modal (opened from the header key button). Unlock state stays in the learning slice hook so
//   the draft key survives tab switches, matching the original monolith.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronRight, Play, Zap, Key, User as UserIcon, X, Flame, Snowflake, RotateCcw } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Lesson, UserProfile } from '../../types';
import type { NextAction, PathContext, PathSelection, LearningPath } from '../../paths';
import type { FocusSuggestion } from '../../lib/coach';
import { FocusCard } from '../coach/FocusCard';
import { useHome } from './useHome';

const getLevelName = (level: number) => {
  const levels: Record<number, string> = {
    1: "Absolute Beginner",
    2: "Beginner",
    3: "Elementary",
    4: "Pre-Intermediate",
    5: "Intermediate",
    6: "Upper-Intermediate",
    7: "Advanced",
    8: "Proficient"
  };
  return levels[level] || "Student";
};

/** Deterministic SVG progress ring for the active-path completion figure (mirrors the v3 mockup). */
const ProgressRing = ({ percent }: { percent: number }) => {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg width="62" height="62" viewBox="0 0 66 66" className="flex-shrink-0" aria-label={`${clamped}% complete`}>
      <circle cx="33" cy="33" r={radius} fill="none" className="stroke-ios-bg" strokeWidth="7" />
      <circle
        cx="33"
        cy="33"
        r={radius}
        fill="none"
        className="stroke-ios-blue"
        strokeWidth="7"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 33 33)"
      />
      <text x="33" y="38" textAnchor="middle" fontSize="14" fontWeight="800" className="fill-current">
        {clamped}%
      </text>
    </svg>
  );
};

interface HomeViewProps {
  user: User | null;
  profile: UserProfile | null;
  lessons: Lesson[];
  /** getSupabase() singleton — threaded so useHome (SRS review-due) reads the same client. */
  supabase: SupabaseClient | null;
  setActiveTab: (tab: 'home' | 'learning' | 'practice' | 'chat' | 'settings') => void;
  setSelectedLesson: (lesson: Lesson | null) => void;
  startAIPractice: (lesson: Lesson, isHelp?: boolean) => Promise<void>;
  unlockKey: string;
  setUnlockKey: (key: string) => void;
  isUnlockModalOpen: boolean;
  setIsUnlockModalOpen: (open: boolean) => void;
  handleUnlockLevel: () => Promise<void>;
  /** The chosen learning path's recommended next step (docs/CONTENT-ARCHITECTURE.md §5). */
  pathNextAction: NextAction;
  /** True once path content + selection have loaded — gates the path-aware CTA. */
  isPathReady: boolean;
  /** Act on pathNextAction (open the daily session / the recommended situation / free browse). */
  onStartPathNext: () => void;
  /** Read-only content + progress snapshot (App threads usePathContext.context) for the ring/competence. */
  pathContext: PathContext;
  /** The learner's persisted path choice (App threads usePathSelection.selection). */
  pathSelection: PathSelection;
  /** The resolved active path policy (App threads usePathSelection.activePath). */
  activePath: LearningPath;
  /**
   * Practice-hub router (App threads usePractice.openMode) so the Focus card's one-tap lands on the
   * EXACT engine + situation the coach surfaced — closing the flagged goal-relevance/routing gap.
   */
  openMode: (modeId: string, situationId?: string | null) => void;
}

export const HomeView = ({
  user,
  profile,
  lessons,
  supabase,
  setActiveTab,
  setSelectedLesson,
  startAIPractice,
  unlockKey,
  setUnlockKey,
  isUnlockModalOpen,
  setIsUnlockModalOpen,
  handleUnlockLevel,
  pathNextAction,
  isPathReady,
  onStartPathNext,
  pathContext,
  pathSelection,
  activePath,
  openMode
}: HomeViewProps) => {
  const unlockModalRef = useRef<HTMLDivElement>(null);
  const unlockModalTitleId = useId();
  useFocusTrap(unlockModalRef, isUnlockModalOpen, () => setIsUnlockModalOpen(false));

  // Derived Home surfaces: progress ring, competence line, review-due count, streak-freeze grace.
  const { progress, competencePhrases, reviewDueCount, freeze } = useHome({
    supabase,
    user,
    profile,
    pathContext,
    pathSelection,
    activePath,
  });

  // One-tap Focus action: route into the EXACT engine + situation the coach surfaced, then show the
  // Practice hub. This closes the flagged gap — before, Home could only drop the learner on the hub.
  const handleFocusAct = (suggestion: FocusSuggestion) => {
    openMode(suggestion.action.engineId, suggestion.action.situationId ?? null);
    setActiveTab('practice');
  };

  return (
  <div className="p-6 space-y-6 overflow-y-auto h-full pb-32">
    <header className="flex justify-between items-center">
      <div className="flex items-center space-x-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Olá, {user?.email?.split('@')[0]}!</h1>
          <div className="flex items-center space-x-2">
            <p className="text-ios-gray">{getLevelName(profile?.unlocked_level || 1)}</p>
            <button
              onClick={() => setIsUnlockModalOpen(true)}
              aria-label="Unlock Next Level"
              className="p-1.5 bg-ios-bg rounded-full text-ios-blue hover:bg-ios-blue/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Unlock Next Level"
            >
              <Key className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
      <button onClick={() => setActiveTab('settings')} aria-label="Settings" className="w-12 h-12 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue">
        <UserIcon className="w-6 h-6" />
      </button>
    </header>

    {/* Progress ring + streak/freeze (U7 — the v3 mockup Home summary card). The ring shows
        completion of the ACTIVE PATH's in-scope situations; the streak uses the streak-freeze
        grace (a missed day spends a freeze instead of breaking the streak — §12, calm/honest). */}
    <section className="bg-card p-4 rounded-2xl ios-shadow flex items-center justify-between">
      <div className="flex items-center space-x-3 min-w-0">
        <ProgressRing percent={progress.percent} />
        <div className="min-w-0">
          <p className="font-bold truncate">{progress.title}</p>
          <p className="text-xs text-ios-gray truncate">{progress.subtitle}</p>
        </div>
      </div>
      <div className="text-right flex-shrink-0 pl-3 space-y-1">
        <div className="flex items-center justify-end space-x-1 font-extrabold">
          <Flame className="w-4 h-4 text-orange-500" />
          <span>{freeze.displayStreak}</span>
        </div>
        <div className="inline-flex items-center space-x-1 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 rounded-full px-2 py-0.5 text-[10px] font-bold">
          <Snowflake className="w-3 h-3" />
          <span>{freeze.freezes} {freeze.freezes === 1 ? 'freeze' : 'freezes'}</span>
        </div>
      </div>
    </section>

    {/* Streak-freeze grace note — only when a freeze was actually spent this return (honest,
        never nagging). Keeps the "no gamification beyond streak+freeze" §12 posture. */}
    {freeze.spentNow > 0 && (
      <div className="-mt-3 flex items-center space-x-2 text-[11px] text-ios-gray px-1">
        <Snowflake className="w-3.5 h-3.5 text-ios-blue flex-shrink-0" />
        <span>
          {freeze.graceApplied
            ? `Used ${freeze.spentNow} ${freeze.spentNow === 1 ? 'freeze' : 'freezes'} to keep your streak going. Welcome back.`
            : 'Your streak reset after a longer break — no worries, pick up where you left off.'}
        </span>
      </div>
    )}

    {/* Competence line (U8) — "You can now…" honestly derived from the goals of completed
        situations. Encouraging fallback until the learner has finished enough to say something true. */}
    <section className="bg-green-500/10 p-4 rounded-2xl">
      <p className="text-[10px] text-ios-gray uppercase font-bold tracking-wider">You can now…</p>
      {progress.completed >= 1 && competencePhrases.length > 0 ? (
        <p className="font-semibold mt-1 text-sm text-green-800 dark:text-green-300 leading-snug">
          {competencePhrases.join(' · ')}
        </p>
      ) : (
        <p className="font-medium mt-1 text-sm text-green-800 dark:text-green-300/80 leading-snug">
          Finish your first situation and your real-world wins show up here.
        </p>
      )}
    </section>

    {/* Review-due card (FB4) — the SRS backlog count with a one-tap into the vocabulary/review
        engine. Hidden when nothing is due (no empty noise). */}
    {reviewDueCount > 0 && (
      <section className="bg-card p-4 rounded-2xl ios-shadow border-l-4 border-[#AF52DE] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#AF52DE]/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <RotateCcw className="w-5 h-5 text-[#AF52DE]" />
          </div>
          <div>
            <p className="text-[10px] text-ios-gray uppercase font-bold tracking-wider">Review due</p>
            <p className="font-semibold text-sm">{reviewDueCount} {reviewDueCount === 1 ? 'item' : 'items'} ready</p>
          </div>
        </div>
        <button
          onClick={() => { openMode('vocabulary'); setActiveTab('practice'); }}
          className="px-4 py-2 bg-[#AF52DE] text-white rounded-xl font-bold text-xs active:scale-95 transition-transform"
        >
          Review
        </button>
      </section>
    )}

    {/* Today's CTA — adapts to the chosen learning path (§5): "Start today's session" for
        Adaptive Guided, "Continue Day N" for Structured Course, the track/free entry otherwise.
        Falls back to the legacy AI-tutor lesson CTA until the path context is ready. */}
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">
        {pathNextAction.kind === 'session' ? "Today's Session" : "Today's Focus"}
      </h2>
      <div className="bg-ios-blue p-6 rounded-[32px] text-white shadow-xl relative overflow-hidden group active:scale-95 transition-all">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
          <Zap className="w-24 h-24" />
        </div>
        <div className="relative z-10 space-y-4">
          {isPathReady ? (
            <>
              <div>
                <h3 className="text-2xl font-bold">{pathNextAction.label}</h3>
                <p className="text-blue-50 text-sm">
                  {pathNextAction.detail ?? 'Same content, shared progress — the app leads.'}
                </p>
              </div>
              <button
                onClick={onStartPathNext}
                className="px-6 py-3 bg-white text-ios-blue rounded-2xl font-bold text-sm shadow-lg flex items-center space-x-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{pathNextAction.label}</span>
              </button>
            </>
          ) : (
            <>
              <div>
                <h3 className="text-2xl font-bold">Ready for Day {profile?.unlocked_level || 1}?</h3>
                <p className="text-blue-50 text-sm">Continue your journey with your AI tutor.</p>
              </div>
              <button
                onClick={() => {
                  const nextLesson = lessons.find(l => l.day === (profile?.unlocked_level || 1)) || lessons[0];
                  startAIPractice(nextLesson);
                }}
                className="px-6 py-3 bg-white text-ios-blue rounded-2xl font-bold text-sm shadow-lg flex items-center space-x-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Today's Lesson</span>
              </button>
            </>
          )}
        </div>
      </div>
    </section>

    {/* Coach Focus card (docs/CONTENT-ARCHITECTURE.md §6b) — top 1–3 deterministic focus
        suggestions, each a one-tap action. Now threaded with (a) the active goal track so the
        coach's goal-relevance boost is live, and (b) the practice router so one-tap lands on the
        EXACT engine + situation the coach surfaced (not just the hub) — closing the flagged gap. */}
    {/* Coach focus + Continue Learning: stacked on mobile, side-by-side on lg+ so the desktop
        Home uses the width (progress/focus alongside the review/lists column — U2). */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
    <FocusCard
      user={user}
      activeTrackId={pathSelection.activeTrackId}
      onAct={handleFocusAct}
    />

    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Continue Learning</h2>
        <button onClick={() => setActiveTab('learning')} className="text-ios-blue text-sm font-medium">See All</button>
      </div>
      <button
        type="button"
        onClick={() => { setSelectedLesson(lessons[0]); setActiveTab('learning'); }}
        className="w-full text-left bg-card p-5 rounded-2xl ios-shadow flex items-center justify-between cursor-pointer active:scale-95 transition-transform"
      >
        <div className="flex items-center">
          <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-green-600 mr-4">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">{lessons[0].title}</h3>
            <p className="text-sm text-ios-gray">Month {lessons[0].level} • {lessons[0].category}</p>
          </div>
        </div>
        <ChevronRight className="text-ios-gray" />
      </button>
    </section>
    </div>

    {/* Unlock Level Modal */}
    <AnimatePresence>
      {isUnlockModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <motion.div
            ref={unlockModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={unlockModalTitleId}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-elevated w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-ios-bg flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-ios-blue" />
                <h2 id={unlockModalTitleId} className="text-xl font-bold">Unlock Level</h2>
              </div>
              <button onClick={() => setIsUnlockModalOpen(false)} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-ios-gray leading-relaxed">
                Enter your access key to unlock Month { (profile?.unlocked_level || 1) + 1 } and all its lessons.
              </p>

              <div className="bg-ios-bg/50 p-4 rounded-2xl space-y-2">
                <h3 className="text-[10px] font-bold text-ios-gray uppercase">Level Guide</h3>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    <span className="text-ios-gray">L1: Absolute Beginner</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                    <span className="text-ios-gray">L2: Beginner</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    <span className="text-ios-gray">L3: Elementary</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    <span className="text-ios-gray">L4: Pre-Intermediate</span>
                  </div>
                </div>
                <p className="text-[9px] text-ios-gray italic">
                  Levels are unlocked sequentially using access keys provided by your instructor or through progress.
                </p>
              </div>

              <div className="space-y-2">
                <input
                  value={unlockKey}
                  onChange={(e) => setUnlockKey(e.target.value)}
                  placeholder="Enter Key..."
                  className="w-full bg-ios-bg p-4 rounded-2xl outline-none text-sm border-2 border-transparent focus:border-ios-blue transition-all"
                />
                <p className="text-[10px] text-ios-gray text-center">
                  Access keys are provided by your instructor.
                </p>
              </div>
              <button
                onClick={handleUnlockLevel}
                className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all"
              >
                Unlock Level
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  );
};

export default HomeView;
