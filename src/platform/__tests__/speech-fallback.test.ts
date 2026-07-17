// File: src/platform/__tests__/speech-fallback.test.ts
// Description: Guards EN-27 P1.7 — the cloud speech fallback routed start/transcribe failures ONLY
//   to an optional errorCb, so with no callback bound the failure vanished. These tests inject a
//   fake provider + recorder, force each failure, and assert the adapter now LOGS
//   (CLOUD_SPEECH_START_RECORDING_FAILED / CLOUD_SPEECH_TRANSCRIPTION_FAILED) before delegating to
//   the (optional) errorCb — never silent.
// Author: EN-27 error-hardening (test build-out)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), critical: vi.fn() },
}));

import { createCloudSpeechAdapter, type CloudSttProvider, type CloudSttRecorder } from '../speech-fallback';
import { logger } from '../../lib/logger';

const makeRecorder = (over: Partial<CloudSttRecorder> = {}): CloudSttRecorder => ({
  isRecordingSupported: () => true,
  startRecording: vi.fn(async () => {}),
  stopRecording: vi.fn(async () => new Blob()),
  ...over,
});

const makeProvider = (over: Partial<CloudSttProvider> = {}): CloudSttProvider => ({
  isAvailable: () => true,
  transcribe: vi.fn(async () => 'olá'),
  ...over,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.clearAllMocks());

describe('cloud speech fallback — no silent failures (EN-27 P1.7)', () => {
  it('logs CLOUD_SPEECH_START_RECORDING_FAILED when startRecording rejects', async () => {
    const recorder = makeRecorder({ startRecording: vi.fn(async () => { throw new Error('mic denied'); }) });
    const adapter = createCloudSpeechAdapter(makeProvider(), recorder);

    adapter.start({ language: 'pt-PT' });
    await flush();

    expect(logger.error).toHaveBeenCalledWith(
      'CLOUD_SPEECH_START_RECORDING_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'SYSTEM_HEALTH' }),
    );
  });

  it('logs CLOUD_SPEECH_TRANSCRIPTION_FAILED when transcribe rejects, even with no errorCb bound', async () => {
    const provider = makeProvider({ transcribe: vi.fn(async () => { throw new Error('stt 500'); }) });
    const adapter = createCloudSpeechAdapter(provider, makeRecorder());

    adapter.start();
    await flush();
    adapter.stop();
    await flush();

    expect(logger.error).toHaveBeenCalledWith(
      'CLOUD_SPEECH_TRANSCRIPTION_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'SYSTEM_HEALTH' }),
    );
  });

  it('does not log on the happy path (start + transcribe succeed)', async () => {
    const adapter = createCloudSpeechAdapter(makeProvider(), makeRecorder());
    let result = '';
    adapter.onResult((r) => { result = r.transcript; });

    adapter.start();
    await flush();
    adapter.stop();
    await flush();

    expect(logger.error).not.toHaveBeenCalled();
    expect(result).toBe('olá');
  });
});
