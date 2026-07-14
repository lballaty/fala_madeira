// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/session/DailySessionView.tsx
// Description: Daily-session PLAYER (docs/CONTENT-ARCHITECTURE.md §5; intended-ui-v3 session
//   player). Plays the Adaptive Guided sessionPlan (src/paths) by sequencing each segment into
//   the EXISTING practice engines — it looks the segment's engineId up in the practice registry
//   (src/features/practice/registry.ts) and mounts that engine's lazy Component with
//   PracticeModeProps { situationId, onExit }, reusing the same engine contract the Practice hub
//   uses. A segment progress bar (widths proportional to each segment's minutes, mirroring the
//   mockup's segbar) shows position; the engine's onExit advances to the next segment (no gates —
//   the learner can skip; §5). Ends in an after-session recap STUB (§6b) with a clean seam the
//   coach step enriches (// COACH SIGNAL). Composition/data live in ./useDailySession.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { Suspense } from 'react';
import { ChevronLeft, SkipForward } from 'lucide-react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';
import { getPracticeMode } from '../practice/registry';
import type { PathSelection } from '../../paths';
import type { PracticalLevel } from '../../content/schema';
import { SessionRecap } from '../coach/SessionRecap';
import { useDailySession } from './useDailySession';

interface DailySessionViewProps {
  supabase: SupabaseClient | null;
  user: User | null;
  selection: PathSelection;
  placementLevel?: PracticalLevel;
  /** Leave the session and return to Home (Exit button, and the recap's "Back to Home"). */
  onExit: () => void;
}

const loadingFallback = (
  <div className="flex items-center justify-center py-16">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
  </div>
);

export const DailySessionView = ({
  supabase,
  user,
  selection,
  placementLevel,
  onExit,
}: DailySessionViewProps) => {
  const { phase, plan, segment, segmentIndex, advance, skip, recap } =
    useDailySession({ supabase, user, selection, placementLevel });

  // ── After-session recap (§6b stub) ──
  if (phase === 'recap') {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 flex items-center border-b border-ios-bg bg-elevated/80 ios-blur">
          <button onClick={onExit} className="p-2 -ml-2 text-ios-blue flex items-center text-sm font-semibold">
            <ChevronLeft className="w-5 h-5" />
            <span>Home</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-24">
          <h2 className="text-2xl font-bold">Session done</h2>
          <p className="text-ios-gray text-sm">
            ~{recap.plannedMinutes} min · {recap.segmentsTotal} segments · all voice time counted
          </p>

          {/* COACH SIGNAL (§6b): the Coach recap card, fed by the session's graded results
              (strong today / still shaky / added to review) aggregated in useDailySession via
              src/lib/coach.buildSessionRecap. Honest empty state when nothing was graded. */}
          <div className="bg-card p-4 rounded-2xl ios-shadow">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ios-gray">Nicely done</p>
            <p className="text-sm mt-1">
              You worked through {recap.segmentsCompleted} of {recap.segmentsTotal} segments today.
            </p>
          </div>
          <SessionRecap recap={recap} />

          <button
            onClick={onExit}
            className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Loading / empty plan ──
  if (phase === 'loading' || !plan || !segment) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 flex items-center border-b border-ios-bg bg-elevated/80 ios-blur">
          <button onClick={onExit} className="p-2 -ml-2 text-ios-blue flex items-center text-sm font-semibold">
            <ChevronLeft className="w-5 h-5" />
            <span>Exit</span>
          </button>
          <h2 className="font-bold ml-1">Daily session</h2>
        </div>
        {loadingFallback}
      </div>
    );
  }

  // ── Active segment: sequence into the registered engine ──
  const mode = getPracticeMode(segment.engineId);
  const totalMinutes = plan.reduce((sum, s) => sum + s.minutes, 0);
  const isLastSegment = segmentIndex >= plan.length - 1;

  // The engine's onExit means "this segment is done" → advance the session. A missing engine
  // (stale/unknown id) is logged and skipped rather than blanking the player (never silent).
  const onSegmentDone = () => {
    if (!mode) {
      logger.error('SESSION_ENGINE_UNKNOWN', `no registered practice engine for id "${segment.engineId}"`, {
        category: 'SYSTEM_HEALTH',
        details: { engineId: segment.engineId, segmentIndex },
      });
    }
    advance();
  };

  const ModeComponent = mode?.Component ?? null;

  return (
    <div className="h-full flex flex-col">
      {/* Header: exit + segment title */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-ios-bg bg-elevated/80 ios-blur">
        <div className="flex items-center min-w-0">
          <button onClick={onExit} className="p-2 -ml-2 text-ios-blue flex items-center text-sm font-semibold">
            <ChevronLeft className="w-5 h-5" />
            <span>Exit</span>
          </button>
          <h2 className="font-bold ml-1 truncate">{segment.label}</h2>
        </div>
        <button
          onClick={skip}
          className="p-2 text-ios-gray flex items-center text-xs font-semibold active:opacity-60"
          title="Skip this segment — the plan adapts either way"
        >
          <SkipForward className="w-4 h-4 mr-1" />
          Skip
        </button>
      </div>

      {/* Segment progress bar — widths proportional to each segment's minutes (mockup segbar) */}
      <div className="px-4 pt-3">
        <div className="flex gap-1 h-2">
          {plan.map((seg, i) => (
            <div
              key={`${seg.engineId}-${i}`}
              style={{ flex: seg.minutes / totalMinutes }}
              className={cn(
                'rounded-full transition-colors',
                i < segmentIndex ? 'bg-ios-blue' : i === segmentIndex ? 'bg-ios-blue/60' : 'bg-ios-bg'
              )}
            />
          ))}
        </div>
        <p className="text-[11px] text-ios-gray mt-2">
          Segment {segmentIndex + 1} of {plan.length} · {segment.label} · ~{segment.minutes} min
          <span className="text-ios-gray/70"> · session ~{totalMinutes} min</span>
        </p>
      </div>

      {/* Engine body — reuse the practice engine via the registry (same contract as the hub) */}
      <div className="flex-1 overflow-y-auto pb-24">
        {ModeComponent ? (
          <Suspense fallback={loadingFallback}>
            <ModeComponent situationId={segment.situationId} onExit={onSegmentDone} />
          </Suspense>
        ) : (
          <div className="p-6 text-center space-y-4">
            <p className="text-sm text-ios-gray">
              This segment's engine ({segment.engineId}) has no screen yet.
            </p>
            <button
              onClick={onSegmentDone}
              className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm"
            >
              {isLastSegment ? 'Finish session' : 'Next segment'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailySessionView;
