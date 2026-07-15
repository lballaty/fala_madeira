// File: src/lib/audioKey.ts
// Description: PURE (no platform/config/DOM imports) audio cache-key helpers, extracted from
//   audioCache.ts (EN-8) so the SAME key logic is shared by the browser client, the offline
//   downloader, and the Node pre-gen script. Three pieces:
//     - hashText(text): FNV-1a 32-bit hex digest of the exact synthesized text.
//     - buildKey(provider, voice, text): the canonical cache key `tts:<provider>:<voice>:<hash>`
//       — deliberately NO speed (speed is a playback-time param; one clip serves all speeds).
//     - keyToServerPath(key): map a cache key to a filesystem/URL-safe name for the server audio
//       tier (Verpex /audio/<path>, Supabase bucket object). Deterministic, traversal-safe.
//   Keeping this module dependency-free lets Node tooling import it without a browser bundle.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

/** Namespace prefix so audio-cache blobs are distinguishable from other blob payloads. */
export const KEY_PREFIX = 'tts:';

/**
 * Small, fast, non-cryptographic string hash (FNV-1a, 32-bit) rendered as hex.
 * The cache key only needs to be a stable, collision-resistant-enough digest of the
 * text — not a security hash — so this avoids pulling in crypto.subtle (which is async
 * and unavailable in non-secure contexts). Deterministic across sessions and runtimes.
 */
export const hashText = (text: string): string => {
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
 * fingerprint (resolved voiceType archetype), `text` = the exact text synthesized. NO speed.
 */
export const buildKey = (provider: string, voice: string, text: string): string =>
  `${KEY_PREFIX}${provider || 'default'}:${voice || 'default'}:${hashText(text)}`;

/**
 * Map a cache key to a filesystem/URL-safe object name for the server audio tier
 * (EN-8): the client fetches `<verpexBase>/<keyToServerPath(key)>` and the pre-gen /
 * write-back store it under the same name. Deterministic and 1:1 with the key.
 * Strips the `tts:` prefix, collapses every non-[a-z0-9_] run (including the `:`
 * separators) to `_`, and appends `.pcm`. Contains no `/`, `:` or `..`, so it can never
 * traverse outside the audio directory — a hard guarantee the Verpex/Supabase writers rely on.
 */
export const keyToServerPath = (key: string): string =>
  `${key.replace(new RegExp(`^${KEY_PREFIX}`), '').replace(/[^a-z0-9_]+/gi, '_')}.pcm`;
