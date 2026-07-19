// File: src/lib/__tests__/audioKey.test.ts
// Description: Locks the pure audio cache-key contract (EN-8). buildKey must keep its exact
//   legacy shape (client + offline downloader + Node pre-gen all depend on byte-identical keys),
//   and keyToServerPath must be deterministic, 1:1, and traversal-safe (no ':' '/' or '..') so the
//   Verpex/Supabase writers can never escape the audio directory.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { describe, it, expect } from 'vitest';
import { buildKey, hashText, keyToServerPath, KEY_PREFIX } from '../audioKey';

describe('audioKey.hashText', () => {
  it('is deterministic and an 8-char lowercase hex digest', () => {
    const a = hashText('Bom dia!');
    expect(a).toBe(hashText('Bom dia!'));
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('separates distinct text', () => {
    expect(hashText('Bom dia!')).not.toBe(hashText('Boa noite!'));
  });
});

describe('audioKey.buildKey', () => {
  it('has the exact legacy shape tts:<provider>:<voice>:<hash> (NO speed)', () => {
    const key = buildKey('default', 'local', 'Olá');
    expect(key).toBe(`${KEY_PREFIX}default:local:${hashText('Olá')}`);
    expect(key.startsWith('tts:')).toBe(true);
  });

  it('defaults empty provider/voice to "default"', () => {
    expect(buildKey('', '', 'x')).toBe(`tts:default:default:${hashText('x')}`);
  });

  it('is stable across calls and distinguishes voice + text', () => {
    expect(buildKey('default', 'teacher', 'café')).toBe(buildKey('default', 'teacher', 'café'));
    expect(buildKey('default', 'teacher', 'café')).not.toBe(buildKey('default', 'older', 'café'));
    expect(buildKey('default', 'teacher', 'café')).not.toBe(buildKey('default', 'teacher', 'chá'));
  });
});

describe('audioKey.keyToServerPath', () => {
  it('is filesystem/URL-safe: no colon, slash, or traversal; ends .pcm', () => {
    const path = keyToServerPath(buildKey('default', 'service_worker', 'Faz favor'));
    expect(path).not.toContain(':');
    expect(path).not.toContain('/');
    expect(path).not.toContain('..');
    expect(path).toMatch(/^[a-z0-9_]+\.pcm$/i);
  });

  it('strips the tts: prefix and is deterministic + 1:1 with the key', () => {
    const k1 = buildKey('default', 'local', 'Olá');
    const k2 = buildKey('default', 'older', 'Olá');
    expect(keyToServerPath(k1)).toBe(keyToServerPath(k1));
    expect(keyToServerPath(k1).startsWith('tts_')).toBe(false);
    expect(keyToServerPath(k1)).not.toBe(keyToServerPath(k2));
  });

  // EN-34 versioning: generation folds into the object name so a regenerated clip lands at a
  // different URL and busts every cache layer. Generation 1 (default) MUST equal the legacy name.
  describe('generation versioning (EN-34)', () => {
    const key = buildKey('default', 'teacher', 'Bom dia!');

    it('generation 1 (and the default) is byte-identical to the legacy unversioned name', () => {
      const legacy = keyToServerPath(key);
      expect(keyToServerPath(key, 1)).toBe(legacy);
      expect(legacy).toMatch(/^[a-z0-9_]+\.pcm$/i);
      expect(legacy).not.toContain('.v');
    });

    it('generation ≥ 2 inserts a purely-numeric .v<gen> suffix before .pcm', () => {
      expect(keyToServerPath(key, 2)).toBe(keyToServerPath(key).replace(/\.pcm$/, '.v2.pcm'));
      expect(keyToServerPath(key, 7)).toMatch(/\.v7\.pcm$/);
      // each generation is a distinct object name (the whole point of cache-busting)
      expect(keyToServerPath(key, 2)).not.toBe(keyToServerPath(key, 3));
      expect(keyToServerPath(key, 2)).not.toBe(keyToServerPath(key, 1));
    });

    it('floors non-integer / coerces junk generation and stays traversal-safe', () => {
      // A fractional or non-numeric generation can never inject a slash, colon, or dots.
      expect(keyToServerPath(key, 2.9 as unknown as number)).toBe(keyToServerPath(key, 2));
      expect(keyToServerPath(key, 0)).toBe(keyToServerPath(key)); // < 2 → legacy
      expect(keyToServerPath(key, NaN as unknown as number)).toBe(keyToServerPath(key));
      for (const g of [2, 5, 99]) {
        const p = keyToServerPath(key, g);
        expect(p).not.toContain('/');
        expect(p).not.toContain(':');
        expect(p).not.toContain('..');
        expect(p).toMatch(/^[a-z0-9_]+\.v[0-9]+\.pcm$/i);
      }
    });
  });
});
