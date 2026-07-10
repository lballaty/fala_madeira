// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/phrases.stub.tsx
// Description: Registry entry for the Phrase Library (CONTENT-ARCHITECTURE §3 E10: searchable
//   phrases, standard + spoken, when-to-use, formal ↔ informal, audio, variants). Engine landed
//   by the cultural-layer-and-phrase-library plan step — the real view lives in
//   src/features/phrases/PhraseLibraryView.tsx (lazy-loaded body; the hub owns the chrome).
//   Export name and mode id are contract-stable (ENGINE INTEGRATION CONTRACT in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { Library } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const phrasesMode: PracticeMode = {
  id: 'phrases',
  title: 'Phrase Library',
  subtitle: 'Search · formal ↔ informal · when to use',
  icon: Library,
  iconBgClassName: 'bg-[#8E8E93]',
  status: 'available',
  // Browsing/search/filters work fully offline from cached content; 🔊 needs the
  // network only for clips not yet in the audio cache.
  requiresOnline: false,
  Component: lazy(() => import('../../phrases/PhraseLibraryView')),
};
