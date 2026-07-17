// File: src/platform/web/storage.web.ts
// Description: Web implementation of StorageAdapter. IndexedDB-backed (via `idb`) with
//   two object stores: 'kv' for structured values and 'audio' for binary blobs. The
//   database keeps the legacy name 'FalaMadeiraAudioCache' and blob store name 'audio'
//   (version 2 upgrade) so existing users' cached TTS audio survives the migration to
//   the adapter layer. Falls back to localStorage (small KV) and an in-memory map when
//   IndexedDB is unavailable (e.g. some private-browsing modes).
//
//   Two audio tiers (EN-8, owner 2026-07-17): both are bounded LRUs (CONTENT-ARCHITECTURE §10)
//   with their own {size, accessedAt} index in the KV store. 'audio' is the EPHEMERAL cache
//   (cleared on logout, holds private non-hostable clips); 'audio_pinned' is the DURABLE saved
//   store (survives logout/restart, holds curated public clips the user plays or downloads for
//   offline) — cleared only when the user turns off "Save audio on device". Same LRU machinery
//   serves both: getBlob/getPinnedBlob touch accessedAt; setBlob/setPinnedBlob(limits) evict
//   least-recently-used entries before writing when a cap would be breached; blob/pinnedUsage()
//   report exact count/bytes from the index (rebuilt lazily if missing/stale).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { openDB, IDBPDatabase } from 'idb';
import { BlobLimits, BlobStoreUsage, PlatformError, StorageAdapter, StorageUsage } from '../types';

// Legacy names preserved from src/lib/audioCache.ts (pre-adapter) — do not rename,
// or existing cached audio is orphaned.
const DB_NAME = 'FalaMadeiraAudioCache';
// v1 (legacy audioCache) held 'audio' only; v2 added 'kv'; v3 (EN-8) adds 'audio_pinned' for
// never-evicted offline downloads. Every upgrade is additive/create-if-missing (see upgrade()),
// so bumping the version never drops an existing user's cached audio.
const DB_VERSION = 3;
const BLOB_STORE = 'audio';
const PINNED_STORE = 'audio_pinned';
const KV_STORE = 'kv';
const LOCAL_STORAGE_PREFIX = 'fm-kv:';

// KV keys holding the LRU index for each blob store: { [blobKey]: { size, accessedAt } }.
// Live in the KV store (small JSON) alongside the blob payloads. Both the ephemeral 'audio'
// cache and the durable 'audio_pinned' store are bounded LRUs (EN-8, owner 2026-07-17) and each
// keeps its own index so eviction on one never disturbs the other.
const BLOB_META_KEY = 'blob-lru-index';
const PINNED_META_KEY = 'pinned-lru-index';

interface BlobMetaEntry {
  /** Byte length of the stored blob. */
  size: number;
  /** Epoch ms of the last get/set — the LRU recency signal. */
  accessedAt: number;
}

type BlobMetaIndex = Record<string, BlobMetaEntry>;

const matchesPrefix = (key: string, prefix?: string): boolean =>
  !prefix || key.startsWith(prefix);

export const createWebStorageAdapter = (): StorageAdapter => {
  let dbPromise: Promise<IDBPDatabase> | null = null;
  let idbBroken = false;

  // Last-resort session-scoped fallbacks when IndexedDB is unavailable.
  const memoryKv = new Map<string, unknown>();
  const memoryBlobs = new Map<string, ArrayBuffer>();
  const memoryPinned = new Map<string, ArrayBuffer>();

  const getDB = async (): Promise<IDBPDatabase | null> => {
    if (idbBroken) return null;
    if (!dbPromise) {
      if (!globalThis.indexedDB) {
        idbBroken = true;
        return null;
      }
      dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Additive, non-destructive: each store is created ONLY if missing, so a v1 ('audio'
          // only) or v2 ('audio'+'kv') database upgrades to v3 keeping every existing blob.
          if (!db.objectStoreNames.contains(BLOB_STORE)) {
            db.createObjectStore(BLOB_STORE);
          }
          if (!db.objectStoreNames.contains(KV_STORE)) {
            db.createObjectStore(KV_STORE);
          }
          // v3 (EN-8): pinned offline downloads — never LRU-evicted, no metadata index needed.
          if (!db.objectStoreNames.contains(PINNED_STORE)) {
            db.createObjectStore(PINNED_STORE);
          }
        },
      });
    }
    try {
      return await dbPromise;
    } catch {
      // IndexedDB refused to open (private mode, quota, corrupted profile) —
      // degrade to localStorage/memory for the rest of the session.
      idbBroken = true;
      dbPromise = null;
      return null;
    }
  };

  const hasLocalStorage = (): boolean => {
    try {
      return typeof globalThis.localStorage !== 'undefined';
    } catch {
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Blob LRU index (persisted in the KV store under BLOB_META_KEY)
  // -------------------------------------------------------------------------

  const now = (): number => Date.now();

  const readBlobMeta = async (db: IDBPDatabase, metaKey: string): Promise<BlobMetaIndex> => {
    const raw = await db.get(KV_STORE, metaKey);
    return raw && typeof raw === 'object' ? (raw as BlobMetaIndex) : {};
  };

  const writeBlobMeta = async (db: IDBPDatabase, meta: BlobMetaIndex, metaKey: string): Promise<void> => {
    await db.put(KV_STORE, meta, metaKey);
  };

  // Recompute a store's index from its actual contents — used when the index is
  // missing (first run after upgrade, legacy cached audio) or when a caller
  // needs authoritative usage. Reads every blob's byteLength once.
  const rebuildBlobMeta = async (db: IDBPDatabase, storeName: string, metaKey: string): Promise<BlobMetaIndex> => {
    const meta: BlobMetaIndex = {};
    const keys = (await db.getAllKeys(storeName)).map(String);
    const stamp = now();
    for (const key of keys) {
      const value = (await db.get(storeName, key)) as ArrayBuffer | undefined;
      if (value) meta[key] = { size: value.byteLength, accessedAt: stamp };
    }
    await writeBlobMeta(db, meta, metaKey);
    return meta;
  };

  // Ensure a store's index reflects it: rebuild when the index is empty but blobs
  // exist (legacy/orphaned entries), otherwise trust it.
  const ensureBlobMeta = async (db: IDBPDatabase, storeName: string, metaKey: string): Promise<BlobMetaIndex> => {
    const meta = await readBlobMeta(db, metaKey);
    if (Object.keys(meta).length === 0) {
      const blobKeyCount = (await db.getAllKeys(storeName)).length;
      if (blobKeyCount > 0) return rebuildBlobMeta(db, storeName, metaKey);
    }
    return meta;
  };

  // Evict least-recently-used entries from `storeName` until adding `incomingBytes`
  // under `incomingKey` keeps the store within both limits. Mutates `meta` and the
  // store; returns the number of entries evicted. A single entry larger than
  // maxBytes is still stored (everything else is evicted first).
  const evictToFit = async (
    db: IDBPDatabase,
    storeName: string,
    meta: BlobMetaIndex,
    incomingKey: string,
    incomingBytes: number,
    limits: BlobLimits,
  ): Promise<number> => {
    const { maxEntries, maxBytes } = limits;
    if (maxEntries === undefined && maxBytes === undefined) return 0;

    // Prospective totals with the incoming entry counted once.
    const others = Object.entries(meta).filter(([k]) => k !== incomingKey);
    let totalBytes = others.reduce((sum, [, m]) => sum + m.size, 0) + incomingBytes;
    let totalCount = others.length + 1;

    // Oldest-accessed first.
    others.sort((a, b) => a[1].accessedAt - b[1].accessedAt);

    let evicted = 0;
    for (const [key, entry] of others) {
      const overCount = maxEntries !== undefined && totalCount > maxEntries;
      const overBytes = maxBytes !== undefined && totalBytes > maxBytes;
      if (!overCount && !overBytes) break;
      await db.delete(storeName, key);
      delete meta[key];
      totalBytes -= entry.size;
      totalCount -= 1;
      evicted += 1;
    }
    return evicted;
  };

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const db = await getDB();
      if (db) {
        const value = await db.get(KV_STORE, key);
        return value === undefined ? null : (value as T);
      }
      if (hasLocalStorage()) {
        const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
        if (raw !== null) {
          try {
            return JSON.parse(raw) as T;
          } catch {
            return null; // corrupted entry — treat as missing
          }
        }
        return null;
      }
      return memoryKv.has(key) ? (memoryKv.get(key) as T) : null;
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      const db = await getDB();
      if (db) {
        await db.put(KV_STORE, value, key);
        return;
      }
      if (hasLocalStorage()) {
        try {
          localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(value));
          return;
        } catch (e) {
          throw new PlatformError(
            'storage',
            'storage-failure',
            'Could not save data on this device (storage is full or blocked).',
            e instanceof Error ? e.message : String(e),
          );
        }
      }
      memoryKv.set(key, value);
    },

    async delete(key: string): Promise<void> {
      const db = await getDB();
      if (db) {
        await db.delete(KV_STORE, key);
        return;
      }
      if (hasLocalStorage()) {
        localStorage.removeItem(LOCAL_STORAGE_PREFIX + key);
      }
      memoryKv.delete(key);
    },

    async keys(prefix?: string): Promise<string[]> {
      const db = await getDB();
      if (db) {
        const all = (await db.getAllKeys(KV_STORE)).map(String);
        return all.filter((k) => matchesPrefix(k, prefix));
      }
      if (hasLocalStorage()) {
        const result: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const raw = localStorage.key(i);
          if (raw && raw.startsWith(LOCAL_STORAGE_PREFIX)) {
            const key = raw.slice(LOCAL_STORAGE_PREFIX.length);
            if (matchesPrefix(key, prefix)) result.push(key);
          }
        }
        return result;
      }
      return [...memoryKv.keys()].filter((k) => matchesPrefix(k, prefix));
    },

    async clear(prefix?: string): Promise<void> {
      const db = await getDB();
      if (db) {
        if (!prefix) {
          await db.clear(KV_STORE);
        } else {
          const keys = (await db.getAllKeys(KV_STORE)).map(String).filter((k) => k.startsWith(prefix));
          const tx = db.transaction(KV_STORE, 'readwrite');
          await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
        }
        return;
      }
      if (hasLocalStorage()) {
        const doomed: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const raw = localStorage.key(i);
          if (raw && raw.startsWith(LOCAL_STORAGE_PREFIX)) {
            const key = raw.slice(LOCAL_STORAGE_PREFIX.length);
            if (matchesPrefix(key, prefix)) doomed.push(raw);
          }
        }
        doomed.forEach((k) => localStorage.removeItem(k));
      }
      for (const key of [...memoryKv.keys()]) {
        if (matchesPrefix(key, prefix)) memoryKv.delete(key);
      }
    },

    async getBlob(key: string): Promise<ArrayBuffer | null> {
      const db = await getDB();
      if (db) {
        const value = await db.get(BLOB_STORE, key);
        if (value === undefined) return null;
        // Touch recency (most-recently-used) so LRU eviction spares hot clips.
        const meta = await ensureBlobMeta(db, BLOB_STORE, BLOB_META_KEY);
        const prev = meta[key];
        meta[key] = { size: (value as ArrayBuffer).byteLength, accessedAt: now() };
        // Only pay the index write when something actually changed.
        if (!prev || prev.accessedAt !== meta[key].accessedAt || prev.size !== meta[key].size) {
          await writeBlobMeta(db, meta, BLOB_META_KEY);
        }
        return value as ArrayBuffer;
      }
      return memoryBlobs.get(key) ?? null;
    },

    async setBlob(key: string, data: ArrayBuffer, limits?: BlobLimits): Promise<number> {
      const db = await getDB();
      if (db) {
        const meta = await ensureBlobMeta(db, BLOB_STORE, BLOB_META_KEY);
        // Evict BEFORE writing so the store never transiently overshoots the cap.
        const evicted = limits ? await evictToFit(db, BLOB_STORE, meta, key, data.byteLength, limits) : 0;
        await db.put(BLOB_STORE, data, key);
        meta[key] = { size: data.byteLength, accessedAt: now() };
        await writeBlobMeta(db, meta, BLOB_META_KEY);
        return evicted;
      }
      memoryBlobs.set(key, data);
      return 0;
    },

    async deleteBlob(key: string): Promise<void> {
      const db = await getDB();
      if (db) {
        await db.delete(BLOB_STORE, key);
        const meta = await readBlobMeta(db, BLOB_META_KEY);
        if (key in meta) {
          delete meta[key];
          await writeBlobMeta(db, meta, BLOB_META_KEY);
        }
        return;
      }
      memoryBlobs.delete(key);
    },

    async blobKeys(prefix?: string): Promise<string[]> {
      const db = await getDB();
      if (db) {
        const all = (await db.getAllKeys(BLOB_STORE)).map(String);
        return all.filter((k) => matchesPrefix(k, prefix));
      }
      return [...memoryBlobs.keys()].filter((k) => matchesPrefix(k, prefix));
    },

    async clearBlobs(prefix?: string): Promise<void> {
      const db = await getDB();
      if (db) {
        if (!prefix) {
          await db.clear(BLOB_STORE);
          await writeBlobMeta(db, {}, BLOB_META_KEY); // index tracks the (now empty) store
        } else {
          const keys = (await db.getAllKeys(BLOB_STORE)).map(String).filter((k) => k.startsWith(prefix));
          const tx = db.transaction(BLOB_STORE, 'readwrite');
          await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
          const meta = await readBlobMeta(db, BLOB_META_KEY);
          let changed = false;
          for (const k of keys) {
            if (k in meta) {
              delete meta[k];
              changed = true;
            }
          }
          if (changed) await writeBlobMeta(db, meta, BLOB_META_KEY);
        }
        return;
      }
      for (const key of [...memoryBlobs.keys()]) {
        if (matchesPrefix(key, prefix)) memoryBlobs.delete(key);
      }
    },

    async getPinnedBlob(key: string): Promise<ArrayBuffer | null> {
      const db = await getDB();
      if (db) {
        const value = await db.get(PINNED_STORE, key);
        if (value === undefined) return null;
        // Touch recency so LRU eviction spares recently-played saved clips.
        const meta = await ensureBlobMeta(db, PINNED_STORE, PINNED_META_KEY);
        const prev = meta[key];
        meta[key] = { size: (value as ArrayBuffer).byteLength, accessedAt: now() };
        if (!prev || prev.accessedAt !== meta[key].accessedAt || prev.size !== meta[key].size) {
          await writeBlobMeta(db, meta, PINNED_META_KEY);
        }
        return value as ArrayBuffer;
      }
      return memoryPinned.get(key) ?? null;
    },

    async setPinnedBlob(key: string, data: ArrayBuffer, limits?: BlobLimits): Promise<number> {
      const db = await getDB();
      if (db) {
        // Bounded, durable LRU (EN-8): with `limits` a write evicts least-recently-used saved
        // clips before writing when a cap would be breached; without `limits` (e.g. an explicit
        // download bounded by its own run) it writes without eviction. Either way the store
        // survives logout — it is cleared only by clearPinned (turning off "Save audio on device").
        const meta = await ensureBlobMeta(db, PINNED_STORE, PINNED_META_KEY);
        const evicted = limits ? await evictToFit(db, PINNED_STORE, meta, key, data.byteLength, limits) : 0;
        await db.put(PINNED_STORE, data, key);
        meta[key] = { size: data.byteLength, accessedAt: now() };
        await writeBlobMeta(db, meta, PINNED_META_KEY);
        return evicted;
      }
      memoryPinned.set(key, data);
      return 0;
    },

    async pinnedUsage(): Promise<BlobStoreUsage> {
      const db = await getDB();
      if (db) {
        const meta = await ensureBlobMeta(db, PINNED_STORE, PINNED_META_KEY);
        const entries = Object.values(meta);
        return { count: entries.length, bytes: entries.reduce((sum, m) => sum + m.size, 0) };
      }
      let bytes = 0;
      for (const buf of memoryPinned.values()) bytes += buf.byteLength;
      return { count: memoryPinned.size, bytes };
    },

    async clearPinned(prefix?: string): Promise<void> {
      const db = await getDB();
      if (db) {
        if (!prefix) {
          await db.clear(PINNED_STORE);
          await writeBlobMeta(db, {}, PINNED_META_KEY);
        } else {
          const keys = (await db.getAllKeys(PINNED_STORE)).map(String).filter((k) => k.startsWith(prefix));
          const tx = db.transaction(PINNED_STORE, 'readwrite');
          await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
          const meta = await readBlobMeta(db, PINNED_META_KEY);
          let changed = false;
          for (const k of keys) {
            if (k in meta) { delete meta[k]; changed = true; }
          }
          if (changed) await writeBlobMeta(db, meta, PINNED_META_KEY);
        }
        return;
      }
      for (const key of [...memoryPinned.keys()]) {
        if (matchesPrefix(key, prefix)) memoryPinned.delete(key);
      }
    },

    async usage(): Promise<StorageUsage> {
      const estimator = globalThis.navigator?.storage?.estimate;
      if (typeof estimator === 'function') {
        try {
          const estimate = await navigator.storage.estimate();
          return {
            usedBytes: estimate.usage ?? null,
            quotaBytes: estimate.quota ?? null,
          };
        } catch {
          // Estimation unsupported/blocked — report unknown rather than failing.
        }
      }
      return { usedBytes: null, quotaBytes: null };
    },

    async blobUsage(): Promise<BlobStoreUsage> {
      const db = await getDB();
      if (db) {
        const meta = await ensureBlobMeta(db, BLOB_STORE, BLOB_META_KEY);
        const entries = Object.values(meta);
        return {
          count: entries.length,
          bytes: entries.reduce((sum, m) => sum + m.size, 0),
        };
      }
      // Memory fallback: sum the in-session blobs.
      let bytes = 0;
      for (const buf of memoryBlobs.values()) bytes += buf.byteLength;
      return { count: memoryBlobs.size, bytes };
    },
  };
};
