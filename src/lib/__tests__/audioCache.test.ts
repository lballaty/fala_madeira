// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/audioCache.test.ts
// Description: Regression for the TB-9 persistence probe. isBlobStorePersistent() reports whether
//   generated audio can be kept across sessions — false when IndexedDB is unavailable (private
//   mode / storage blocked), which is exactly the case where "offline audio doesn't appear to be
//   saved". Settings uses it to surface an honest warning instead of silently losing the cache.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { describe, it, expect, afterEach } from 'vitest';
import { isBlobStorePersistent } from '../audioCache';

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
