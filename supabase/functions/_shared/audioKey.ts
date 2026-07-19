// File: supabase/functions/_shared/audioKey.ts
// Description: DENO MIRROR of the browser cache-key helpers in src/lib/audioKey.ts (EN-8). The edge
//   function cannot import the Vite/browser module, so the identical pure logic is duplicated here
//   so the server writes each hosted clip under the SAME object path the client later GETs
//   (device→verpex→supabase lookup). MUST stay byte-for-byte in lockstep with src/lib/audioKey.ts:
//   hashText (FNV-1a 32-bit hex), buildKey (`tts:<provider>:<voice>:<hash>`, NO speed), and
//   keyToServerPath (traversal-safe `<...>.pcm`). If one changes, change both.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

export const KEY_PREFIX = "tts:";

/** FNV-1a 32-bit hex digest — identical to src/lib/audioKey.ts hashText. */
export const hashText = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

/** Canonical cache key `tts:<provider>:<voice>:<hash>` — NO speed. */
export const buildKey = (provider: string, voice: string, text: string): string =>
  `${KEY_PREFIX}${provider || "default"}:${voice || "default"}:${hashText(text)}`;

/**
 * Map a cache key to a filesystem/URL-safe object name for the server audio tier. Strips the
 * `tts:` prefix, collapses every non-[a-z0-9_] run to `_`, appends `.pcm`. Contains no `/`, `:`,
 * or `..` so it can never traverse outside the audio bucket/directory.
 *
 * EN-34 versioning (MUST stay in lockstep with src/lib/audioKey.ts): generation 1 (default) →
 * legacy `<base>.pcm`; generation ≥ 2 → `<base>.v<generation>.pcm`. `generation` is floored to an
 * integer so the `.v<n>` suffix is purely numeric and traversal-safety holds for every generation.
 */
export const keyToServerPath = (key: string, generation = 1): string => {
  const base = key.replace(new RegExp(`^${KEY_PREFIX}`), "").replace(/[^a-z0-9_]+/gi, "_");
  const gen = Math.floor(Number(generation) || 1);
  return gen >= 2 ? `${base}.v${gen}.pcm` : `${base}.pcm`;
};
