// File: capacitor.config.ts
// Description: Capacitor configuration for the FalaMadeira native shells (iOS-first,
//   Android later). Bundle id contract: com.searchingfool.falamadeira (AGENTS.md §5).
//   webDir must match the Vite build output (dist).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.searchingfool.falamadeira',
  appName: 'FalaMadeira',
  webDir: 'dist'
};

export default config;
