// File: src/features/admin/audio/__tests__/useAudioReview.play.test.ts
// Description: EN-23b W2 unit tests for getPlaybackUrl. Proves the play path is no longer a dead
//   button for uncached clips: a device-cache HIT returns an object URL without synthesizing; a MISS
//   falls through to geminiService.synthesizeCached (cache→pinned→server tiers→provider); a synth
//   FAILURE routes through the centralized logger and a toast carrying the correlation id, and returns
//   null (no silent dead button). Hook load effect is skipped (isAdmin:false) to isolate getPlaybackUrl.
// Author: claude-en23b
// Created: 2026-07-19

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShowToast } from '../../../../hooks/useToast';

// Hook's imports are mocked so the module tree is hermetic and side-effect-free.
vi.mock('../../../../content/repository', () => ({ contentRepository: { listSituations: vi.fn(async () => []), listTracks: vi.fn(async () => []) } }));
vi.mock('../../../../lib/audio-download', () => ({ linesForSituation: vi.fn(() => []) }));
const cacheGet = vi.fn();
vi.mock('../../../../lib/audioCache', () => ({
  audioCache: { buildKey: (p: string, v: string, t: string) => `${p}:${v}:${t}`, get: (k: string) => cacheGet(k) },
}));
const synthesizeCached = vi.fn();
vi.mock('../../../../services/geminiService', () => ({ synthesizeCached: (...a: unknown[]) => synthesizeCached(...(a as [])) }));
const loggerError = vi.fn(() => ({ request_id: 'req-abc12345' }));
vi.mock('../../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => loggerError(...(a as [])) },
  userMessage: (_c: string, m: string, rid?: string) => (rid ? `${m} (ref ${rid.slice(0, 8)})` : m),
}));
vi.mock('../audioSignals', () => ({ scoreClip: vi.fn(async () => ({})) }));
vi.mock('../audioServerTier', () => ({ isServerTierAvailable: vi.fn(() => false), checkServerPresence: vi.fn(async () => 'unknown') }));
vi.mock('../ttsAudioReviewRepo', () => ({
  newCorrelationId: () => 'corr-test',
  isRepoError: (r: { ok: boolean }) => r.ok === false,
  getReviews: vi.fn(async () => ({ ok: true, data: {} })),
  listRegenQueue: vi.fn(async () => ({ ok: true, data: [] })),
  fetchHostedGenerations: vi.fn(async () => new Map()),
  upsertVerdict: vi.fn(async () => ({ ok: true, data: {} })),
  enqueueRegen: vi.fn(async () => ({ ok: true, data: null })),
}));

import { useAudioReview } from '../useAudioReview';

const CLIP = { buildKey: 'default:default:hash', text: 'Bom dia', voice: 'default', voiceType: undefined, situationId: 's1', level: 0 as const };

const showToast = vi.fn();
const makeHook = () =>
  renderHook(() =>
    useAudioReview({ supabase: {} as SupabaseClient, isAdmin: false, actorId: 'a1', showToast: showToast as unknown as ShowToast }),
  );

beforeEach(() => {
  // jsdom lacks URL.createObjectURL; stub it to a deterministic marker.
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => 'blob:preview');
});
afterEach(() => vi.clearAllMocks());

describe('useAudioReview.getPlaybackUrl (EN-23b W2)', () => {
  it('returns an object URL from the device cache WITHOUT synthesizing when cached', async () => {
    cacheGet.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    const { result } = makeHook();
    const url = await result.current.getPlaybackUrl(CLIP);
    expect(url).toBe('blob:preview');
    expect(synthesizeCached).not.toHaveBeenCalled();
  });

  it('falls through to synthesizeCached on a device-cache MISS and returns a URL', async () => {
    cacheGet.mockResolvedValueOnce(null);
    synthesizeCached.mockResolvedValueOnce(new ArrayBuffer(8));
    const { result } = makeHook();
    const url = await result.current.getPlaybackUrl(CLIP);
    // c2 (Refinement A): getPlaybackUrl now threads the row's resolved generation (1 here — the clip
    // is not in the enriched items map, so it defaults to legacy generation 1).
    expect(synthesizeCached).toHaveBeenCalledWith('Bom dia', { voiceType: undefined, generation: 1 });
    expect(url).toBe('blob:preview');
  });

  it('logs + toasts with the correlation id and returns null when synthesis fails (no silent dead button)', async () => {
    cacheGet.mockResolvedValueOnce(null);
    synthesizeCached.mockRejectedValueOnce(new Error('provider down'));
    const { result } = makeHook();
    const url = await result.current.getPlaybackUrl(CLIP);
    expect(url).toBeNull();
    expect(loggerError).toHaveBeenCalledWith('EN23B_PLAYBACK_FETCH_FAILED', expect.any(String), expect.objectContaining({ category: 'DATA_PROCESSING' }));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('ref req-abc1'), 'error');
  });
});
