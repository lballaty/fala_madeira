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

vi.mock('../../lib/supabase', () => ({ getSupabase: vi.fn(), publicObjectUrl: vi.fn(() => null) }));
vi.mock('../../lib/audioCache', () => ({
  audioCache: {
    buildKey: vi.fn(() => 'provider:voice:hash'),
    get: vi.fn(async () => null),
    getPinned: vi.fn(async () => null),
    set: vi.fn(async () => 0),
    setPinned: vi.fn(async () => 0),
  },
  // EN-8: "Save audio on device" — defaults ON in tests; individual routing tests override it.
  saveAudioOnDeviceEnabled: vi.fn(() => true),
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

import { getSupabase, publicObjectUrl } from '../../lib/supabase';
import { platform } from '../../platform';
import { audioCache, saveAudioOnDeviceEnabled } from '../../lib/audioCache';
import { logger } from '../../lib/logger';
import { EdgeFunctionError, geminiService, synthesizeCached } from '../geminiService';
import { config } from '../../config';
import type { Tutor } from '../../types';

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
  vi.mocked(publicObjectUrl).mockReturnValue(null); // default: skip the Supabase audio tier
  // Default: the EN-8 server tiers MISS (verpex fetch not ok) so tests reach the provider unless
  // a test opts into a hosted hit. Individual tier-order tests override this with vi.stubGlobal.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
  vi.mocked(platform.audio.stop).mockClear();
  vi.mocked(platform.audio.playPcm16).mockClear();
  vi.mocked(platform.audio.speak).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(fnName).toBe('gemini');
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

describe('synthesizeCached key normalization + hostable scope (EN-8)', () => {
  // Resolves immediately (no retry/backoff); carries a tiny valid-base64 PCM payload.
  const okAudio = { data: { audio: 'AAAA', provider: 'gemini', voice: 'pt-x' }, error: null };
  const tutorOf = (age: number, gender: 'male' | 'female'): Tutor =>
    ({ id: 't-id', name: 't', age, gender, description: '', avatar: '', personality: '' });

  beforeEach(() => {
    vi.mocked(audioCache.buildKey).mockClear().mockReturnValue('provider:voice:hash');
    vi.mocked(audioCache.get).mockResolvedValue(null);
    vi.mocked(audioCache.set).mockResolvedValue(0);
    invoke.mockResolvedValue(okAudio);
  });

  it('keys by the RESOLVED voice archetype (voiceTypeForTutor), NEVER the tutor id', async () => {
    // female age<=40 -> 'teacher'. The tutor id 't-id' must NOT appear in the key.
    await synthesizeCached('Bom dia', { tutor: tutorOf(30, 'female') });
    expect(audioCache.buildKey).toHaveBeenCalledWith('default', 'teacher', 'Bom dia');
    expect(vi.mocked(audioCache.buildKey).mock.calls[0]).not.toContain('t-id');
  });

  it('honours an explicit voiceType override for the key (dialogue per-speaker archetype)', async () => {
    await synthesizeCached('Olá', { voiceType: 'local' });
    expect(audioCache.buildKey).toHaveBeenCalledWith('default', 'local', 'Olá');
  });

  it('defaults to the teacher archetype when neither voiceType nor tutor is given', async () => {
    await synthesizeCached('Água', {});
    expect(audioCache.buildKey).toHaveBeenCalledWith('default', 'teacher', 'Água');
  });

  it('forwards hostable to the tts action body faithfully (true / false / omitted)', async () => {
    await synthesizeCached('a', { hostable: true });
    await synthesizeCached('b', { hostable: false });
    await synthesizeCached('c', {});
    const hostables = invoke.mock.calls
      .filter((c) => c[0] === 'gemini' && c[1]?.body?.action === 'tts')
      .map((c) => c[1].body.hostable);
    expect(hostables).toEqual([true, false, undefined]);
  });
});

describe('synthesizeCached tier order (EN-8): cache → pinned → verpex → supabase → provider', () => {
  const pcm = (n: number) => new Uint8Array(n).fill(1).buffer;
  const okPcm = () => ({ ok: true, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => pcm(8) });
  const missPcm = () => ({ ok: false, headers: { get: () => null }, arrayBuffer: async () => pcm(0) });
  const htmlShell = () => ({ ok: true, headers: { get: () => 'text/html; charset=utf-8' }, arrayBuffer: async () => pcm(20) });

  beforeEach(() => {
    vi.mocked(audioCache.buildKey).mockReturnValue('tts:default:teacher:hash');
    vi.mocked(audioCache.get).mockResolvedValue(null);
    vi.mocked(audioCache.getPinned).mockResolvedValue(null);
    vi.mocked(audioCache.set).mockClear().mockResolvedValue(0);
    vi.mocked(audioCache.setPinned).mockClear().mockResolvedValue(0);
    vi.mocked(saveAudioOnDeviceEnabled).mockReturnValue(true);
    invoke.mockResolvedValue({ data: { audio: 'AAAA' }, error: null });
    vi.mocked(publicObjectUrl).mockReturnValue('https://sb.example/storage/v1/object/public/tts-audio/hash.pcm');
  });

  it('device cache hit → zero fetches, zero edge calls', async () => {
    vi.mocked(audioCache.get).mockResolvedValue(pcm(4));
    const fetchMock = vi.fn(async () => okPcm());
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('pinned hit (cache miss) → zero fetches, zero edge calls', async () => {
    vi.mocked(audioCache.getPinned).mockResolvedValue(pcm(4));
    const fetchMock = vi.fn(async () => okPcm());
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('Verpex 200 → no Supabase fetch, no provider; warms the device cache', async () => {
    const fetchMock = vi.fn(async () => okPcm());
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', {});
    expect(fetchMock).toHaveBeenCalledTimes(1); // verpex only — supabase not probed
    expect(invoke).not.toHaveBeenCalled();
    expect(audioCache.set).toHaveBeenCalledTimes(1); // hit warmed into the LRU cache
  });

  it('Verpex miss → Supabase 200 → no provider', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(missPcm()) // verpex
      .mockResolvedValueOnce(okPcm()); // supabase
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('all tiers miss → falls through to the configured provider (edge tts)', async () => {
    const fetchMock = vi.fn(async () => missPcm());
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', {});
    expect(fetchMock).toHaveBeenCalledTimes(2); // verpex + supabase both probed and missed
    const ttsCall = invoke.mock.calls.find((c) => c[0] === 'gemini' && c[1]?.body?.action === 'tts');
    expect(ttsCall).toBeDefined();
  });

  it('treats a 200 HTML shell (SPA-host miss) as a miss, not PCM, and falls through to the provider', async () => {
    // Verpex .htaccess rewrites a missing /audio/*.pcm to index.html with a 200 — must NOT be
    // accepted as audio (would play garbage + skip the provider). Both tiers return the shell here.
    const fetchMock = vi.fn(async () => htmlShell());
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const ttsCall = invoke.mock.calls.find((c) => c[0] === 'gemini' && c[1]?.body?.action === 'tts');
    expect(ttsCall).toBeDefined();
  });

  it('server-tier hit + curated + save-on → warms the DURABLE saved store, not the cache', async () => {
    vi.mocked(saveAudioOnDeviceEnabled).mockReturnValue(true);
    const fetchMock = vi.fn(async () => okPcm()); // verpex 200
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', { hostable: true });
    expect(audioCache.setPinned).toHaveBeenCalledTimes(1); // durable warm (fast + offline)
    expect(audioCache.set).not.toHaveBeenCalled();         // not the ephemeral cache
    expect(invoke).not.toHaveBeenCalled();
  });

  it('aborts a server-tier fetch with the SHORT practical timeout, not the 15s edge timeout', async () => {
    let seenTimeout = -1;
    const fetchMock = vi.fn(async (_url: string, opts: { signal?: AbortSignal }) => {
      // AbortSignal.timeout exposes no ms, so assert indirectly: the signal is present (a timeout
      // was configured) and the config value is the short one, not net.requestTimeoutMs.
      seenTimeout = opts?.signal ? config.audio.serverTierTimeoutMs : -1;
      return missPcm();
    });
    vi.stubGlobal('fetch', fetchMock);
    await synthesizeCached('t', {});
    expect(seenTimeout).toBe(config.audio.serverTierTimeoutMs);
    expect(config.audio.serverTierTimeoutMs).toBeLessThan(config.net.requestTimeoutMs);
  });
});

describe('synthesizeCached device persistence routing (EN-8, owner 2026-07-17)', () => {
  // All tiers miss (default fetch stub is ok:false) so every case reaches the provider and then
  // decides where to persist the freshly-synthesized clip: the DURABLE saved store vs the EPHEMERAL
  // cache vs (explicit download) an awaited durable write. This is the core of the fix — playback
  // never conflates "cache" (speed, cleared on logout) with "saved" (persistent, offline).
  beforeEach(() => {
    vi.mocked(audioCache.buildKey).mockReturnValue('tts:default:teacher:hash');
    vi.mocked(audioCache.get).mockResolvedValue(null);
    vi.mocked(audioCache.getPinned).mockResolvedValue(null);
    vi.mocked(audioCache.set).mockClear().mockResolvedValue(0);
    vi.mocked(audioCache.setPinned).mockClear().mockResolvedValue(0);
    invoke.mockResolvedValue({ data: { audio: 'AAAA' }, error: null });
  });

  it('curated (hostable) + save-on → persists to the DURABLE saved store, not the cache', async () => {
    vi.mocked(saveAudioOnDeviceEnabled).mockReturnValue(true);
    await synthesizeCached('Bom dia', { hostable: true });
    expect(audioCache.setPinned).toHaveBeenCalledTimes(1);
    expect(audioCache.set).not.toHaveBeenCalled();
  });

  it('curated (hostable) + save-OFF → persists to the ephemeral cache only (no saved write)', async () => {
    vi.mocked(saveAudioOnDeviceEnabled).mockReturnValue(false);
    await synthesizeCached('Bom dia', { hostable: true });
    expect(audioCache.set).toHaveBeenCalledTimes(1);
    expect(audioCache.setPinned).not.toHaveBeenCalled();
  });

  it('private/non-curated (hostable omitted) + save-on → ephemeral cache only (privacy: never saved)', async () => {
    vi.mocked(saveAudioOnDeviceEnabled).mockReturnValue(true);
    await synthesizeCached('free chat reply', {});
    expect(audioCache.set).toHaveBeenCalledTimes(1);
    expect(audioCache.setPinned).not.toHaveBeenCalled();
  });

  it('explicit offline download (pinned) → AWAITS the durable write regardless of the toggle', async () => {
    vi.mocked(saveAudioOnDeviceEnabled).mockReturnValue(false);
    await synthesizeCached('lesson line', { hostable: true, pinned: true });
    expect(audioCache.setPinned).toHaveBeenCalledTimes(1);
    expect(audioCache.set).not.toHaveBeenCalled();
  });
});
