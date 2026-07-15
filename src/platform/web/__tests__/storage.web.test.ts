// File: src/platform/web/__tests__/storage.web.test.ts
// Description: Migration + isolation tests for the web StorageAdapter's EN-8 pinned blob store.
//   (1) Locks the NON-DESTRUCTIVE IndexedDB v2->v3 upgrade: a pre-EN-8 database ('audio'+'kv'
//   with a cached clip) must keep every cached blob after the adapter opens at v3 and adds the
//   'audio_pinned' store (data-loss guard — QA-1b). (2) Locks that clearBlobs() (the logout LRU
//   clear) NEVER touches the pinned store, so offline downloads survive a logout. Uses
//   fake-indexeddb to run a real IndexedDB upgrade in jsdom.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
// 'auto' registers the full IndexedDB global surface (indexedDB, IDBRequest, IDBKeyRange, …) that
// the `idb` wrapper touches; IDBFactory is imported separately to reset the store per test.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createWebStorageAdapter } from '../storage.web';

const DB_NAME = 'FalaMadeiraAudioCache';

beforeEach(() => {
  // Fresh in-memory IndexedDB per test — the adapter hardcodes the DB name, so state must not
  // leak across tests. Assigning a new IDBFactory resets the whole database.
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
});

describe('web storage adapter — pinned store (EN-8)', () => {
  it('non-destructively upgrades a v2 database: cached audio survives + audio_pinned is added', async () => {
    // 1) Simulate a pre-EN-8 (v2) database: 'audio' + 'kv' stores, holding a cached clip.
    const v2 = await openDB(DB_NAME, 2, {
      upgrade(db) {
        db.createObjectStore('audio');
        db.createObjectStore('kv');
      },
    });
    const cachedKey = 'tts:default:teacher:abcd1234';
    await v2.put('audio', new Uint8Array([1, 2, 3, 4]).buffer, cachedKey);
    v2.close();

    // 2) Open through the adapter (DB_VERSION = 3) → triggers the additive v2->v3 upgrade.
    const adapter = createWebStorageAdapter();

    // 3) The legacy cached blob MUST survive the upgrade (no data loss).
    const survived = await adapter.getBlob(cachedKey);
    expect(survived).not.toBeNull();
    expect(new Uint8Array(survived as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));

    // 4) The new pinned store exists and round-trips.
    await adapter.setPinnedBlob('tts:default:teacher:pinned', new Uint8Array([9, 9]).buffer);
    const readBack = await adapter.getPinnedBlob('tts:default:teacher:pinned');
    expect(readBack).not.toBeNull();
    expect(new Uint8Array(readBack as ArrayBuffer)).toEqual(new Uint8Array([9, 9]));

    // 5) The database is now at version 3 with all three stores present.
    const db = await openDB(DB_NAME);
    expect(db.version).toBe(3);
    expect([...db.objectStoreNames].sort()).toEqual(['audio', 'audio_pinned', 'kv']);
    db.close();
  });

  it('clearBlobs() clears the LRU cache but NEVER the pinned store (logout keeps downloads)', async () => {
    const adapter = createWebStorageAdapter();
    await adapter.setBlob('tts:lru', new Uint8Array([1]).buffer, { maxEntries: 100, maxBytes: 1_000_000 });
    await adapter.setPinnedBlob('tts:pinned', new Uint8Array([2]).buffer);

    // The logout path calls clearBlobs() (LRU only) — see App.tsx onLogoutCleanup / audioCache.clear.
    await adapter.clearBlobs();

    expect(await adapter.getBlob('tts:lru')).toBeNull();
    const pinnedSurvived = await adapter.getPinnedBlob('tts:pinned');
    expect(pinnedSurvived).not.toBeNull();
    expect(new Uint8Array(pinnedSurvived as ArrayBuffer)).toEqual(new Uint8Array([2]));
  });

  it('pinnedUsage() reports exact count + bytes of the pinned store', async () => {
    const adapter = createWebStorageAdapter();
    await adapter.setPinnedBlob('a', new Uint8Array([1, 2, 3]).buffer);
    await adapter.setPinnedBlob('b', new Uint8Array([4, 5]).buffer);
    expect(await adapter.pinnedUsage()).toEqual({ count: 2, bytes: 5 });
  });
});
