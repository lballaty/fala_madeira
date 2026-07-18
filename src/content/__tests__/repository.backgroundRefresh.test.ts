// File: src/content/__tests__/repository.backgroundRefresh.test.ts
// Description: Guards EN-27 P2 — the degraded-cache background refresh used to swallow failures via
//   `.catch(() => undefined)`, so a user stuck on corrupt cached content left no trace. The logic is
//   now in runBackgroundRefresh(refresh, correlationId); these tests inject a resolving/rejecting
//   refresh fn and assert it logs CONTENT_REFRESH_BACKGROUND_FAILED on failure and stays silent on
//   success.
// Author: EN-27 error-hardening (test build-out)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), critical: vi.fn() },
}));
// repository.ts imports supabase + platform at module load; stub them so import is hermetic.
vi.mock('../../lib/supabase', () => ({ getSupabase: vi.fn(() => null) }));
vi.mock('../../platform', () => ({
  platform: { storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn(async () => []) } },
}));

import { runBackgroundRefresh } from '../repository';
import { logger } from '../../lib/logger';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.clearAllMocks());

describe('runBackgroundRefresh (EN-27 P2 — degraded-cache refresh is not silent)', () => {
  it('logs CONTENT_REFRESH_BACKGROUND_FAILED when the refresh rejects', async () => {
    runBackgroundRefresh(() => Promise.reject(new Error('network down')), 'corr-1');
    await flush();

    expect(logger.warn).toHaveBeenCalledWith(
      'CONTENT_REFRESH_BACKGROUND_FAILED',
      expect.any(String),
      expect.objectContaining({ category: 'DATA_PROCESSING', correlationId: 'corr-1' }),
    );
  });

  it('stays silent when the refresh resolves', async () => {
    runBackgroundRefresh(() => Promise.resolve({ ok: true }), 'corr-2');
    await flush();

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
