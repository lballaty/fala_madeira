// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/modes/speaking.stub.tsx
// Description: Registry entry for the Speaking Coach + Pronunciation Trainer engine
//   (CONTENT-ARCHITECTURE §3: repeat-after-me, shadowing, record-and-compare, response-speed).
//   Shipped by the engine-speaking-pronunciation plan step: status 'available', Component →
//   the real lazy view in ../speaking/SpeakingView. Export name `speakingMode` and mode id
//   'speaking' are stable (the hub routes by id; the registry imports by name) — contract in
//   ../registry.ts. requiresOnline is false: drills degrade to offline-capable self-assessment
//   when recognition/mic are unavailable (reference TTS needs the network on a cache miss, but
//   the mode as a whole does not — so no "online" badge).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { lazy } from 'react';
import { Mic } from 'lucide-react';
import type { PracticeMode } from '../registry';

export const speakingMode: PracticeMode = {
  id: 'speaking',
  title: 'Speaking & Pronunciation',
  subtitle: 'Repeat, shadow, record & compare, response speed',
  icon: Mic,
  iconBgClassName: 'bg-[#FF3B30]',
  status: 'available',
  requiresOnline: false,
  Component: lazy(() => import('../speaking/SpeakingView')),
};
