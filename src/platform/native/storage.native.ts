// File: src/platform/native/storage.native.ts
// Description: Native (Capacitor) StorageAdapter. KV values live in @capacitor/preferences
//   (UserDefaults on iOS — durable, never evicted under storage pressure) as JSON strings;
//   blobs live in @capacitor/filesystem under Directory.Data/fm-blobs with base64url-encoded
//   keys as filenames (any key charset is filename-safe and losslessly recoverable for
//   blobKeys()). All plugin imports are DYNAMIC so the web bundle never pulls Capacitor
//   plugin code in and the resolver stays safe on web (this module is only constructed
//   when Capacitor.isNativePlatform() is true).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { BlobLimits, BlobStoreUsage, PlatformError, StorageAdapter, StorageUsage } from '../types';
import { logger } from '../../lib/logger';

// Subdirectory inside Directory.Data that owns every blob this adapter writes.
const BLOB_DIR = 'fm-blobs';

// EN-27 P0.4: distinguish a benign "not written yet / cache miss" from a real read error. A missing
// file/dir is the routine path (return null/[] silently); anything else is a read failure that made
// the store unreadable — corrupt offline audio then looks like "nothing saved" (the TB-9 shape), so
// it MUST be logged rather than swallowed into an indistinguishable null/[].
const isNotFound = (e: unknown): boolean =>
  /does not exist|not found|no such file|enoent/i.test(e instanceof Error ? e.message : String(e));

const matchesPrefix = (key: string, prefix?: string): boolean =>
  !prefix || key.startsWith(prefix);

// ---------------------------------------------------------------------------
// base64 helpers (webview has atob/btoa; chunked to avoid call-stack limits
// on large audio buffers)
// ---------------------------------------------------------------------------

const CHUNK = 0x8000;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// Blob keys become filenames via base64url (RFC 4648 §5) so keys containing
// '/', ':', unicode, etc. are always filename-safe and losslessly reversible.
const keyToFileName = (key: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(key)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fileNameToKey = (name: string): string | null => {
  try {
    const base64 = name.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null; // foreign file in our directory — ignore rather than fail
  }
};

const storageFailure = (message: string, e: unknown): PlatformError =>
  new PlatformError(
    'storage',
    'storage-failure',
    message,
    e instanceof Error ? e.message : String(e),
  );

export const createNativeStorageAdapter = (): StorageAdapter => {
  // Dynamic imports keep @capacitor/* out of the web bundle's main chunks.
  // Cached so each plugin module is resolved once per session.
  let prefsPromise: Promise<typeof import('@capacitor/preferences')> | null = null;
  let fsPromise: Promise<typeof import('@capacitor/filesystem')> | null = null;

  const prefs = async () => {
    prefsPromise ??= import('@capacitor/preferences');
    return (await prefsPromise).Preferences;
  };

  const fs = async () => {
    fsPromise ??= import('@capacitor/filesystem');
    const mod = await fsPromise;
    return { Filesystem: mod.Filesystem, Directory: mod.Directory };
  };

  const listBlobFileNames = async (): Promise<string[]> => {
    const { Filesystem, Directory } = await fs();
    try {
      const result = await Filesystem.readdir({ path: BLOB_DIR, directory: Directory.Data });
      return result.files.map((f) => f.name);
    } catch (e) {
      if (!isNotFound(e)) {
        logger.warn('NATIVE_BLOB_LISTDIR_FAILED', 'could not read the blob directory — treating as empty', {
          category: 'DATA_PROCESSING',
          error: e,
        });
      }
      return []; // not-found = directory not created yet; logged case = unreadable store
    }
  };

  // File name + size + mtime for every blob (mtime is the LRU recency signal
  // native provides via readdir FileInfo; the web adapter tracks recency in an
  // index instead). Missing size/mtime default to 0.
  const listBlobStats = async (): Promise<{ name: string; size: number; mtime: number }[]> => {
    const { Filesystem, Directory } = await fs();
    try {
      const result = await Filesystem.readdir({ path: BLOB_DIR, directory: Directory.Data });
      return result.files.map((f) => ({
        name: f.name,
        size: typeof f.size === 'number' ? f.size : 0,
        mtime: typeof f.mtime === 'number' ? f.mtime : 0,
      }));
    } catch (e) {
      if (!isNotFound(e)) {
        logger.warn('NATIVE_BLOB_STAT_FAILED', 'could not stat the blob directory — LRU/usage will read as empty', {
          category: 'DATA_PROCESSING',
          error: e,
        });
      }
      return [];
    }
  };

  const deleteFileByName = async (name: string): Promise<void> => {
    const { Filesystem, Directory } = await fs();
    try {
      await Filesystem.deleteFile({ path: `${BLOB_DIR}/${name}`, directory: Directory.Data });
    } catch {
      // Already gone — nothing to do.
    }
  };

  // Evict least-recently-used (oldest mtime) blobs until both limits are met.
  // `incomingBytes` is the size of the entry about to be written; `excludeName`
  // is that entry's file (already counted separately by the caller).
  const evictToFit = async (limits: BlobLimits, incomingBytes: number, excludeName: string): Promise<number> => {
    const maxEntries = limits.maxEntries;
    const maxBytes = limits.maxBytes;
    if (maxEntries === undefined && maxBytes === undefined) return 0;

    const stats = (await listBlobStats()).filter((s) => s.name !== excludeName);
    let totalBytes = stats.reduce((sum, s) => sum + s.size, 0) + incomingBytes;
    let totalCount = stats.length + 1; // + the incoming entry
    // Oldest first.
    stats.sort((a, b) => a.mtime - b.mtime);

    let evicted = 0;
    for (const s of stats) {
      const overCount = maxEntries !== undefined && totalCount > maxEntries;
      const overBytes = maxBytes !== undefined && totalBytes > maxBytes;
      if (!overCount && !overBytes) break;
      await deleteFileByName(s.name);
      totalBytes -= s.size;
      totalCount -= 1;
      evicted += 1;
    }
    return evicted;
  };

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const p = await prefs();
      const { value } = await p.get({ key });
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch (e) {
        // A parse failure is never routine (the value WAS present) — it is a corrupt entry. Log it
        // (EN-27 P0.4) so corruption is visible instead of masquerading as an absent key.
        logger.warn('NATIVE_STORAGE_PARSE_FAILED', 'stored value could not be parsed — treating as missing', {
          category: 'DATA_PROCESSING',
          error: e,
          details: { key },
        });
        return null;
      }
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      try {
        const p = await prefs();
        await p.set({ key, value: JSON.stringify(value) });
      } catch (e) {
        throw storageFailure('Could not save data on this device.', e);
      }
    },

    async delete(key: string): Promise<void> {
      const p = await prefs();
      await p.remove({ key });
    },

    async keys(prefix?: string): Promise<string[]> {
      const p = await prefs();
      const { keys } = await p.keys();
      return keys.filter((k) => matchesPrefix(k, prefix));
    },

    async clear(prefix?: string): Promise<void> {
      const p = await prefs();
      if (!prefix) {
        // Safe: the Preferences plugin's default UserDefaults group
        // (CapacitorStorage) contains only this adapter's KV entries.
        await p.clear();
        return;
      }
      const { keys } = await p.keys();
      for (const key of keys) {
        if (key.startsWith(prefix)) await p.remove({ key });
      }
    },

    async getBlob(key: string): Promise<ArrayBuffer | null> {
      const { Filesystem, Directory } = await fs();
      try {
        const result = await Filesystem.readFile({
          path: `${BLOB_DIR}/${keyToFileName(key)}`,
          directory: Directory.Data,
        });
        // Native platforms return base64 string data (Blob is web-only).
        return typeof result.data === 'string'
          ? base64ToArrayBuffer(result.data)
          : await result.data.arrayBuffer();
      } catch (e) {
        // A missing file is a routine cache miss (contract: null for absent blobs) — stay silent.
        // Any OTHER read error means a cached clip is present-but-unreadable (corruption/permission)
        // and would otherwise look identical to "not cached" — the TB-9 shape. Log that case.
        if (!isNotFound(e)) {
          logger.warn('NATIVE_BLOB_READ_FAILED', 'cached blob is present but unreadable — treating as a miss', {
            category: 'DATA_PROCESSING',
            error: e,
            details: { key },
          });
        }
        return null;
      }
    },

    async setBlob(key: string, data: ArrayBuffer, limits?: BlobLimits): Promise<number> {
      const fileName = keyToFileName(key);
      try {
        const { Filesystem, Directory } = await fs();
        await Filesystem.writeFile({
          path: `${BLOB_DIR}/${fileName}`,
          data: arrayBufferToBase64(data),
          directory: Directory.Data,
          recursive: true, // creates fm-blobs/ on first write
        });
        // Bounded LRU: evict oldest blobs when this write breaches the limits.
        return limits ? await evictToFit(limits, data.byteLength, fileName) : 0;
      } catch (e) {
        throw storageFailure('Could not save audio/content data on this device.', e);
      }
    },

    async deleteBlob(key: string): Promise<void> {
      const { Filesystem, Directory } = await fs();
      try {
        await Filesystem.deleteFile({
          path: `${BLOB_DIR}/${keyToFileName(key)}`,
          directory: Directory.Data,
        });
      } catch {
        // Deleting a missing blob is a no-op, matching the web adapter.
      }
    },

    async blobKeys(prefix?: string): Promise<string[]> {
      const names = await listBlobFileNames();
      return names
        .map(fileNameToKey)
        .filter((k): k is string => k !== null && matchesPrefix(k, prefix));
    },

    async clearBlobs(prefix?: string): Promise<void> {
      const { Filesystem, Directory } = await fs();
      const names = await listBlobFileNames();
      for (const name of names) {
        const key = fileNameToKey(name);
        if (key === null || !matchesPrefix(key, prefix)) continue;
        try {
          await Filesystem.deleteFile({ path: `${BLOB_DIR}/${name}`, directory: Directory.Data });
        } catch {
          // Already gone — keep clearing the rest.
        }
      }
    },

    async usage(): Promise<StorageUsage> {
      // WKWebView exposes navigator.storage.estimate for webview-managed
      // storage only; filesystem blobs are not covered, so report unknown
      // rather than a misleading number.
      return { usedBytes: null, quotaBytes: null };
    },

    async blobUsage(): Promise<BlobStoreUsage> {
      const stats = await listBlobStats();
      return {
        count: stats.length,
        bytes: stats.reduce((sum, s) => sum + s.size, 0),
      };
    },
  };
};
