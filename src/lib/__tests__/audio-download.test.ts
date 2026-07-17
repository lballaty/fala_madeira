// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/audio-download.test.ts
// Description: Unit tests for downloadForOffline (src/lib/audio-download.ts) — the Settings
//   "download for offline" feature (QA-1a, TESTER-FEEDBACK-TRACKER). Verifies it enumerates a
//   scope's speakable lines, synthesizes each uncached clip through the shared cache, counts
//   synthesized-vs-cached, and returns the right typed status for the empty / offline / cancelled
//   paths. Boundaries (content repository, synthesizeCached, audioCache, logger) are mocked so the
//   test is hermetic. (The survive-an-SW-upgrade half is QA-1b — needs a fake-indexeddb devDep.)
// Author: Offline-download test (with assistant)
// Created: 2026-07-14

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../content/repository', () => ({ contentRepository: { listSituations: vi.fn() } }));
// OfflineStorageFullError and EdgeFunctionError must be the REAL classes (not stubs) so the
// download loop's `instanceof` checks work — EN-8 catches OfflineStorageFullError to stop early with
// 'cache-full'; EN-27 uses EdgeFunctionError for the deterministic-vs-transient retry split.
vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geminiService')>();
  return {
    synthesizeCached: vi.fn(async () => new ArrayBuffer(8)),
    OfflineStorageFullError: actual.OfflineStorageFullError,
    EdgeFunctionError: actual.EdgeFunctionError,
  };
});
// Shrink the retry backoff so the transient-retry test doesn't sleep for seconds.
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { config: { ...actual.config, offline: { ...actual.config.offline, downloadRetryBaseMs: 1, downloadMaxAttempts: 3 } } };
});
vi.mock('../audioCache', () => ({
  audioCache: {
    buildKey: vi.fn((provider: string, voice: string, text: string) => `${provider}:${voice}:${text}`),
    get: vi.fn(async () => null),
    getPinned: vi.fn(async () => null),
    usage: vi.fn(async () => ({ bytes: 0, count: 0 })),
    pinnedUsage: vi.fn(async () => ({ bytes: 0, count: 0 })),
  },
  readCacheLimitBytes: vi.fn(() => 5_000_000_000),
}));
// userMessage is exported alongside logger — the geminiService mock uses importOriginal to expose
// the REAL OfflineStorageFullError/EdgeFunctionError classes, which pulls in real geminiService whose
// top-level import destructures userMessage from here, so the mock must provide it too (merge glue).
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  userMessage: (_code: string, message: string) => message,
}));

import { contentRepository } from '../../content/repository';
import { synthesizeCached, OfflineStorageFullError, EdgeFunctionError } from '../../services/geminiService';
import { audioCache } from '../audioCache';
import { downloadForOffline } from '../audio-download';
import type { Situation } from '../../content/schema';

// Minimal Situation carrying only the fields linesForSituation reads.
const situation = (patterns: string[], vocab: string[] = []): Situation =>
  ({
    phrase_patterns: patterns.map((base) => ({ base, variants: [] })),
    vocabulary: vocab.map((word) => ({ word })),
    dialogues: [],
  } as unknown as Situation);

beforeEach(() => {
  vi.mocked(synthesizeCached).mockClear();
  vi.mocked(audioCache.get).mockReset().mockResolvedValue(null);
  vi.mocked(audioCache.usage).mockReset().mockResolvedValue({ bytes: 0, count: 0 });
  vi.mocked(contentRepository.listSituations).mockReset();
});

afterEach(() => vi.clearAllMocks());

describe('downloadForOffline', () => {
  it('synthesizes every uncached line in scope and reports completed', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([
      situation(['Bom dia', 'Boa tarde'], ['água']),
      situation(['Obrigado']),
    ]);
    const progress: number[] = [];
    const result = await downloadForOffline({ trackId: 't1' }, { onProgress: (p) => progress.push(p.done) });

    expect(result.status).toBe('completed');
    expect(result.total).toBe(4); // 3 patterns + 1 vocab
    expect(result.synthesized).toBe(4);
    expect(result.fromCache).toBe(0);
    expect(result.failed).toBe(0);
    expect(synthesizeCached).toHaveBeenCalledTimes(4);
    expect(progress.at(-1)).toBe(4); // progress reaches total
  });

  it('keys the pre-check by the RESOLVED voice (not a literal "default"), matching playback (EN-7/EN-8)', async () => {
    // A phrase carries no voice_type → resolveVoice → the 'teacher' archetype, the SAME value
    // geminiService.synthesizeCached resolves for a default play. Before normalization the
    // downloader keyed the voice slot as the literal 'default', so downloaded phrases were never
    // reused at play time. Asserting the resolved 'teacher' slot locks the fix.
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Bom dia'])]);
    await downloadForOffline({ trackId: 't1' });
    expect(audioCache.buildKey).toHaveBeenCalledWith('default', 'teacher', 'Bom dia');
  });

  it('synthesizes curated download clips with hostable:true (EN-8 server-hosting scope)', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Bom dia'])]);
    await downloadForOffline({ trackId: 't1' });
    expect(synthesizeCached).toHaveBeenCalledWith('Bom dia', expect.objectContaining({ hostable: true }));
  });

  it('stops with cache-full (no retry) when the saved store is full of downloads (EN-8)', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Bom dia', 'Boa tarde', 'Obrigado'])]);
    // First clip saves; the second cannot fit (store full of protected downloads) → the loop must
    // stop with cache-full and NOT retry the deterministic full error (would waste synthesis calls).
    vi.mocked(synthesizeCached)
      .mockResolvedValueOnce(new ArrayBuffer(8))
      .mockRejectedValueOnce(new OfflineStorageFullError())
      .mockResolvedValue(new ArrayBuffer(8));
    const result = await downloadForOffline({ trackId: 't1' });
    expect(result.status).toBe('cache-full');
    expect(result.synthesized).toBe(1);                 // only the first clip landed
    expect(synthesizeCached).toHaveBeenCalledTimes(2);  // stopped at the full one — no retry, no 3rd clip
  });

  it('counts already-cached clips as fromCache and skips the network', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Olá', 'Adeus'])]);
    vi.mocked(audioCache.get).mockResolvedValue(new ArrayBuffer(8)); // everything already cached
    const result = await downloadForOffline({});

    expect(result.status).toBe('completed');
    expect(result.fromCache).toBe(2);
    expect(result.synthesized).toBe(0);
    expect(synthesizeCached).not.toHaveBeenCalled();
  });

  it('returns empty when nothing is in scope', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([]);
    const result = await downloadForOffline({ level: 0 });
    expect(result.status).toBe('empty');
    expect(result.total).toBe(0);
    expect(synthesizeCached).not.toHaveBeenCalled();
  });

  it('refuses when offline (synthesis needs the network)', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const result = await downloadForOffline({ trackId: 't1' });
    expect(result.status).toBe('offline');
    expect(contentRepository.listSituations).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stops with cancelled status when the signal is already aborted', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Um', 'Dois', 'Três'])]);
    const result = await downloadForOffline({}, { signal: AbortSignal.abort() });
    expect(result.status).toBe('cancelled');
    expect(synthesizeCached).not.toHaveBeenCalled();
  });

  // EN-27 P1.9: deterministic vs transient retry.
  it('does NOT retry a deterministic edge failure — the clip is attempted once and counted failed', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Bom dia'])]);
    vi.mocked(synthesizeCached).mockRejectedValue(new EdgeFunctionError('VOICE_LIMIT_REACHED', 'daily voice limit reached'));

    const result = await downloadForOffline({ trackId: 't1' });

    expect(result.failed).toBe(1);
    // The whole point: a deterministic code is attempted exactly ONCE, not maxAttempts times.
    expect(synthesizeCached).toHaveBeenCalledTimes(1);
  });

  it('DOES retry a transient failure up to maxAttempts before counting it failed', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Boa tarde'])]);
    // A plain (non-EdgeFunctionError) failure is transient/unknown → eligible for retry.
    vi.mocked(synthesizeCached).mockRejectedValue(new Error('network blip'));

    const result = await downloadForOffline({ trackId: 't1' });

    expect(result.failed).toBe(1);
    // downloadMaxAttempts is mocked to 3 → three attempts for the one clip.
    expect(synthesizeCached).toHaveBeenCalledTimes(3);
  });

  it('retries a transient failure and SUCCEEDS on a later attempt', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Olá'])]);
    vi.mocked(synthesizeCached)
      .mockRejectedValueOnce(new Error('blip 1'))
      .mockResolvedValueOnce(new ArrayBuffer(8));

    const result = await downloadForOffline({ trackId: 't1' });

    expect(result.synthesized).toBe(1);
    expect(result.failed).toBe(0);
    expect(synthesizeCached).toHaveBeenCalledTimes(2);
  });
});

// EN-7: resilience (retry/backoff) + the finest download unit (situationId scope).
describe('downloadForOffline resilience + granularity (EN-7)', () => {
  it('retries a transient clip failure with backoff and counts it as synthesized', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Bom dia'])]);
    vi.mocked(synthesizeCached).mockReset()
      .mockRejectedValueOnce(new Error('429 transient'))
      .mockResolvedValue(new ArrayBuffer(8));

    vi.useFakeTimers();
    const p = downloadForOffline({});
    await vi.runAllTimersAsync(); // flush the backoff sleep + microtasks
    const result = await p;
    vi.useRealTimers();

    expect(synthesizeCached).toHaveBeenCalledTimes(2); // failed once → retried → succeeded
    expect(result.synthesized).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.status).toBe('completed');
  });

  it('gives up after downloadMaxAttempts, counts the clip failed, and continues the run', async () => {
    vi.mocked(contentRepository.listSituations).mockResolvedValue([situation(['Falha'])]);
    vi.mocked(synthesizeCached).mockReset().mockRejectedValue(new Error('503 persistent'));

    vi.useFakeTimers();
    const p = downloadForOffline({});
    await vi.runAllTimersAsync();
    const result = await p;
    vi.useRealTimers();

    expect(synthesizeCached).toHaveBeenCalledTimes(3); // config.offline.downloadMaxAttempts
    expect(result.failed).toBe(1);
    expect(result.synthesized).toBe(0);
    expect(result.status).toBe('completed'); // one bad clip does not fail the whole batch
  });

  it('passes situationId through to the repository filter (the finest download unit)', async () => {
    vi.mocked(contentRepository.listSituations).mockReset().mockResolvedValue([situation(['Olá'])]);
    vi.mocked(synthesizeCached).mockReset().mockResolvedValue(new ArrayBuffer(8));
    await downloadForOffline({ situationId: 's-cafe' });
    expect(contentRepository.listSituations).toHaveBeenCalledWith(
      expect.objectContaining({ situationId: 's-cafe' }),
    );
  });
});
