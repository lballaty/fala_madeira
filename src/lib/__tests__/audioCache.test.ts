// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/audioCache.test.ts
// Description: Regression for the TB-9 persistence probe. isBlobStorePersistent() reports whether
//   generated audio can be kept across sessions — false when IndexedDB is unavailable (private
//   mode / storage blocked), which is exactly the case where "offline audio doesn't appear to be
//   saved". Settings uses it to surface an honest warning instead of silently losing the cache.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { describe, it, expect, afterEach, vi } from 'vitest';

// Mock the platform storage adapter so audioCache.clear()'s delegation can be asserted in
// isolation. (The real end-to-end "pinned survives clearBlobs" invariant is locked against a
// real IndexedDB upgrade in platform/web/__tests__/storage.web.test.ts.)
vi.mock('../../platform', () => ({
  platform: {
    storage: {
      clearBlobs: vi.fn(async () => undefined),
      clearPinned: vi.fn(async () => undefined),
    },
  },
}));

import { isBlobStorePersistent, audioCache } from '../audioCache';
import { platform } from '../../platform';

type GlobalWithIdb = { indexedDB?: unknown };

describe('isBlobStorePersistent (TB-9)', () => {
  const g = globalThis as GlobalWithIdb;
  const original = g.indexedDB;
  afterEach(() => { g.indexedDB = original; });

  it('is true when IndexedDB is available', () => {
    g.indexedDB = {};
    expect(isBlobStorePersistent()).toBe(true);
  });

  it('is false when IndexedDB is unavailable (private mode / storage blocked)', () => {
    g.indexedDB = undefined;
    expect(isBlobStorePersistent()).toBe(false);
  });
});

describe('audioCache.clear (SEC-1 WP4 — logout clears LRU only)', () => {
  afterEach(() => vi.clearAllMocks());

  it('clears the bounded LRU audio cache and NEVER the pinned (downloads) store', async () => {
    await audioCache.clear();
    expect(platform.storage.clearBlobs).toHaveBeenCalledTimes(1);
    expect(platform.storage.clearPinned).not.toHaveBeenCalled();
  });
});
