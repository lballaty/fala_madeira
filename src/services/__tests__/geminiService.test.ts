// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/services/__tests__/geminiService.test.ts
// Description: Unit tests for the observability additions to the edge-function client
//   (src/services/geminiService.ts): the typed EdgeFunctionError that carries the server code +
//   support ref (plan obs-tts-fallback), the W3C `traceparent` header sent on every edge invoke
//   (plan obs-trace), and playSpeech's graceful degradation to platform speech synthesis when the
//   edge returns TTS_UNAVAILABLE (plan obs-tts-fallback). The supabase, platform, and audioCache
//   boundaries are mocked so the test is hermetic.
// Author: Observability test build-out (with assistant)
// Created: 2026-07-14

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ getSupabase: vi.fn() }));
vi.mock('../../lib/audioCache', () => ({
  audioCache: {
    buildKey: vi.fn(() => 'provider:voice:hash'),
    get: vi.fn(async () => null),
    set: vi.fn(async () => 0),
  },
}));
vi.mock('../../platform', () => ({
  platform: {
    audio: {
      stop: vi.fn(),
      playPcm16: vi.fn(async () => undefined),
      speak: vi.fn(async () => undefined),
    },
  },
}));

import { getSupabase } from '../../lib/supabase';
import { platform } from '../../platform';
import { logger } from '../../lib/logger';
import { EdgeFunctionError, geminiService } from '../geminiService';

const edgeError = (status: number, code: string) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: {
    status,
    json: async () => ({ error: { code, message: `${code} message`, requestId: `req-${code}` } }),
  },
});

const routeLogSink = (name: string, geminiResult: unknown) =>
  name === 'log-sink' ? Promise.resolve({ data: { inserted: 1 }, error: null }) : Promise.resolve(geminiResult);

const invoke = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  vi.mocked(getSupabase).mockReturnValue({ functions: { invoke } } as unknown as ReturnType<typeof getSupabase>);
  vi.mocked(platform.audio.stop).mockClear();
  vi.mocked(platform.audio.playPcm16).mockClear();
  vi.mocked(platform.audio.speak).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EdgeFunctionError', () => {
  it('carries the machine code + ref and renders the userMessage as its message', () => {
    const err = new EdgeFunctionError('TTS_UNAVAILABLE', 'Server TTS unavailable', 'req-1234-abcd');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('TTS_UNAVAILABLE');
    expect(err.ref).toBe('req-1234-abcd');
    expect(err.message).toContain('Server TTS unavailable');
    expect(err.message).toContain('Ref:');
  });
});

describe('W3C traceparent header (obs-trace)', () => {
  it('sends a well-formed traceparent header on every edge invoke', async () => {
    invoke.mockResolvedValue({ data: { result: { title: 'x' } }, error: null });
    await geminiService.generateLesson('greetings');

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = invoke.mock.calls[0];
    expect(fnName).toBe('ai-gateway');
    expect(options.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });
});

describe('edge error log-level classification', () => {
  it('logs an EXPECTED business 4xx (VOICE_LIMIT_REACHED) at WARN, not ERROR', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');
    invoke.mockImplementation((name: string) => routeLogSink(name, { data: null, error: edgeError(429, 'VOICE_LIMIT_REACHED') }));

    await expect(geminiService.translateWord('água')).rejects.toBeInstanceOf(EdgeFunctionError);

    expect(warnSpy.mock.calls.some((c) => c[0] === 'edge_fn_failed')).toBe(true);
    expect(errorSpy.mock.calls.some((c) => c[0] === 'edge_fn_failed')).toBe(false);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs an UNEXPECTED error (BAD_REQUEST) at ERROR', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const errorSpy = vi.spyOn(logger, 'error');
    invoke.mockImplementation((name: string) => routeLogSink(name, { data: null, error: edgeError(400, 'BAD_REQUEST') }));

    await expect(geminiService.translateWord('x')).rejects.toBeInstanceOf(EdgeFunctionError);

    expect(errorSpy.mock.calls.some((c) => c[0] === 'edge_fn_failed')).toBe(true);
    expect(warnSpy.mock.calls.some((c) => c[0] === 'edge_fn_failed')).toBe(false);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('playSpeech TTS fallback (obs-tts-fallback)', () => {
  const ttsUnavailableError = {
    message: 'Edge Function returned a non-2xx status code',
    context: {
      status: 503,
      json: async () => ({
        error: { code: 'TTS_UNAVAILABLE', message: 'Server text-to-speech is unavailable.', requestId: 'req-tts-1' },
      }),
    },
  };

  it('degrades to platform speech synthesis (no throw) when the edge returns TTS_UNAVAILABLE', async () => {
    // Route the gemini call to the TTS error but let the logger's own log-sink flush succeed —
    // otherwise the failed edge_fn_failed log would requeue forever under fake timers.
    invoke.mockImplementation((name: string) =>
      name === 'log-sink'
        ? Promise.resolve({ data: { inserted: 1 }, error: null })
        : Promise.resolve({ data: null, error: ttsUnavailableError }),
    );

    const p = geminiService.playSpeech('Bom dia', undefined, 1.1);
    await vi.runAllTimersAsync(); // drain the transport retry backoff (503 is retryable)
    await p;

    expect(platform.audio.speak).toHaveBeenCalledTimes(1);
    expect(platform.audio.speak).toHaveBeenCalledWith('Bom dia', expect.objectContaining({ lang: 'pt-PT', rate: 1.1 }));
    // The primary PCM playback path must NOT have produced audio.
    expect(platform.audio.playPcm16).not.toHaveBeenCalled();
  });

  it('does NOT fall back for non-TTS edge errors — it rethrows', async () => {
    const genericError = {
      message: 'boom',
      context: {
        status: 500,
        json: async () => ({ error: { code: 'GEMINI_ERROR', message: 'The AI service failed.', requestId: 'req-2' } }),
      },
    };
    invoke.mockImplementation((name: string) =>
      name === 'log-sink'
        ? Promise.resolve({ data: { inserted: 1 }, error: null })
        : Promise.resolve({ data: null, error: genericError }),
    );

    const p = geminiService.playSpeech('Olá', undefined, 1);
    const settled = p.catch((e) => e as EdgeFunctionError);
    await vi.runAllTimersAsync();
    const err = await settled;

    expect(err).toBeInstanceOf(EdgeFunctionError);
    expect((err as EdgeFunctionError).code).toBe('GEMINI_ERROR');
    expect(platform.audio.speak).not.toHaveBeenCalled();
  });
});
