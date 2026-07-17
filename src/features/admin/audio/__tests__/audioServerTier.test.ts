// File: src/features/admin/audio/__tests__/audioServerTier.test.ts
// Description: EN-23 unit tests for the EN-8 server-tier seam. Verifies resolveServerBase returns
//   null (honest "pending EN-8", no hardcoded fallback) when config.audio.serverBase is absent and
//   strips a trailing slash when present; and that checkServerPresence returns 'unknown' with no
//   base / on fetch error, 'present' on a 2xx HEAD, and 'missing' on 404.
// Author: claude-en23
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mutable config the module reads; each test sets audio.serverBase as needed.
const audioConfig: { serverBase?: string } = {};
vi.mock('../../../../config', () => ({ config: { get audio() { return audioConfig; } } }));
vi.mock('../../../../lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { checkServerPresence, isServerTierAvailable, resolveServerBase } from '../audioServerTier';

afterEach(() => {
  delete audioConfig.serverBase;
  vi.restoreAllMocks();
});

describe('resolveServerBase / isServerTierAvailable', () => {
  it('returns null and unavailable when no serverBase is configured (pending EN-8)', () => {
    expect(resolveServerBase()).toBeNull();
    expect(isServerTierAvailable()).toBe(false);
  });

  it('returns a normalized base (trailing slash stripped) when configured', () => {
    audioConfig.serverBase = 'https://cdn.example.com/audio/';
    expect(resolveServerBase()).toBe('https://cdn.example.com/audio');
    expect(isServerTierAvailable()).toBe(true);
  });

  it('treats a blank serverBase as unavailable (no hardcoded fallback)', () => {
    audioConfig.serverBase = '   ';
    expect(resolveServerBase()).toBeNull();
  });
});

describe('checkServerPresence', () => {
  it('returns "unknown" without fetching when the tier is unavailable', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await checkServerPresence('k1', 'corr-1');
    expect(result).toBe('unknown');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns "present" on a 2xx HEAD', async () => {
    audioConfig.serverBase = 'https://cdn.example.com/audio';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    expect(await checkServerPresence('k1', 'corr-1')).toBe('present');
  });

  it('returns "missing" on a 404', async () => {
    audioConfig.serverBase = 'https://cdn.example.com/audio';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    expect(await checkServerPresence('k1', 'corr-1')).toBe('missing');
  });

  it('returns "unknown" (not a false "missing") when the probe throws', async () => {
    audioConfig.serverBase = 'https://cdn.example.com/audio';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await checkServerPresence('k1', 'corr-1')).toBe('unknown');
  });
});
