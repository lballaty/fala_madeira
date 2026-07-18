// File: src/platform/native/__tests__/speech.native.test.ts
// Description: Guards EN-27 P0.5 (TB-6 "say it back doesn't listen" / TB-10 mic-error shapes). The
//   native speech adapter swallowed three failures — the availability probe, the final-transcript
//   fetch (OS captured speech, plugin lost it → surfaced as "no match"), and stop(). These tests
//   mock @capgo/capacitor-speech-recognition and assert each now logs
//   (NATIVE_SPEECH_PROBE_FAILED / NATIVE_SPEECH_FINAL_TRANSCRIPT_FETCH_FAILED /
//   NATIVE_SPEECH_STOP_FAILED) before its callback/fallback.
// Author: EN-27 error-hardening (test build-out)
// Created: 2026-07-17

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), critical: vi.fn() },
}));

// A fake SpeechRecognition plugin whose event listeners are captured so the test can drive the
// native session lifecycle (started / stopped) deterministically.
type Listener = (event: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const fire = (event: string, payload: Record<string, unknown>) => {
  for (const cb of listeners[event] ?? []) cb(payload);
};
const plugin = {
  available: vi.fn(async () => ({ available: true })),
  requestPermissions: vi.fn(async () => ({ speechRecognition: 'granted' })),
  addListener: vi.fn(async (event: string, cb: Listener) => {
    (listeners[event] ??= []).push(cb);
    return { remove: vi.fn(async () => {}) };
  }),
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  getLastPartialResult: vi.fn(async () => ({ available: true, text: 'olá' })),
};

vi.mock('@capgo/capacitor-speech-recognition', () => ({ SpeechRecognition: plugin }));

import { createNativeSpeechAdapter } from '../speech.native';
import { logger } from '../../../lib/logger';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k];
  plugin.available.mockReset().mockResolvedValue({ available: true });
  plugin.requestPermissions.mockReset().mockResolvedValue({ speechRecognition: 'granted' });
  plugin.start.mockReset().mockResolvedValue(undefined);
  plugin.stop.mockReset().mockResolvedValue(undefined);
  plugin.getLastPartialResult.mockReset().mockResolvedValue({ available: true, text: 'olá' });
});
afterEach(() => vi.clearAllMocks());

describe('native speech — failures are visible (EN-27 P0.5 / TB-6/TB-10)', () => {
  it('logs NATIVE_SPEECH_PROBE_FAILED when the availability probe rejects', async () => {
    plugin.available.mockRejectedValueOnce(new Error('recognizer unavailable'));
    const adapter = createNativeSpeechAdapter();

    adapter.isAvailable(); // kicks off the lazy background probe
    await tick();
    await tick();

    expect(logger.warn).toHaveBeenCalledWith(
      'NATIVE_SPEECH_PROBE_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'SYSTEM_HEALTH' }),
    );
  });

  it('logs NATIVE_SPEECH_STOP_FAILED when stop() rejects', async () => {
    plugin.stop.mockRejectedValueOnce(new Error('stop failed'));
    const adapter = createNativeSpeechAdapter();

    adapter.start({ language: 'pt-PT' });
    await tick();
    fire('listeningState', { state: 'started' }); // drive listening=true
    await tick();

    adapter.stop();
    await tick();
    await tick();

    expect(logger.error).toHaveBeenCalledWith(
      'NATIVE_SPEECH_STOP_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'SYSTEM_HEALTH' }),
    );
  });

  it('logs NATIVE_SPEECH_FINAL_TRANSCRIPT_FETCH_FAILED when the plugin loses the captured transcript', async () => {
    plugin.getLastPartialResult.mockRejectedValueOnce(new Error('transcript gone'));
    const adapter = createNativeSpeechAdapter();

    adapter.start({ language: 'pt-PT' });
    await tick();
    fire('listeningState', { state: 'started' });
    await tick();
    // Native session ends → endSession → emitFinalFromCache → getLastPartialResult rejects.
    fire('listeningState', { state: 'stopped' });
    await tick();
    await tick();

    expect(logger.error).toHaveBeenCalledWith(
      'NATIVE_SPEECH_FINAL_TRANSCRIPT_FETCH_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'SYSTEM_HEALTH' }),
    );
  });
});
