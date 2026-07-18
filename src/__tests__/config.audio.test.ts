// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/__tests__/config.audio.test.ts
// Description: Guards the EN-8 server-audio config defaults and — critically — that importing
//   src/config does NOT throw when `import.meta.env.VITE_AUDIO_VERPEX_BASE` is unset. The verpexBase
//   read is optional-chained so config stays import-safe outside Vite (Playwright's Node collection
//   context has no import.meta.env); an unguarded read regressed the WHOLE e2e suite to 0 collected.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-18

import { describe, expect, it } from 'vitest';
import { config } from '../config';

describe('config.audio (EN-8 server tier)', () => {
  it('imports without throwing and defaults verpexBase to same-origin /audio when the env var is unset', () => {
    // No VITE_AUDIO_VERPEX_BASE is set in the test env → the optional-chained read falls back.
    expect(config.audio.verpexBase).toBe('/audio');
  });

  it('buffers through the public tts-audio bucket with a short server-tier timeout', () => {
    expect(config.audio.supabaseAudioBucket).toBe('tts-audio');
    expect(config.audio.serverTierTimeoutMs).toBeGreaterThan(0);
    expect(config.audio.serverTierTimeoutMs).toBeLessThan(config.net.requestTimeoutMs);
  });
});
