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

// Subdirectory inside Directory.Data that owns every blob this adapter writes.
const BLOB_DIR = 'fm-blobs';
// EN-8: pinned offline downloads live in a SEPARATE directory that eviction never scans, so a
// clip a user downloaded survives cache pressure (fixes EN-7). Never touched by clearBlobs().
const PINNED_DIR = 'fm-pinned';

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
    } catch {
      return []; // directory does not exist yet — no blobs written
    }
  };

  // File name + size + mtime for every blob in `dir` (mtime is the LRU recency signal
  // native provides via readdir FileInfo; the web adapter tracks recency in an
  // index instead). Missing size/mtime default to 0. Serves both the ephemeral
  // BLOB_DIR cache and the durable PINNED_DIR store (both bounded LRUs, EN-8).
  const listBlobStats = async (dir: string): Promise<{ name: string; size: number; mtime: number }[]> => {
    const { Filesystem, Directory } = await fs();
    try {
      const result = await Filesystem.readdir({ path: dir, directory: Directory.Data });
      return result.files.map((f) => ({
        name: f.name,
        size: typeof f.size === 'number' ? f.size : 0,
        mtime: typeof f.mtime === 'number' ? f.mtime : 0,
      }));
    } catch {
      return [];
    }
  };

  const deleteFileByName = async (name: string, dir: string): Promise<void> => {
    const { Filesystem, Directory } = await fs();
    try {
      await Filesystem.deleteFile({ path: `${dir}/${name}`, directory: Directory.Data });
    } catch {
      // Already gone — nothing to do.
    }
  };

  // Evict least-recently-used (oldest mtime) blobs from `dir` until both limits are met.
  // `incomingBytes` is the size of the entry about to be written; `excludeName`
  // is that entry's file (already counted separately by the caller).
  const evictToFit = async (dir: string, limits: BlobLimits, incomingBytes: number, excludeName: string): Promise<number> => {
    const maxEntries = limits.maxEntries;
    const maxBytes = limits.maxBytes;
    if (maxEntries === undefined && maxBytes === undefined) return 0;

    const stats = (await listBlobStats(dir)).filter((s) => s.name !== excludeName);
    let totalBytes = stats.reduce((sum, s) => sum + s.size, 0) + incomingBytes;
    let totalCount = stats.length + 1; // + the incoming entry
    // Oldest first.
    stats.sort((a, b) => a.mtime - b.mtime);

    let evicted = 0;
    for (const s of stats) {
      const overCount = maxEntries !== undefined && totalCount > maxEntries;
      const overBytes = maxBytes !== undefined && totalBytes > maxBytes;
      if (!overCount && !overBytes) break;
      await deleteFileByName(s.name, dir);
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
      } catch {
        return null; // corrupted entry — treat as missing
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
      } catch {
        return null; // missing file — contract says null for absent blobs
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
        return limits ? await evictToFit(BLOB_DIR, limits, data.byteLength, fileName) : 0;
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

    async getPinnedBlob(key: string): Promise<ArrayBuffer | null> {
      const { Filesystem, Directory } = await fs();
      try {
        const result = await Filesystem.readFile({
          path: `${PINNED_DIR}/${keyToFileName(key)}`,
          directory: Directory.Data,
        });
        return typeof result.data === 'string'
          ? base64ToArrayBuffer(result.data)
          : await result.data.arrayBuffer();
      } catch {
        return null; // missing file — contract says null for absent blobs
      }
    },

    async setPinnedBlob(key: string, data: ArrayBuffer, limits?: BlobLimits): Promise<number> {
      const fileName = keyToFileName(key);
      try {
        const { Filesystem, Directory } = await fs();
        await Filesystem.writeFile({
          path: `${PINNED_DIR}/${fileName}`,
          data: arrayBufferToBase64(data),
          directory: Directory.Data,
          recursive: true, // creates fm-pinned/ on first write
        });
        // Bounded, durable LRU (EN-8): evict oldest saved clips when a limit is breached; without
        // `limits` (e.g. an explicit download bounded by its own run) the store grows unbounded.
        return limits ? await evictToFit(PINNED_DIR, limits, data.byteLength, fileName) : 0;
      } catch (e) {
        throw storageFailure('Could not save audio on this device.', e);
      }
    },

    async pinnedUsage(): Promise<BlobStoreUsage> {
      const { Filesystem, Directory } = await fs();
      try {
        const result = await Filesystem.readdir({ path: PINNED_DIR, directory: Directory.Data });
        return {
          count: result.files.length,
          bytes: result.files.reduce((sum, f) => sum + (typeof f.size === 'number' ? f.size : 0), 0),
        };
      } catch {
        return { count: 0, bytes: 0 }; // directory absent — nothing pinned yet
      }
    },

    async clearPinned(prefix?: string): Promise<void> {
      const { Filesystem, Directory } = await fs();
      let names: string[];
      try {
        const result = await Filesystem.readdir({ path: PINNED_DIR, directory: Directory.Data });
        names = result.files.map((f) => f.name);
      } catch {
        return; // directory absent — nothing to clear
      }
      for (const name of names) {
        const key = fileNameToKey(name);
        if (key === null || !matchesPrefix(key, prefix)) continue;
        try {
          await Filesystem.deleteFile({ path: `${PINNED_DIR}/${name}`, directory: Directory.Data });
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
      const stats = await listBlobStats(BLOB_DIR);
      return {
        count: stats.length,
        bytes: stats.reduce((sum, s) => sum + s.size, 0),
      };
    },
  };
};
