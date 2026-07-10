// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/culture.stub.tsx
// Description: Registry entry for the Cultural Context Layer (CONTENT-ARCHITECTURE §3 E7:
//   social code, register, indirectness explainers over situation.cultural_notes). Engine
//   landed by the cultural-layer-and-phrase-library plan step — the real view lives in
//   src/features/culture/CultureView.tsx (lazy-loaded body; the hub owns the chrome).
//   Export name and mode id are contract-stable (ENGINE INTEGRATION CONTRACT in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { Handshake } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const cultureMode: PracticeMode = {
  id: 'culture',
  title: 'Culture',
  subtitle: 'Register, indirectness, social code',
  icon: Handshake,
  iconBgClassName: 'bg-[#B25000]',
  status: 'available',
  // Curated explainers are static; cultural notes read from cached/bundled content.
  requiresOnline: false,
  Component: lazy(() => import('../../culture/CultureView')),
};
