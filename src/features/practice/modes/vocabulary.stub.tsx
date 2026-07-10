// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/vocabulary.stub.tsx
// Description: Registry entry for Vocabulary Review (CONTENT-ARCHITECTURE §3/§6: adaptive
//   spaced repetition over the SM-2 substrate, 4 dimensions hear/say/retrieve/avoid).
//   Engine SHIPPED by the engine-vocabulary-review step: flip flashcards graded
//   Again/Hard/Good/Easy through useDueItems.applyGrade; all engine code lives in
//   ../vocabulary/ (item_key convention `vocab:<situation_id>:<word>` — see
//   ../vocabulary/itemKeys.ts). Export name and mode id are contract-stable
//   (ENGINE INTEGRATION CONTRACT in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { Layers } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const vocabularyMode: PracticeMode = {
  id: 'vocabulary',
  title: 'Vocabulary Review',
  subtitle: 'Spaced repetition · 4 dimensions',
  icon: Layers,
  iconBgClassName: 'bg-[#AF52DE]',
  status: 'available',
  requiresOnline: false,
  Component: lazy(() => import('../vocabulary/VocabularyView')),
};
