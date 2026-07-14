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
import { createWebAudioAdapter } from '../audio.web';
import { PlatformError } from '../../types';

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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
});
