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
});
