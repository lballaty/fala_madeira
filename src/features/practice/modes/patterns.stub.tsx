// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/patterns.stub.tsx
// Description: Registry entry for the Pattern Builder engine (CONTENT-ARCHITECTURE §3:
//   phrase_patterns substitution drills — tomorrow → today → Friday → after lunch). The
//   engine lives in src/features/practice/patterns/ (PatternBuilderView + drill logic);
//   this file only registers it per the ENGINE INTEGRATION CONTRACT in ../registry.ts
//   (export name and mode id are stable; the registry imports this file by name).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { Puzzle } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const patternsMode: PracticeMode = {
  id: 'patterns',
  title: 'Pattern Builder',
  subtitle: 'One phrase, many situations',
  icon: Puzzle,
  iconBgClassName: 'bg-[#5856D6]',
  status: 'available',
  requiresOnline: false,
  Component: lazy(() => import('../patterns/PatternBuilderView')),
};
