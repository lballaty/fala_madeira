// File: src/lib/__tests__/audioManifest.test.ts
// Description: Locks the EN-34 client generation resolver (src/lib/audioManifest.ts): it is INERT
//   when the flag is off (returns 1 with no query), reads only the generation-≥2 exceptions when on,
//   defaults unknown keys to 1, degrades to 1 (never throws) on a read error / unconfigured client,
//   and memoizes the load for the session so playback pays at most one round-trip.
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable flag behind a getter so individual tests flip the feature on/off (config is read live).
const flag = { on: true };
vi.mock('../../config', () => ({ config: { audio: { get generationManifestEnabled() { return flag.on; } } } }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../supabase', () => ({ getSupabase: vi.fn() }));

import { getSupabase } from '../supabase';
import { logger } from '../logger';
import { resolveGeneration, loadGenerationManifest, invalidateGenerationManifest } from '../audioManifest';

/** Supabase mock whose from().select().gte() resolves to the given {data,error}. */
const supabaseReturning = (result: { data?: unknown; error?: unknown }) => {
  const gte = vi.fn(async () => result);
  const select = vi.fn(() => ({ gte }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as ReturnType<typeof getSupabase>, from, select, gte };
};

beforeEach(() => {
  flag.on = true;
  invalidateGenerationManifest();
  vi.mocked(logger.warn).mockClear();
  vi.mocked(getSupabase).mockReset();
});

describe('audioManifest.resolveGeneration', () => {
  it('is INERT when the flag is off: returns 1 with no Supabase query', async () => {
    flag.on = false;
    await expect(resolveGeneration('tts:default:teacher:hash')).resolves.toBe(1);
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it('returns the manifest generation for a regenerated key and 1 for anything else', async () => {
    const sb = supabaseReturning({ data: [{ build_key: 'tts:default:teacher:hash', generation: 3 }], error: null });
    vi.mocked(getSupabase).mockReturnValue(sb.client);
    await expect(resolveGeneration('tts:default:teacher:hash')).resolves.toBe(3);
    await expect(resolveGeneration('tts:default:teacher:other')).resolves.toBe(1); // unknown → legacy
  });

  it('queries only the exceptions: select(build_key, generation) filtered generation ≥ 2', async () => {
    const sb = supabaseReturning({ data: [], error: null });
    vi.mocked(getSupabase).mockReturnValue(sb.client);
    await loadGenerationManifest();
    expect(sb.from).toHaveBeenCalledWith('tts_audio_hosted');
    expect(sb.select).toHaveBeenCalledWith('build_key, generation');
    expect(sb.gte).toHaveBeenCalledWith('generation', 2);
  });

  it('degrades to 1 and WARNs (never throws) on a read error', async () => {
    const sb = supabaseReturning({ data: null, error: { message: 'relation does not exist' } });
    vi.mocked(getSupabase).mockReturnValue(sb.client);
    await expect(resolveGeneration('tts:default:teacher:hash')).resolves.toBe(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to 1 (no throw, no warn) when the Supabase client is unconfigured', async () => {
    vi.mocked(getSupabase).mockReturnValue(null as unknown as ReturnType<typeof getSupabase>);
    await expect(resolveGeneration('tts:default:teacher:hash')).resolves.toBe(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('memoizes the load for the session: two resolves trigger ONE query', async () => {
    const sb = supabaseReturning({ data: [{ build_key: 'k', generation: 2 }], error: null });
    vi.mocked(getSupabase).mockReturnValue(sb.client);
    await resolveGeneration('a');
    await resolveGeneration('b');
    expect(sb.from).toHaveBeenCalledTimes(1);
    // invalidation forces a fresh read (used after an admin regeneration lands)
    invalidateGenerationManifest();
    await resolveGeneration('c');
    expect(sb.from).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed rows (non-numeric / < 2 generation) defensively', async () => {
    const sb = supabaseReturning({
      data: [
        { build_key: 'good', generation: 4 },
        { build_key: 'bad-gen', generation: 'x' },
        { build_key: 'legacy', generation: 1 },
        { build_key: '', generation: 9 },
      ],
      error: null,
    });
    vi.mocked(getSupabase).mockReturnValue(sb.client);
    await expect(resolveGeneration('good')).resolves.toBe(4);
    await expect(resolveGeneration('bad-gen')).resolves.toBe(1);
    await expect(resolveGeneration('legacy')).resolves.toBe(1);
  });
});
