// File: src/features/admin/audio/__tests__/useAudioReview.test.ts
// Description: EN-23 unit tests for the useAudioReview orchestration hook. Verifies it enumerates
//   clips in scope (listSituations + linesForSituation + buildKey), merges persisted verdicts +
//   tier presence + queue state into rows, and that the verdict/enqueue actions apply optimistic
//   updates that roll back on a repo error. All boundaries (content repo, enumeration, audioCache,
//   signals, server-tier, review repo, logger) are mocked so the test is hermetic.
//   NOTE: the deps object is built ONCE per test and passed by stable reference — the hook's load
//   effect depends on `supabase`/`showToast`, so a fresh object per render would re-trigger the
//   effect in a loop.
// Author: claude-en23
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShowToast } from '../../../../hooks/useToast';

vi.mock('../../../../content/repository', () => ({
  contentRepository: {
    listSituations: vi.fn(async () => [{ id: 'sit-1', level: 0 }]),
    listTracks: vi.fn(async () => []),
  },
}));
vi.mock('../../../../lib/audio-download', () => ({
  linesForSituation: vi.fn(() => [
    { text: 'Olá', voiceType: undefined },
    { text: 'Bom dia', voiceType: 'shopkeeper_male' },
  ]),
}));
vi.mock('../../../../lib/audioCache', () => ({
  audioCache: {
    buildKey: (provider: string, voice: string, text: string) => `${provider}:${voice}:${text}`,
    get: vi.fn(async () => null), // nothing cached → deviceTier 'missing', scoreClip not called
  },
}));
vi.mock('../../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(() => ({ request_id: 'req-test' })) },
  userMessage: (_c: string, m: string) => m,
}));
vi.mock('../audioSignals', () => ({ scoreClip: vi.fn(async () => ({ suspicious: false })) }));
const checkServerPresence = vi.fn(async () => 'unknown');
vi.mock('../audioServerTier', () => ({
  isServerTierAvailable: vi.fn(() => true), // c2: server tier available so checkServerPresence runs (with generation)
  checkServerPresence: (...args: unknown[]) => checkServerPresence(...(args as [])),
}));

const upsertVerdict = vi.fn(async () => ({ ok: true, data: {} }));
const enqueueRegen = vi.fn(async () => ({ ok: true, data: null }));
// c2: the manifest read — Olá is regenerated (gen 3), Bom dia is absent (⇒ default gen 1).
const fetchHostedGenerations = vi.fn(async () => new Map([['default:default:Olá', { generation: 3, objectName: 'x.v3.pcm' }]]));
vi.mock('../ttsAudioReviewRepo', () => ({
  newCorrelationId: () => 'corr-test',
  isRepoError: (r: { ok: boolean }) => r.ok === false,
  getReviews: vi.fn(async () => ({
    ok: true,
    data: { 'default:default:Olá': { build_key: 'default:default:Olá', verdict: 'good', notes: 'clear', signal_silent: false, signal_scored_at: null } },
  })),
  listRegenQueue: vi.fn(async () => ({ ok: true, data: [{ build_key: 'default:shopkeeper_male:Bom dia' }] })),
  fetchHostedGenerations: (...args: unknown[]) => fetchHostedGenerations(...(args as [])),
  upsertVerdict: (...args: unknown[]) => upsertVerdict(...(args as [])),
  enqueueRegen: (...args: unknown[]) => enqueueRegen(...(args as [])),
}));

import { useAudioReview } from '../useAudioReview';

// Build a STABLE deps object (see file note). showToast can be overridden per test.
const makeDeps = (over: Partial<{ isAdmin: boolean; showToast: ReturnType<typeof vi.fn> }> = {}) => ({
  supabase: {} as SupabaseClient,
  isAdmin: over.isAdmin ?? true,
  actorId: 'admin-1',
  showToast: (over.showToast ?? vi.fn()) as unknown as ShowToast,
});

afterEach(() => vi.clearAllMocks());

describe('useAudioReview — load + merge', () => {
  it('enumerates clips and merges verdict, tier presence and queue state', async () => {
    const d = makeDeps();
    const { result } = renderHook(() => useAudioReview(d));
    await waitFor(() => expect(result.current.items.length).toBe(2));

    const ola = result.current.items.find((i) => i.text === 'Olá')!;
    const bomDia = result.current.items.find((i) => i.text === 'Bom dia')!;

    expect(ola.buildKey).toBe('default:default:Olá');
    expect(bomDia.buildKey).toBe('default:shopkeeper_male:Bom dia');

    expect(ola.verdict).toBe('good');
    expect(ola.notes).toBe('clear');
    expect(bomDia.verdict).toBe('unreviewed');

    expect(ola.deviceTier).toBe('missing');
    expect(ola.serverTier).toBe('unknown');

    expect(bomDia.queued).toBe(true);
    expect(ola.queued).toBe(false);
  });

  // c2 (W5): the hook fetches the page's hosted generations (ONE call per page) and exposes each
  // clip's generation, passing it into checkServerPresence (Refinement A).
  it('exposes the manifest generation per clip and threads it into the presence probe', async () => {
    const d = makeDeps();
    const { result } = renderHook(() => useAudioReview(d));
    await waitFor(() => expect(result.current.items.length).toBe(2));

    // ONE manifest read for the page (not per clip).
    expect(fetchHostedGenerations).toHaveBeenCalledTimes(1);

    const ola = result.current.items.find((i) => i.text === 'Olá')!; // regenerated → gen 3
    const bomDia = result.current.items.find((i) => i.text === 'Bom dia')!; // absent → default gen 1
    expect(ola.generation).toBe(3);
    expect(bomDia.generation).toBe(1);

    // Refinement A: the presence probe received each clip's resolved generation.
    expect(checkServerPresence).toHaveBeenCalledWith('default:default:Olá', 'corr-test', 3);
    expect(checkServerPresence).toHaveBeenCalledWith('default:shopkeeper_male:Bom dia', 'corr-test', 1);
  });

  it('is a no-op when not admin', async () => {
    const d = makeDeps({ isAdmin: false });
    const { result } = renderHook(() => useAudioReview(d));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.items).toEqual([]);
  });
});

describe('useAudioReview — verdict action', () => {
  it('applies an optimistic verdict and persists it', async () => {
    const d = makeDeps();
    const { result } = renderHook(() => useAudioReview(d));
    await waitFor(() => expect(result.current.items.length).toBe(2));
    const clip = result.current.items.find((i) => i.text === 'Bom dia')!;

    await act(async () => {
      await result.current.setVerdict(clip, 'bad', 'muffled');
    });

    expect(upsertVerdict).toHaveBeenCalledTimes(1);
    expect(result.current.items.find((i) => i.text === 'Bom dia')!.verdict).toBe('bad');
  });

  it('rolls back the verdict when the repo write fails', async () => {
    upsertVerdict.mockResolvedValueOnce({ ok: false, code: 'X', message: 'nope' } as never);
    const showToast = vi.fn();
    const d = makeDeps({ showToast });
    const { result } = renderHook(() => useAudioReview(d));
    await waitFor(() => expect(result.current.items.length).toBe(2));
    const clip = result.current.items.find((i) => i.text === 'Olá')!; // starts 'good'

    await act(async () => {
      await result.current.setVerdict(clip, 'bad');
    });

    expect(result.current.items.find((i) => i.text === 'Olá')!.verdict).toBe('good'); // rolled back
    expect(showToast).toHaveBeenCalledWith('nope', 'error');
  });
});

describe('useAudioReview — enqueue action', () => {
  it('optimistically marks queued and calls the repo', async () => {
    const d = makeDeps();
    const { result } = renderHook(() => useAudioReview(d));
    await waitFor(() => expect(result.current.items.length).toBe(2));
    const clip = result.current.items.find((i) => i.text === 'Olá')!;

    await act(async () => {
      await result.current.enqueue(clip, 'silent');
    });

    expect(enqueueRegen).toHaveBeenCalledTimes(1);
    expect(result.current.items.find((i) => i.text === 'Olá')!.queued).toBe(true);
  });

  // c1 (W6): the enqueue threads the reviewer's VERDICT context into `reason` (verdict + note), so the
  // audio-warm edge fn + audit see WHY the clip was flagged, not just the free-text note.
  it('threads the verdict into reason (verdict: note), and bare verdict when no note', async () => {
    const d = makeDeps();
    const { result } = renderHook(() => useAudioReview(d));
    await waitFor(() => expect(result.current.items.length).toBe(2));
    const ola = result.current.items.find((i) => i.text === 'Olá')!; // verdict 'good'

    await act(async () => {
      await result.current.enqueue(ola, 'muffled');
    });
    expect(enqueueRegen).toHaveBeenLastCalledWith(
      d.supabase,
      expect.objectContaining({ build_key: 'default:default:Olá', voice: 'default', text: 'Olá', reason: 'good: muffled' }),
    );

    // No note → bare verdict (still a non-empty reason for the warm fn + audit).
    await act(async () => {
      await result.current.enqueue(ola, null);
    });
    expect(enqueueRegen).toHaveBeenLastCalledWith(d.supabase, expect.objectContaining({ reason: 'good' }));
  });

  it('rolls back queued state when enqueue fails', async () => {
    enqueueRegen.mockResolvedValueOnce({ ok: false, code: 'X', message: 'denied' } as never);
    const d = makeDeps();
    const { result } = renderHook(() => useAudioReview(d));
    await waitFor(() => expect(result.current.items.length).toBe(2));
    const clip = result.current.items.find((i) => i.text === 'Olá')!;

    await act(async () => {
      await result.current.enqueue(clip, 'silent');
    });

    expect(result.current.items.find((i) => i.text === 'Olá')!.queued).toBe(false); // rolled back
  });
});
