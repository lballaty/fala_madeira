// File: src/platform/index.ts
// Description: Runtime capability resolver for the cross-platform adapter layer.
//   Detects whether the app is running inside a Capacitor native shell (guarded so it
//   works when Capacitor is not installed at all) and exports the `platform` singleton
//   `{ speech, audio, storage, notifications }`. UI and feature code import ONLY from
//   'src/platform' (or the types module) — never from web/, native/, or browser globals
//   directly (ENGINEERING-STANDARDS §1.2).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { Platform } from './types';
import { createWebSpeechAdapter } from './web/speech.web';
import { createWebAudioAdapter } from './web/audio.web';
import { createWebStorageAdapter } from './web/storage.web';
import { createWebNotificationsAdapter } from './web/notifications.web';
import { createNativeSpeechAdapter } from './native/speech.native';
import { createNativeAudioAdapter } from './native/audio.native';
import { createNativeStorageAdapter } from './native/storage.native';
import { createNativeNotificationsAdapter } from './native/notifications.native';

export * from './types';
// Cloud STT fallback SEAM (contract + wrapper only — no provider exists yet, and the
// resolver below does NOT route through it; zero behavior change until one is registered).
export * from './speech-fallback';

// True when running inside a Capacitor native shell. Guarded lookups so this
// module is safe when Capacitor is not installed (web/PWA builds) or when the
// runtime global is missing (SSR, tests).
const detectNativePlatform = (): boolean => {
  try {
    const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return typeof capacitor?.isNativePlatform === 'function'
      ? capacitor.isNativePlatform() === true
      : false;
  } catch {
    return false;
  }
};

const buildPlatform = (): Platform => {
  const isNative = detectNativePlatform();
  if (isNative) {
    return {
      isNative,
      speech: createNativeSpeechAdapter(),
      audio: createNativeAudioAdapter(),
      storage: createNativeStorageAdapter(),
      notifications: createNativeNotificationsAdapter(),
    };
  }
  return {
    isNative,
    speech: createWebSpeechAdapter(),
    audio: createWebAudioAdapter(),
    storage: createWebStorageAdapter(),
    notifications: createWebNotificationsAdapter(),
  };
};

// Singleton platform surface. Adapters are constructed eagerly but touch no
// browser APIs until first use (all implementations initialize lazily).
export const platform: Platform = buildPlatform();
