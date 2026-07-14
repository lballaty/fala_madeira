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
import { BlobLimits, BlobStoreUsage } from '../platform/types';

/** Namespace prefix so audio-cache blobs are distinguishable from other blob payloads. */
const KEY_PREFIX = 'tts:';

/**
 * Small, fast, non-cryptographic string hash (FNV-1a, 32-bit) rendered as hex.
 * The cache key only needs to be a stable, collision-resistant-enough digest of the
 * text — not a security hash — so this avoids pulling in crypto.subtle (which is async
 * and unavailable in non-secure contexts). Deterministic across sessions.
 */
const hashText = (text: string): string => {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // FNV prime multiply via shifts (keeps the result a 32-bit unsigned int).
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/**
 * Build the cache key for a clip. `provider` = the requested/resolved TTS provider
 * ('default' when the caller lets the server pick), `voice` = the requested voice
 * fingerprint (tutor id or voice_type), `text` = the exact text synthesized. NO speed.
 */
export const buildKey = (provider: string, voice: string, text: string): string =>
  `${KEY_PREFIX}${provider || 'default'}:${voice || 'default'}:${hashText(text)}`;

/** The LRU limits the audio cache enforces (entry count + byte budget). */
const limits = (): BlobLimits => ({
  maxEntries: config.audio.cacheMaxEntries,
  maxBytes: readCacheLimitBytes(),
});

/** Read the user's chosen cache byte budget (Settings → Offline), defaulting to config. */
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

  /** Exact count/bytes currently cached (drives the Settings usage display). */
  async usage(): Promise<BlobStoreUsage> {
    return platform.storage.blobUsage();
  },

  async clear(): Promise<void> {
    await platform.storage.clearBlobs();
  },
};
