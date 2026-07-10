// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/coach/WeeklyInsight.tsx
// Description: Weekly insight card (docs/CONTENT-ARCHITECTURE.md §6b) — the macro coaching surface.
//   Renders the deterministic buildWeeklyInsight() output: a calm competence-framed headline, what
//   improved this week (per-dimension ease gains), and the next focus (weakest dimensions). Pure
//   presentational — the model is computed upstream from locally-cached daily snapshots
//   (src/lib/coach.buildWeeklyInsight), so this component takes the model as a prop and never
//   touches the network. Positive tone throughout ("your fastest win", never scolding).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { TrendingUp, Target } from 'lucide-react';
import type { WeeklyInsightModel } from '../../lib/coach';
import type { ReviewDimension } from '../../content/schema';

interface WeeklyInsightProps {
  insight: WeeklyInsightModel;
}

/** Learner-facing name per mastery dimension (§6). */
const DIMENSION_NAME: Record<ReviewDimension, string> = {
  hear: 'Listening',
  say: 'Speaking',
  retrieve: 'Recall',
  avoid: 'Facing tricky situations',
};

export const WeeklyInsight = ({ insight }: WeeklyInsightProps) => (
  <section className="space-y-3">
    <div className="flex items-center space-x-2">
      <TrendingUp className="w-4 h-4 text-green-500" />
      <h2 className="text-xl font-semibold">This week</h2>
    </div>

    <div className="bg-card p-4 rounded-2xl ios-shadow">
      <p className="text-sm font-medium leading-relaxed">{insight.headline}</p>
    </div>

    {insight.improved.length > 0 && (
      <div className="bg-card p-4 rounded-2xl ios-shadow border-l-4 border-green-500">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ios-gray">What improved</p>
        <ul className="mt-2 space-y-1.5">
          {insight.improved.map((entry) => (
            <li key={entry.dimension} className="flex items-center justify-between text-sm">
              <span>{DIMENSION_NAME[entry.dimension]}</span>
              <span className="text-green-600 font-semibold text-xs tabular-nums">
                +{entry.delta.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {insight.nextFocus.length > 0 && (
      <div className="bg-card p-4 rounded-2xl ios-shadow border-l-4 border-[#5856D6]">
        <div className="flex items-center space-x-1.5">
          <Target className="w-4 h-4 text-[#5856D6]" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-ios-gray">Next focus</p>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {insight.nextFocus.map((dimension) => (
            <span key={dimension} className="text-[11px] bg-ios-bg px-2.5 py-1 rounded-full font-medium">
              {DIMENSION_NAME[dimension]}
            </span>
          ))}
        </div>
      </div>
    )}
  </section>
);

export default WeeklyInsight;
