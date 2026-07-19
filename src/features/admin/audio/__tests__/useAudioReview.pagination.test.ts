// File: src/features/admin/audio/__tests__/useAudioReview.pagination.test.ts
// Description: EN-23b W3 unit tests. Proves the review load is PAGINATED: opening a scope enriches
//   only the first page (bounded device-cache reads + server probes, NOT one-per-clip across the whole
//   scope), reports totalCount + hasMore, and loadMore() enriches + appends the next page until the
//   scope is exhausted. Guards the "loads everything at once" defect: audioCache.get is called at most
//   pageSize times on the initial load. config.audio.reviewPageSize is mocked small (2) for the test.
// Author: claude-en23b
// Created: 2026-07-19

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShowToast } from '../../../../hooks/useToast';

vi.mock('../../../../config', () => ({ config: { audio: { reviewPageSize: 2 } } }));
// 5 clips in scope (one situation, five lines).
vi.mock('../../../../content/repository', () => ({
  contentRepository: { listSituations: vi.fn(async () => [{ id: 's1', level: 0 }]), listTracks: vi.fn(async () => []) },
}));
vi.mock('../../../../lib/audio-download', () => ({
  linesForSituation: vi.fn(() => ['a', 'b', 'c', 'd', 'e'].map((t) => ({ text: t, voiceType: undefined }))),
}));
const cacheGet = vi.fn(async (_k: string): Promise<Uint8Array | null> => null);
vi.mock('../../../../lib/audioCache', () => ({
  audioCache: { buildKey: (p: string, v: string, t: string) => `${p}:${v}:${t}`, get: (k: string) => cacheGet(k) },
}));
vi.mock('../../../../services/geminiService', () => ({ synthesizeCached: vi.fn() }));
vi.mock('../../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(() => ({ request_id: 'r' })) },
  userMessage: (_c: string, m: string) => m,
}));
vi.mock('../audioSignals', () => ({ scoreClip: vi.fn(async () => ({})) }));
const checkServerPresence = vi.fn(async () => 'unknown');
vi.mock('../audioServerTier', () => ({
  isServerTierAvailable: vi.fn(() => false),
  checkServerPresence: (...a: unknown[]) => checkServerPresence(...(a as [])),
}));
vi.mock('../ttsAudioReviewRepo', () => ({
  newCorrelationId: () => 'corr-test',
  isRepoError: (r: { ok: boolean }) => r.ok === false,
  getReviews: vi.fn(async () => ({ ok: true, data: {} })),
  listRegenQueue: vi.fn(async () => ({ ok: true, data: [] })),
  upsertVerdict: vi.fn(async () => ({ ok: true, data: {} })),
  enqueueRegen: vi.fn(async () => ({ ok: true, data: null })),
}));

import { useAudioReview } from '../useAudioReview';

// STABLE deps object — the hook's load effect depends on `supabase`/`showToast`, so a fresh object
// per render would re-trigger the effect in an infinite loop (see useAudioReview.test.ts note).
const deps = {
  supabase: {} as SupabaseClient,
  isAdmin: true,
  actorId: 'a1',
  showToast: vi.fn() as unknown as ShowToast,
};
const makeHook = () => renderHook(() => useAudioReview(deps));

afterEach(() => vi.clearAllMocks());

describe('useAudioReview — W3 pagination', () => {
  it('enriches only the first page on load and reports totalCount + hasMore', async () => {
    const { result } = makeHook();
    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.totalCount).toBe(5);
    expect(result.current.hasMore).toBe(true);
    // Bounded: the expensive per-clip probes ran for the page only, NOT all 5 clips.
    expect(cacheGet).toHaveBeenCalledTimes(2);
    expect(checkServerPresence).not.toHaveBeenCalled(); // serverTierAvailable false in this test
  });

  it('loadMore appends the next page until the scope is exhausted', async () => {
    const { result } = makeHook();
    await waitFor(() => expect(result.current.items.length).toBe(2));

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items.length).toBe(4);
    expect(cacheGet).toHaveBeenCalledTimes(4);
    expect(result.current.hasMore).toBe(true);

    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items.length).toBe(5);
    expect(cacheGet).toHaveBeenCalledTimes(5);
    expect(result.current.hasMore).toBe(false);

    // No-op once exhausted.
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.items.length).toBe(5);
    expect(cacheGet).toHaveBeenCalledTimes(5);
  });
});
