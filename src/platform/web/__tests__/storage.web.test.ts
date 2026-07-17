// File: src/platform/web/__tests__/storage.web.test.ts
// Description: Guards EN-27 P1.6 — the web StorageAdapter used to degrade from IndexedDB to
//   localStorage/memory SILENTLY when openDB rejected (private mode / quota / corrupt profile), so
//   persisted state (offline audio, prefs) quietly became volatile and vanished on reload with no
//   trace. This test forces openDB to reject and asserts the adapter (1) logs
//   WEB_STORAGE_INDEXEDDB_UNAVAILABLE and (2) degrades gracefully (returns a value from the
//   localStorage fallback, does not throw).
// Author: EN-27 error-hardening plan (WP-B b-test)
// Created: 2026-07-17

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    critical: vi.fn(),
  },
}));

// idb's openDB rejects — simulate IndexedDB refusing to open.
vi.mock('idb', () => ({
  openDB: vi.fn(() => Promise.reject(new Error('IndexedDB blocked (private mode)'))),
}));

import { createWebStorageAdapter } from '../storage.web';
import { logger } from '../../../lib/logger';

const g = globalThis as unknown as { indexedDB?: unknown };

beforeEach(() => {
  // Truthy indexedDB so the adapter attempts openDB (which our mock rejects) rather than
  // short-circuiting on the "no IndexedDB API" branch.
  g.indexedDB = {};
});

afterEach(() => {
  delete g.indexedDB;
  vi.clearAllMocks();
});

describe('web StorageAdapter — IndexedDB open failure (EN-27 P1.6)', () => {
  it('logs WEB_STORAGE_INDEXEDDB_UNAVAILABLE and degrades without throwing', async () => {
    const adapter = createWebStorageAdapter();

    // get() drives getDB() -> openDB (rejects) -> logged degrade -> localStorage fallback.
    const value = await adapter.get('fm:some-key');

    expect(logger.warn).toHaveBeenCalledWith(
      'WEB_STORAGE_INDEXEDDB_UNAVAILABLE',
      expect.any(String),
      expect.objectContaining({ category: 'DATA_PROCESSING' }),
    );
    // Graceful: a missing key under the fallback resolves to null, not an exception.
    expect(value).toBeNull();
  });
});
