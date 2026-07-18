// File: src/lib/audioCache.ts
// Description: Client-side cache for generated TTS audio (raw PCM). Persistence goes through
//   the platform StorageAdapter blob store (ENGINEERING-STANDARDS §1.2) — on web that is the
//   same IndexedDB database and object store the pre-adapter implementation used
//   ('FalaMadeiraAudioCache' / 'audio'), so existing users keep their cached audio.
//
//   The store is a BOUNDED LRU cache (CONTENT-ARCHITECTURE §10): set() passes the configured
//   entry/byte limits to the adapter, which evicts least-recently-used clips before writing
//   when a write would breach either limit; get() marks the clip most-recently-used.
//
//   Cache key = `provider:voice:hash(text)` — deliberately NO speed. Speed is a playback-time
//   parameter (applied by the audio adapter's playbackRate), so the SAME synthesized PCM is
//   reused at any speed; keying on speed would triple-cache identical audio. `provider` and
//   `voice` are the request-scoped voice fingerprint (the server returns the resolved
//   provider+voice in its TTS metadata; callers key on the requested fingerprint so reads and
//   writes for the same logical request agree). buildKey() is the single place the key shape
//   is defined — geminiService and the offline-download pre-generation both use it.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { platform } from '../platform';
import { config } from '../config';
import { BlobLimits, BlobStoreUsage, PinnedWriteResult } from '../platform/types';
import { buildKey } from './audioKey';

// buildKey/hashText/keyToServerPath moved to the pure ./audioKey module (EN-8) so the identical
// key logic is shared by the browser client, the offline downloader, and the Node pre-gen script.
// Re-exported here to preserve the existing import surface (geminiService, audio-download, …).
export { buildKey };
export { keyToServerPath } from './audioKey';

/** The LRU limits the audio cache enforces (entry count + byte budget). */
const limits = (): BlobLimits => ({
  maxEntries: config.audio.cacheMaxEntries,
  maxBytes: readCacheLimitBytes(),
});

/** Read the user's chosen storage byte budget (Settings → Offline), defaulting to config. This
 * bounds BOTH audio tiers — the ephemeral cache and the durable saved store (EN-8). */
export const readCacheLimitBytes = (): number => {
  try {
    const saved = localStorage.getItem(config.offline.cacheLimitBytesKey);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // localStorage blocked (private mode) — fall back to the config default.
  }
  return config.audio.cacheMaxBytes;
};

/**
 * EN-8 (owner 2026-07-17): is "Save audio on device" ON? Governs whether curated clips the user
 * plays are persisted to the DURABLE saved store (survives logout/restart → offline). Defaults to
 * true (matching useSettings' default) when unset or when localStorage is blocked — a curated clip
 * is safe to save (public content, no PII). Read at write time so the current toggle always wins.
 */
export const saveAudioOnDeviceEnabled = (): boolean => {
  try {
    const saved = localStorage.getItem(config.offline.saveAudioKey);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
};

/**
 * TB-9: whether generated audio can be PERSISTED across sessions on this platform. The web blob
 * store is IndexedDB-backed and silently degrades to an in-memory map when IndexedDB is
 * unavailable (private-browsing / storage blocked) — audio still plays but is lost on reload, so
 * it "isn't saved". This is the common, detectable case (IndexedDB absent). Note: it cannot detect
 * IndexedDB present-but-open()-refused; that rarer case still needs a per-browser repro. Native
 * (Capacitor) persists, so this is only meaningful on web.
 */
export const isBlobStorePersistent = (): boolean =>
  typeof globalThis !== 'undefined' && !!(globalThis as { indexedDB?: unknown }).indexedDB;

export const audioCache = {
  buildKey,

  async get(key: string): Promise<ArrayBuffer | null> {
    return platform.storage.getBlob(key);
  },

  /**
   * Store a clip under the bounded LRU. Returns the number of entries evicted to
   * make room (0 when none) so callers can log churn.
   */
  async set(key: string, data: ArrayBuffer): Promise<number> {
    return platform.storage.setBlob(key, data, limits());
  },

  /**
   * Read a clip from the DURABLE saved store — curated audio the user has played (with "Save audio
   * on device" ON) or downloaded for offline. Survives logout/restart. synthesizeCached checks this
   * AFTER the ephemeral cache, BEFORE the server tiers.
   */
  async getPinned(key: string): Promise<ArrayBuffer | null> {
    return platform.storage.getPinnedBlob(key);
  },

  /**
   * Persist a clip to the DURABLE saved store (EN-8). Bounded by the user storage budget, but with
   * PROTECTION (owner 2026-07-17): `protect:true` = an explicit offline DOWNLOAD that eviction never
   * reclaims; `protect:false` (default) = an opportunistic auto-saved play, reclaimable oldest-first.
   * Returns `{evicted, stored}` — `stored:false` means it could not fit without evicting a download,
   * so the caller reacts (a play falls back to the cache; a download surfaces "out of offline space").
   * Survives logout; removed only by clearPinned (turning off "Save audio on device") or uninstall.
   */
  async setPinned(key: string, data: ArrayBuffer, opts: { protect?: boolean } = {}): Promise<PinnedWriteResult> {
    return platform.storage.setPinnedBlob(key, data, { limits: limits(), protect: opts.protect });
  },

  /**
   * Delete the durable saved store (all, or a prefix). This is the "explicitly delete saved audio"
   * path — wired to turning OFF "Save audio on device". Deliberately distinct from clear() (cache):
   * clearing the cache never deletes saved audio, and deleting saved audio never clears the cache.
   */
  async clearPinned(prefix?: string): Promise<void> {
    await platform.storage.clearPinned(prefix);
  },

  /** Exact count/bytes currently cached in the bounded LRU (drives the Settings usage display). */
  async usage(): Promise<BlobStoreUsage> {
    return platform.storage.blobUsage();
  },

  /** Exact count/bytes of the PINNED (downloaded) store — bounds the offline-download run. */
  async pinnedUsage(): Promise<BlobStoreUsage> {
    return platform.storage.pinnedUsage();
  },

  /**
   * Clear the bounded LRU audio cache ONLY. The pinned store (offline downloads) is deliberately
   * NOT touched — this is what the logout path calls (SEC-1 WP4): drop any user-private incidental
   * audio while preserving curated offline downloads for the next user.
   */
  async clear(): Promise<void> {
    await platform.storage.clearBlobs();
  },
};
