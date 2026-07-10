// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/listening.stub.tsx
// Description: Registry entry for the Listening Engine (CONTENT-ARCHITECTURE §3: dialogues,
//   slow/normal/natural speeds, multi-voice, transcript reveal, word replay, dictation,
//   comprehension checks). The engine lives in ../listening/ (ListeningView + audio/content/
//   config modules); this file only registers it per the ENGINE INTEGRATION CONTRACT in
//   ../registry.ts (export name and mode id are stable — the hub routes by id).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { Headphones } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const listeningMode: PracticeMode = {
  id: 'listening',
  title: 'Listening',
  subtitle: 'Real speech · slow → natural',
  icon: Headphones,
  iconBgClassName: 'bg-[#34C759]',
  status: 'available',
  // Works offline on already-cached clips; first play of a line needs the TTS edge
  // function, surfaced per-action as a calm inline error (never a whole-mode gate).
  requiresOnline: false,
  Component: lazy(() => import('../listening/ListeningView')),
};
