// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/simulator.stub.tsx
// Description: Registry entry for the Situation Simulator (CONTENT-ARCHITECTURE §3: branching
//   roleplay, difficulty L1 guided → L5 messy real-life; online-only via the tutor edge fn).
//   OWNED by the engine-situation-simulator plan step: status 'available', Component → the
//   real lazy body view (../simulator/SimulatorView). Export name and mode id are unchanged;
//   touch nothing else in the practice slice (ENGINE INTEGRATION CONTRACT in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { MessagesSquare } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const simulatorMode: PracticeMode = {
  id: 'simulator',
  title: 'Situation Simulator',
  subtitle: 'Branching roleplay · L1 guided → L5 messy',
  icon: MessagesSquare,
  iconBgClassName: 'bg-[#007AFF]',
  status: 'available',
  requiresOnline: true,
  Component: lazy(() => import('../simulator/SimulatorView')),
};
