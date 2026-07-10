// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/missions.stub.tsx
// Description: Registry entry for Real-World Missions (CONTENT-ARCHITECTURE §3: prep → do it
//   for real → after-action review; missions_log). Engine shipped by the engine-missions plan
//   step: status 'available', Component → ../missions/MissionsView (default-exports a
//   ComponentType<PracticeModeProps>). Export name and mode id are contract-stable
//   (ENGINE INTEGRATION CONTRACT in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { MapPin } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const missionsMode: PracticeMode = {
  id: 'missions',
  title: 'Missions',
  subtitle: 'Do it for real, out there',
  icon: MapPin,
  iconBgClassName: 'bg-[#FF9500]',
  status: 'available',
  requiresOnline: false,
  Component: lazy(() => import('../missions/MissionsView')),
};
