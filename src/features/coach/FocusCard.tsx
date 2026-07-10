// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/coach/FocusCard.tsx
// Description: Home "Focus" card (docs/CONTENT-ARCHITECTURE.md §6b) — the user-facing head of the
//   Feedback & Focus loop. Renders the top 1–3 deterministic focus suggestions (src/lib/coach.ts
//   via useCoach), each a competence-framed, one-tap action that routes the learner into practice.
//   A calm "why this?" reveal expands the evidence panel (severity/urgency/goal/recency — honest,
//   never arbitrary). Self-contained data-wise: it pulls its own signals through useCoach with the
//   getSupabase() singleton (Home does not pass supabase), so it can drop into HomeView with a
//   single mount and no App.tsx changes. Degrades to a quiet "no focus yet" state (never empty
//   noise) and always renders SOMETHING actionable when the model has a suggestion (offline-safe).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ChevronRight, Compass, Info, Play } from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import { useCoach } from './useCoach';
import type { FocusSuggestion } from '../../lib/coach';

interface FocusCardProps {
  user: User | null;
  /** The learner's active goal-track id (goal-relevance boost); null when none chosen. */
  activeTrackId: string | null;
  /**
   * One-tap handler: route the learner into practice for this suggestion. Home wires this to
   * the Practice hub (setActiveTab('practice')); a richer caller may open the exact engine.
   */
  onAct: (suggestion: FocusSuggestion) => void;
}

/** A single evidence factor row in the "why this?" panel (transparent scoring). */
const FactorRow = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center justify-between text-[11px]">
    <span className="text-ios-gray">{label}</span>
    <span className="font-semibold tabular-nums">×{value.toFixed(2)}</span>
  </div>
);

const SuggestionRow = ({
  suggestion,
  onAct,
}: {
  suggestion: FocusSuggestion;
  onAct: (s: FocusSuggestion) => void;
}) => {
  const [showWhy, setShowWhy] = useState(false);
  const { evidence } = suggestion;

  return (
    <div className="bg-card rounded-2xl ios-shadow overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="min-w-0 pr-3">
          <p className="font-semibold text-sm truncate">{suggestion.title}</p>
          <p className="text-[11px] text-ios-gray mt-0.5 truncate">{evidence.reason}</p>
        </div>
        <button
          onClick={() => onAct(suggestion)}
          className="flex-shrink-0 px-4 py-2 bg-ios-blue text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 active:scale-95 transition-transform"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Practice</span>
        </button>
      </div>

      <button
        onClick={() => setShowWhy((v) => !v)}
        className="w-full px-4 pb-3 -mt-1 flex items-center text-[11px] font-semibold text-ios-blue active:opacity-60"
      >
        <Info className="w-3 h-3 mr-1" />
        {showWhy ? 'Hide why' : 'Why this?'}
        <ChevronRight className={`w-3 h-3 ml-0.5 transition-transform ${showWhy ? 'rotate-90' : ''}`} />
      </button>

      {showWhy && (
        <div className="px-4 pb-4 space-y-1.5 border-t border-ios-bg pt-3">
          <p className="text-[11px] text-ios-gray leading-relaxed">
            {evidence.goalRelevant && 'This is on your active track. '}
            {evidence.dueCount > 0 && `${evidence.dueCount} item${evidence.dueCount === 1 ? '' : 's'} due. `}
            {evidence.avoided && 'You skipped this earlier. '}
            {evidence.itemCount > 0 && !evidence.avoided && `Based on ${evidence.itemCount} of your recent results. `}
          </p>
          <div className="bg-ios-bg/50 rounded-xl p-3 space-y-1">
            <FactorRow label="Weakness" value={evidence.factors.severity} />
            <FactorRow label="Goal relevance" value={evidence.factors.goalRelevance} />
            <FactorRow label="Review urgency" value={evidence.factors.reviewUrgency} />
            <FactorRow label="Recency / avoidance" value={evidence.factors.recencyAvoidance} />
          </div>
        </div>
      )}
    </div>
  );
};

export const FocusCard = ({ user, activeTrackId, onAct }: FocusCardProps) => {
  // Home does not thread supabase into HomeView; the coach reads it from the singleton so the
  // card is a drop-in mount. All coach computation is offline/deterministic (§6b).
  const supabase = getSupabase();
  const { focus, isReady } = useCoach({ supabase, user, activeTrackId });

  // Nothing to say yet (fresh learner / no signals) — a quiet, honest empty state, not noise.
  if (isReady && focus.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center space-x-2">
          <Compass className="w-4 h-4 text-[#5856D6]" />
          <h2 className="text-xl font-semibold">Your Focus</h2>
        </div>
        <div className="bg-card p-4 rounded-2xl ios-shadow">
          <p className="text-sm text-ios-gray">
            Practice a little and your coach will highlight your fastest wins here.
          </p>
        </div>
      </section>
    );
  }

  // Loading: render nothing (Home already has a CTA above) rather than a spinner flash.
  if (!isReady) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center space-x-2">
        <Compass className="w-4 h-4 text-[#5856D6]" />
        <h2 className="text-xl font-semibold">Your Focus</h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-ios-gray bg-ios-bg px-2 py-0.5 rounded-full">
          Top {focus.length}
        </span>
      </div>
      <p className="text-[11px] text-ios-gray -mt-1">Your fastest wins today — one tap to practice.</p>
      <div className="space-y-2.5">
        {focus.map((suggestion) => (
          <SuggestionRow key={suggestion.id} suggestion={suggestion} onAct={onAct} />
        ))}
      </div>
    </section>
  );
};

export default FocusCard;
