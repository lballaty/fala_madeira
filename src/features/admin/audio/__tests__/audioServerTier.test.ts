// File: src/features/admin/audio/__tests__/audioServerTier.test.ts
// Description: EN-23/EN-23b unit tests for the EN-8 server-tier seam. Verifies the tier resolves from
//   the REAL config keys (config.audio.verpexBase + config.audio.supabaseAudioBucket — the EN-23b W1
//   fix; the old build read a nonexistent config.audio.serverBase and was hardwired unavailable), that
//   isServerTierAvailable reflects actual config, and that checkServerPresence builds the URL from
//   keyToServerPath (NOT the raw build key), probes Verpex first then the Supabase bucket, and maps
//   2xx→present / 404→missing / error→unknown (never a false 'missing').
// Author: claude-en23 (EN-23b W1 by claude-en23b)
// Created: 2026-07-17. Updated: 2026-07-19.

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mutable config the module reads; each test sets the EN-8 tier keys as needed. serverTierTimeoutMs
// is always present (the probe passes it to AbortSignal.timeout).
const audioConfig: { verpexBase?: string; supabaseAudioBucket?: string; serverTierTimeoutMs: number } = {
  serverTierTimeoutMs: 4000,
};
vi.mock('../../../../config', () => ({ config: { get audio() { return audioConfig; } } }));
vi.mock('../../../../lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Deterministic public-bucket URL builder (mirrors src/lib/supabase.publicObjectUrl shape).
vi.mock('../../../../lib/supabase', () => ({
  publicObjectUrl: (bucket: string, path: string) => `https://sb.example.co/storage/v1/object/public/${bucket}/${path}`,
}));

import { keyToServerPath } from '../../../../lib/audioKey';
import {
  checkServerPresence,
  isServerTierAvailable,
  resolveSupabaseBucket,
  resolveVerpexBase,
} from '../audioServerTier';

const KEY = 'tts:default:default:abc12345';
const PATH = keyToServerPath(KEY); // e.g. default_default_abc12345.pcm

afterEach(() => {
  delete audioConfig.verpexBase;
  delete audioConfig.supabaseAudioBucket;
  vi.restoreAllMocks();
});

describe('resolve* / isServerTierAvailable', () => {
  it('reports UNAVAILABLE only when neither tier is configured (genuine "pending EN-8")', () => {
    expect(resolveVerpexBase()).toBeNull();
    expect(resolveSupabaseBucket()).toBeNull();
    expect(isServerTierAvailable()).toBe(false);
  });

  it('is available (and no longer hardwired false) when verpexBase is configured', () => {
    audioConfig.verpexBase = '/audio';
    expect(resolveVerpexBase()).toBe('/audio');
    expect(isServerTierAvailable()).toBe(true);
  });

  it('normalizes a trailing slash on verpexBase and treats a blank base as unconfigured', () => {
    audioConfig.verpexBase = 'https://cdn.example.com/audio/';
    expect(resolveVerpexBase()).toBe('https://cdn.example.com/audio');
    audioConfig.verpexBase = '   ';
    expect(resolveVerpexBase()).toBeNull();
  });

  it('is available when only the Supabase bucket is configured', () => {
    audioConfig.supabaseAudioBucket = 'tts-audio';
    expect(resolveSupabaseBucket()).toBe('tts-audio');
    expect(isServerTierAvailable()).toBe(true);
  });
});

// A HEAD Response stub: `ct` is the content-type header the probe reads.
const resp = (ok: boolean, status: number, ct = 'application/octet-stream') => ({
  ok,
  status,
  headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? ct : null) },
});

describe('checkServerPresence', () => {
  it('returns "unknown" without fetching when neither tier is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await checkServerPresence(KEY, 'corr-1')).toBe('unknown');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('probes Verpex at verpexBase + keyToServerPath(key) (NOT the raw build key) and returns present on 2xx', async () => {
    audioConfig.verpexBase = 'https://cdn.example.com/audio';
    const fetchSpy = vi.fn(async () => resp(true, 200));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await checkServerPresence(KEY, 'corr-1')).toBe('present');
    expect(fetchSpy).toHaveBeenCalledWith(`https://cdn.example.com/audio/${PATH}`, expect.objectContaining({ method: 'HEAD' }));
    // Guard against the old raw-key bug: the URL must be keyToServerPath-based, not the encoded key.
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent(KEY)), expect.anything());
  });

  it('treats a 200 text/html (SPA fallback) as MISSING, not a false present', async () => {
    audioConfig.verpexBase = '/audio';
    vi.stubGlobal('fetch', vi.fn(async () => resp(true, 200, 'text/html; charset=utf-8')));
    expect(await checkServerPresence(KEY, 'corr-1')).toBe('missing');
  });

  it('falls through Verpex 404 to the Supabase bucket, returning present when the bucket has it', async () => {
    audioConfig.verpexBase = '/audio';
    audioConfig.supabaseAudioBucket = 'tts-audio';
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(resp(false, 404)) // verpex miss
      .mockResolvedValueOnce(resp(true, 200)); // supabase hit
    vi.stubGlobal('fetch', fetchSpy);
    expect(await checkServerPresence(KEY, 'corr-1')).toBe('present');
    expect(fetchSpy).toHaveBeenNthCalledWith(1, `/audio/${PATH}`, expect.objectContaining({ method: 'HEAD' }));
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      `https://sb.example.co/storage/v1/object/public/tts-audio/${PATH}`,
      expect.objectContaining({ method: 'HEAD' }),
    );
  });

  it('returns "missing" only when every configured tier positively 404s', async () => {
    audioConfig.verpexBase = '/audio';
    audioConfig.supabaseAudioBucket = 'tts-audio';
    vi.stubGlobal('fetch', vi.fn(async () => resp(false, 404)));
    expect(await checkServerPresence(KEY, 'corr-1')).toBe('missing');
  });

  it('returns "unknown" (not a false "missing") when the probe throws', async () => {
    audioConfig.verpexBase = '/audio';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await checkServerPresence(KEY, 'corr-1')).toBe('unknown');
  });
});
