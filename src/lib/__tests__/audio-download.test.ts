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
vi.mock('../../services/geminiService', () => ({ synthesizeCached: vi.fn(async () => new ArrayBuffer(8)) }));
vi.mock('../audioCache', () => ({
  audioCache: {
    buildKey: vi.fn((provider: string, voice: string, text: string) => `${provider}:${voice}:${text}`),
    get: vi.fn(async () => null),
    usage: vi.fn(async () => ({ bytes: 0, count: 0 })),
  },
  readCacheLimitBytes: vi.fn(() => 5_000_000_000),
}));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { contentRepository } from '../../content/repository';
import { synthesizeCached } from '../../services/geminiService';
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
});
