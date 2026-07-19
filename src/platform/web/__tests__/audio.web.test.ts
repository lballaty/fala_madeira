// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/platform/web/__tests__/audio.web.test.ts
// Description: Unit tests for the NEW AudioAdapter.speak() Web-Speech synthesis method added for
//   the TTS graceful-degradation path (plan obs-tts-fallback). speak() is the fallback used when
//   SERVER TTS is unavailable. Covers: it drives window.speechSynthesis with a correctly-configured
//   utterance (lang/rate), fires onEnded from the utterance 'end' event, rejects a typed
//   PlatformError('audio','unavailable') when the platform has no speech synthesis, and stop()
//   cancels in-progress synthesis. The speech-synthesis globals are stubbed on globalThis (jsdom
//   does not provide them).
// Author: Observability test build-out (with assistant)
// Created: 2026-07-14

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// EN-27 P0.3: assert the device-speech onerror path LOGS (silence-as-success was the bug).
vi.mock('../../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    critical: vi.fn(),
  },
}));

import { createWebAudioAdapter } from '../audio.web';
import { PlatformError } from '../../types';
import { logger } from '../../../lib/logger';

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: ((event?: unknown) => void) | null;
}

const g = globalThis as unknown as {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
};

let speakSpy: ReturnType<typeof vi.fn>;
let cancelSpy: ReturnType<typeof vi.fn>;
let lastUtterance: FakeUtterance | null;

beforeEach(() => {
  lastUtterance = null;
  // Fire the utterance 'end' asynchronously, like a real engine, so onEnded is observable.
  speakSpy = vi.fn((u: FakeUtterance) => {
    lastUtterance = u;
    queueMicrotask(() => u.onend?.());
  });
  cancelSpy = vi.fn();
  g.speechSynthesis = { speak: speakSpy, cancel: cancelSpy };
  g.SpeechSynthesisUtterance = class {
    text: string;
    lang = '';
    rate = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  };
});

afterEach(() => {
  delete g.speechSynthesis;
  delete g.SpeechSynthesisUtterance;
  vi.restoreAllMocks();
});

describe('web AudioAdapter.speak() — TTS fallback', () => {
  it('speaks the text with the requested lang and rate', async () => {
    const adapter = createWebAudioAdapter();
    await adapter.speak('Olá', { lang: 'pt-PT', rate: 1.25 });
    expect(speakSpy).toHaveBeenCalledTimes(1);
    expect(lastUtterance?.text).toBe('Olá');
    expect(lastUtterance?.lang).toBe('pt-PT');
    expect(lastUtterance?.rate).toBe(1.25);
  });

  it('defaults to pt-PT and rate 1.0 when options are omitted', async () => {
    const adapter = createWebAudioAdapter();
    await adapter.speak('teste');
    expect(lastUtterance?.lang).toBe('pt-PT');
    expect(lastUtterance?.rate).toBe(1.0);
  });

  it('fires onEnded when the utterance finishes', async () => {
    const adapter = createWebAudioAdapter();
    const onEnded = vi.fn();
    await adapter.speak('fim', { onEnded });
    // Flush the queued microtask that fires onend.
    await Promise.resolve();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('rejects with PlatformError("audio","unavailable") when speech synthesis is absent', async () => {
    delete g.speechSynthesis;
    delete g.SpeechSynthesisUtterance;
    const adapter = createWebAudioAdapter();
    await expect(adapter.speak('nada')).rejects.toBeInstanceOf(PlatformError);
    await expect(adapter.speak('nada')).rejects.toMatchObject({ capability: 'audio', code: 'unavailable' });
  });

  it('stop() cancels in-progress synthesis', () => {
    const adapter = createWebAudioAdapter();
    adapter.stop();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('REJECTS (and logs, and still fires onEnded) when the utterance errors — EN-31 GAP 1: the silent device-speech failure now reaches the caller', async () => {
    // Suppress the default auto-onend so we control the outcome (the engine errors instead).
    speakSpy.mockImplementation((u: FakeUtterance) => { lastUtterance = u; });
    const adapter = createWebAudioAdapter();
    const onEnded = vi.fn();
    const pending = adapter.speak('falha', { lang: 'pt-PT', onEnded });
    await Promise.resolve(); // let synth.speak() register the handlers
    expect(lastUtterance?.onerror).toBeTypeOf('function');
    // Simulate the engine firing onerror — the "silence reported as success" case, now surfaced.
    lastUtterance?.onerror?.({ error: 'synthesis-failed' });
    // The promise REJECTS so geminiService.playSpeech → useSpeechPlayback shows the failure toast.
    await expect(pending).rejects.toMatchObject({ capability: 'audio', code: 'playback-failure' });
    // The failure is visible in the logger (observability preserved)...
    expect(logger.error).toHaveBeenCalledWith(
      'WEB_SPEECH_SYNTHESIS_ERROR',
      expect.any(String),
      expect.objectContaining({ category: 'SYSTEM_HEALTH' }),
    );
    // ...and the caller's spinner still clears on the failure path (onEnded contract preserved).
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('resolves on the timeout backstop (never rejects) when the engine neither ends nor errors', async () => {
    vi.useFakeTimers();
    try {
      speakSpy.mockImplementation((u: FakeUtterance) => { lastUtterance = u; }); // no onend, no onerror
      const adapter = createWebAudioAdapter();
      const onEnded = vi.fn();
      const pending = adapter.speak('sem fim', { onEnded });
      await vi.advanceTimersByTimeAsync(31_000); // past the 30s cap
      await expect(pending).resolves.toBeUndefined(); // timeout resolves, no false error
      expect(onEnded).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'WEB_SPEECH_SYNTHESIS_TIMEOUT',
        expect.any(String),
        expect.objectContaining({ category: 'SYSTEM_HEALTH' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
