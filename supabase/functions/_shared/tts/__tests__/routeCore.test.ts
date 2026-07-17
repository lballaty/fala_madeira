// File: supabase/functions/_shared/tts/__tests__/routeCore.test.ts
// Description: Outcome tests for the pure TTS routing core (EN-27 Option-1 edge coverage). Drives
//   routeTtsCore with fake providers + an injected persist spy and asserts the EF-37 behaviour that
//   was previously untestable (console-only, no Deno test harness): a provider failure PERSISTS a
//   TTS_PROVIDER_FAILED row and the chain continues; all-fail throws TtsUnavailableError; an
//   unresolvable BYO key ref persists TTS_BYO_KEY_REF_UNRESOLVED then falls back to the default
//   chain; unavailable providers are skipped (no persist); an explicit provider override wins.
// Author: EN-27 error-hardening (Option-1 edge coverage)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTtsCore, type RouteTtsDeps } from '../routeCore';
import { TtsUnavailableError, type ProviderId, type TtsProvider } from '../types';

const okAudio = { audioBase64: 'QUFB', mimeType: 'audio/l16', sampleRateHz: 24000, voice: 'v' };

const provider = (over: Partial<TtsProvider> = {}): TtsProvider => ({
  isAvailable: () => true,
  synthesize: vi.fn(async () => ({ ...okAudio })),
  ...over,
}) as TtsProvider;

// Build a full 6-provider registry; callers override the ones a test cares about.
const registry = (over: Partial<Record<ProviderId, TtsProvider>> = {}): Record<ProviderId, TtsProvider> => ({
  azure: provider({ isAvailable: () => false }),
  google: provider({ isAvailable: () => false }),
  polly: provider({ isAvailable: () => false }),
  gemini: provider({ isAvailable: () => false }),
  elevenlabs: provider({ isAvailable: () => false }),
  openai: provider({ isAvailable: () => false }),
  ...over,
});

const makeDeps = (providers: Record<ProviderId, TtsProvider>, over: Partial<RouteTtsDeps> = {}): RouteTtsDeps => ({
  providers,
  persist: vi.fn(async () => {}),
  resolveByoKey: vi.fn(() => false),
  voiceForTutor: vi.fn(() => 'Kore'),
  ...over,
});

const req = (over = {}) => ({ text: 'Bom dia', requestId: 'req-1', userId: 'u1', ...over });

afterEach(() => vi.clearAllMocks());

describe('routeTtsCore (EN-27 EF-37 outcome coverage)', () => {
  it('returns the first available provider that succeeds, with no persist', async () => {
    const providers = registry({ azure: provider({ isAvailable: () => true }) });
    const deps = makeDeps(providers);

    const result = await routeTtsCore(req(), deps);

    expect(result.provider).toBe('azure');
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it('PERSISTS TTS_PROVIDER_FAILED and continues the chain when a provider throws', async () => {
    const providers = registry({
      azure: provider({ isAvailable: () => true, synthesize: vi.fn(async () => { throw new Error('503 provider down'); }) }),
      google: provider({ isAvailable: () => true }),
    });
    const deps = makeDeps(providers);

    const result = await routeTtsCore(req(), deps);

    // Fell through azure (failed) to google (succeeded)...
    expect(result.provider).toBe('google');
    // ...and the azure failure landed a queryable row (the EF-37 gap).
    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'ERROR',
        eventType: 'TTS_PROVIDER_FAILED',
        requestId: 'req-1',
        userId: 'u1',
        details: expect.objectContaining({ provider: 'azure' }),
      }),
    );
  });

  it('persists EVERY provider failure and throws TtsUnavailableError when all fail (the 503 storm)', async () => {
    const down = () => provider({ isAvailable: () => true, synthesize: vi.fn(async () => { throw new Error('503'); }) });
    const providers = registry({ azure: down(), google: down(), polly: down(), gemini: down() });
    const deps = makeDeps(providers);

    await expect(routeTtsCore(req(), deps)).rejects.toBeInstanceOf(TtsUnavailableError);
    // One persisted ERROR row per attempted provider — ops can now query the storm.
    const failCalls = vi.mocked(deps.persist).mock.calls.filter((c) => c[0].eventType === 'TTS_PROVIDER_FAILED');
    expect(failCalls.length).toBe(4);
  });

  it('throws (no persist) when NO provider is configured — skipped, not failed', async () => {
    const deps = makeDeps(registry()); // all unavailable
    await expect(routeTtsCore(req(), deps)).rejects.toBeInstanceOf(TtsUnavailableError);
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it('persists TTS_BYO_KEY_REF_UNRESOLVED and falls back to the default chain', async () => {
    const providers = registry({ azure: provider({ isAvailable: () => true }) });
    const deps = makeDeps(providers, { resolveByoKey: vi.fn(() => false) });

    const result = await routeTtsCore(
      req({ preferredProvider: 'elevenlabs', byoKeyRef: 'TTS_ELEVENLABS_KEY_ALICE' }),
      deps,
    );

    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'WARN', eventType: 'TTS_BYO_KEY_REF_UNRESOLVED' }),
    );
    // Fell back to the default chain — azure served it.
    expect(result.provider).toBe('azure');
  });

  it('honours an explicit provider override (only that provider is tried)', async () => {
    const providers = registry({ openai: provider({ isAvailable: () => true }) });
    const deps = makeDeps(providers);

    const result = await routeTtsCore(req({ provider: 'openai' }), deps);

    expect(result.provider).toBe('openai');
  });
});
