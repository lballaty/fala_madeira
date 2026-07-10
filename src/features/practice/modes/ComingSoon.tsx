// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/ComingSoon.tsx
// Description: Shared placeholder body for practice modes whose engine has not shipped yet
//   (registry entries with status 'coming-soon'). Lazily imported by each mode stub so the
//   PracticeMode.Component contract (LazyExoticComponent) holds before the real engine lands.
//   Engines never edit this file — they simply stop importing it when they replace their stub
//   (see the ENGINE INTEGRATION CONTRACT in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { Construction } from 'lucide-react';
import type { PracticeModeProps } from '../registry';

const ComingSoon = ({ situationId, onExit }: PracticeModeProps) => (
  <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-4">
    <div className="w-16 h-16 rounded-2xl bg-ios-bg flex items-center justify-center">
      <Construction className="w-8 h-8 text-ios-gray" />
    </div>
    <div className="space-y-1">
      <h3 className="text-lg font-bold">Coming soon</h3>
      <p className="text-sm text-ios-gray max-w-xs">
        This practice mode is being built. Everything else in Practice already works on the same
        situations — nothing is locked while you wait.
      </p>
      {situationId && (
        <p className="text-xs text-ios-gray">
          Your pick is remembered — this situation will open here once the mode ships.
        </p>
      )}
    </div>
    <button
      onClick={onExit}
      className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
    >
      Back to Practice
    </button>
  </div>
);

export default ComingSoon;
