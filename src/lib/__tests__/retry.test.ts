// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/retry.test.ts
// Description: Unit tests for the bounded backoff-with-jitter retry helper (src/lib/retry.ts).
//   Covers: succeeds first try (no retry), retries a transient failure then succeeds, exhausts
//   the attempt budget and rethrows the last error, and honors shouldRetry=false (no retry on a
//   non-transient error). Uses vitest fake timers to advance the backoff waits deterministically.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from '../retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result without retrying when the first attempt succeeds', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withRetry(fn, { label: 'test' });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return 'ok';
    });
    const promise = withRetry(fn, { label: 'test', baseDelayMs: 10, maxAttempts: 3 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts the attempt budget and rethrows the last error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('always fails');
    });
    const promise = withRetry(fn, { label: 'test', baseDelayMs: 10, maxAttempts: 3 });
    // Attach a rejection handler before advancing timers to avoid an unhandled rejection.
    const settled = promise.catch((e) => e as Error);
    await vi.runAllTimersAsync();
    const err = await settled;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const fn = vi.fn(async () => {
      throw new Error('non-transient');
    });
    const promise = withRetry(fn, {
      label: 'test',
      baseDelayMs: 10,
      maxAttempts: 3,
      shouldRetry: () => false,
    });
    await expect(promise).rejects.toThrow('non-transient');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
