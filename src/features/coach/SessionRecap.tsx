// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/coach/SessionRecap.tsx
// Description: After-session recap card (docs/CONTENT-ARCHITECTURE.md §6b) — fills the recap seam
//   in DailySessionView (// COACH SIGNAL). Renders the deterministic buildSessionRecap() output
//   (strengths / still-shaky / review items added) in a calm, competence-framed way: strengths are
//   celebrated, shaky areas are framed as "coming back to" (never scolding), and the review count
//   is a positive ("N added to your review"). Honest empty state when nothing was graded — no
//   fabricated feedback. Pure presentational: the recap model is computed upstream (useDailySession
//   → src/lib/coach.buildSessionRecap) so this component takes the model as a prop.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import type { SessionRecapModel } from '../../lib/coach';

interface SessionRecapProps {
  recap: SessionRecapModel;
}

const Chips = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-1.5 mt-1.5">
    {items.map((item) => (
      <span key={item} className="text-[11px] bg-ios-bg px-2.5 py-1 rounded-full font-medium">
        {item}
      </span>
    ))}
  </div>
);

export const SessionRecap = ({ recap }: SessionRecapProps) => {
  const hasStrengths = recap.strengths.length > 0;
  const hasShaky = recap.shaky.length > 0;
  const nothingGraded = !hasStrengths && !hasShaky && recap.reviewAdded === 0;

  // Honest placeholder — the session ran but produced no graded results to summarize yet.
  if (nothingGraded) {
    return (
      <div className="bg-card p-4 rounded-2xl ios-shadow">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ios-gray">Nicely done</p>
        <p className="text-sm mt-1 text-ios-gray">
          Every bit of voice time counts. Practice a few graded items and your coach will call out
          your strengths and what to review here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasStrengths && (
        <div className="bg-card p-4 rounded-2xl ios-shadow border-l-4 border-green-500">
          <div className="flex items-center space-x-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-ios-gray">Strong today</p>
          </div>
          <Chips items={recap.strengths} />
        </div>
      )}

      {hasShaky && (
        <div className="bg-card p-4 rounded-2xl ios-shadow border-l-4 border-orange-400">
          <div className="flex items-center space-x-1.5">
            <RefreshCw className="w-4 h-4 text-orange-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-ios-gray">Coming back to</p>
          </div>
          <p className="text-[11px] text-ios-gray mt-1">Still settling — you will see these again soon.</p>
          <Chips items={recap.shaky} />
        </div>
      )}

      {recap.reviewAdded > 0 && (
        <div className="bg-card p-4 rounded-2xl ios-shadow border-l-4 border-[#5856D6]">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-[#5856D6]" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-ios-gray">Added to review</p>
          </div>
          <p className="text-sm mt-1">
            {recap.reviewAdded} item{recap.reviewAdded === 1 ? '' : 's'} queued for spaced review — your
            fastest way to lock them in.
          </p>
        </div>
      )}
    </div>
  );
};

export default SessionRecap;
