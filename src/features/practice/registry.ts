// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/registry.ts
// Description: Practice-mode registry (docs/CONTENT-ARCHITECTURE.md §3 engines table). Defines
//   the PracticeMode contract every engine registers through, and assembles the ordered mode
//   list the Practice hub renders (mode tiles per docs/ui-mockup/intended-ui-v3.html). Each
//   engine owns exactly ONE stub file in ./modes/ — see the ENGINE INTEGRATION CONTRACT below.
//   Never hard-gates: 'coming-soon' modes stay tappable (they open a ComingSoon screen), per
//   CONTENT-ARCHITECTURE §5/§12.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// ENGINE INTEGRATION CONTRACT (for the parallel engine build steps)
// ---------------------------------------------------------------------------
// Six+ engine steps build into this registry IN PARALLEL. To guarantee zero
// cross-engine file contention, each engine step:
//
//   1. REPLACES ITS OWN stub file in src/features/practice/modes/ — and ONLY
//      that file. The stub ↔ engine ownership map:
//        listening.stub.tsx   → engine-listening            (src/features/practice/listening/)
//        speaking.stub.tsx    → engine-speaking-pronunciation (src/features/practice/speaking/)
//        patterns.stub.tsx    → engine-pattern-builder      (src/features/practice/patterns/)
//        simulator.stub.tsx   → engine-situation-simulator  (src/features/practice/simulator/)
//        missions.stub.tsx    → engine-missions             (src/features/practice/missions/)
//        vocabulary.stub.tsx  → engine-vocabulary-review    (src/features/practice/vocabulary/)
//        phrases.stub.tsx     → cultural-layer-and-phrase-library (src/features/phrases/)
//        culture.stub.tsx     → cultural-layer-and-phrase-library (src/features/culture/)
//   2. Inside its stub file, changes `status` to 'available' and points
//      `Component` at its real lazy view, e.g.:
//        Component: lazy(() => import('../listening/ListeningView'))
//      The view file must default-export a ComponentType<PracticeModeProps>.
//   3. Keeps the exported const NAME and the mode `id` EXACTLY as-is (the hub
//      routes by id; this registry imports the stub by name).
//   4. Touches NOTHING else in src/features/practice/ — not this registry, not
//      PracticeHubView, not SituationPicker, not usePractice, not other stubs,
//      not modes/ComingSoon.tsx. All new engine code lives in the engine's own
//      directory (see map above).
//
// Rendering contract: the hub owns the mode-screen chrome (back button +
// title header). The mode Component renders only the body, receives
// PracticeModeProps, and calls onExit() when it wants to return to the hub.
// `situationId` is null when the user entered the mode directly from a tile
// (engine picks its own default content) and a Situation id (src/content
// repository) when the user routed in via the situation browser. Situations
// are NEVER prerequisites-gated — engines must not lock content (§5/§12).
// ---------------------------------------------------------------------------

/** Props every practice-mode view receives from the hub. */
export interface PracticeModeProps {
  /** Situation to practice (src/content repository id), or null = engine's own default. */
  situationId: string | null;
  /** Return to the Practice hub tile grid. */
  onExit: () => void;
}

export type PracticeModeComponent = LazyExoticComponent<ComponentType<PracticeModeProps>>;

/** One entry in the Practice hub's mode registry (one engine = one entry = one stub file). */
export interface PracticeMode {
  /** Stable route id (usePractice PracticeRoute.activeMode). Never change after ship. */
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** Tailwind class for the tile icon square (mockup accent colors). */
  iconBgClassName: string;
  /** 'coming-soon' modes stay tappable — they open the ComingSoon screen (never a hard gate). */
  status: 'available' | 'coming-soon';
  /** True when the WHOLE mode needs a connection (hub shows an "online" badge). */
  requiresOnline: boolean;
  /** Lazy body view (hub renders the chrome). null = hub shows a generic placeholder. */
  Component: PracticeModeComponent | null;
}

// Practice-slice tunables. NOTE: these belong in src/config.ts (AGENTS.md §3
// "config, not magic values") but that file is under an active write claim by
// the parallel srs-adaptive-engine step — migrate this block into config.ts
// once that claim is released.
export const practiceConfig = {
  /** Max soft-prerequisite titles shown in the advisory hint line (SituationPicker). */
  softPrereqHintMax: 2,
} as const;

// One import per engine stub file (see contract above — engines replace their
// own file; this import list and array order are stable and never edited by
// engine steps).
import { listeningMode } from './modes/listening.stub';
import { speakingMode } from './modes/speaking.stub';
import { patternsMode } from './modes/patterns.stub';
import { simulatorMode } from './modes/simulator.stub';
import { missionsMode } from './modes/missions.stub';
import { vocabularyMode } from './modes/vocabulary.stub';
import { phrasesMode } from './modes/phrases.stub';
import { cultureMode } from './modes/culture.stub';

/** Ordered mode list the hub renders (order matches the v3 mockup Practice hub). */
export const PRACTICE_MODES: PracticeMode[] = [
  listeningMode,
  speakingMode,
  patternsMode,
  simulatorMode,
  missionsMode,
  vocabularyMode,
  phrasesMode,
  cultureMode,
];

/** Look up a registered mode by its route id (null when unknown/stale). */
export const getPracticeMode = (id: string): PracticeMode | null =>
  PRACTICE_MODES.find((mode) => mode.id === id) ?? null;
