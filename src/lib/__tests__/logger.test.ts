// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/logger.test.ts
// Description: Unit tests for the centralized client logger (src/lib/logger.ts) after the
//   observability build-out. Covers the NEW persistence path (plan obs-client-sink): the
//   ERROR/CRITICAL persist queue now flushes to the service-role `log-sink` edge function via
//   supabase.functions.invoke — NOT a direct RLS-gated table insert — and no longer waits for a
//   signed-in user, so pre-auth / signed-out diagnostics (user_id null) flush too. Also covers
//   which levels persist, requeue-on-failure, and the userMessage/shortRef user surface. The
//   supabase boundary is mocked so the test is hermetic (no network). Note: "no anonymous users"
//   at the product level does not remove the pre-auth window (boot / sign-in), which is exactly
//   what these events capture.
// Author: Observability test build-out (with assistant)
// Created: 2026-07-14

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic boundary: logger imports getSupabase from './supabase'. Replace it so flushing hits a
// controllable fake client instead of the network.
vi.mock('../supabase', () => ({ getSupabase: vi.fn() }));

import { getSupabase } from '../supabase';
import { flushPersistQueue, logger, shortRef, userMessage } from '../logger';

const invoke = vi.fn();
const fakeClient = { functions: { invoke } } as unknown as ReturnType<typeof getSupabase>;

beforeEach(async () => {
  vi.useFakeTimers();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { inserted: 1 }, error: null });
  vi.mocked(getSupabase).mockReturnValue(fakeClient);
  // Drain anything a prior test left queued so counts are per-test.
  await flushPersistQueue();
  invoke.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('logger persistence → log-sink (obs-client-sink)', () => {
  it('flushes queued ERROR events to the log-sink edge function as { events: [...] }', async () => {
    logger.error('unit_test_error', 'boom', { category: 'SYSTEM_HEALTH', details: { a: 1 } });
    await flushPersistQueue();

    expect(invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = invoke.mock.calls[0];
    expect(fnName).toBe('log-sink');
    expect(Array.isArray(options.body.events)).toBe(true);
    const event = options.body.events.find((e: { event_type: string }) => e.event_type === 'unit_test_error');
    expect(event).toBeTruthy();
    expect(event.level).toBe('ERROR');
    expect(event.message).toBe('boom');
  });

  it('flushes pre-auth / signed-out events (user_id null) — no signed-in-user gate', async () => {
    // setUser was never called in this test, so currentUserId is null. The OLD code held events
    // until a user existed; the sink path must flush them anyway (OBSERVABILITY-CONTRACT §7).
    logger.critical('pre_auth_boot_failure', 'failed before sign-in');
    await flushPersistQueue();

    expect(invoke).toHaveBeenCalledTimes(1);
    const event = invoke.mock.calls[0][1].body.events.find(
      (e: { event_type: string }) => e.event_type === 'pre_auth_boot_failure',
    );
    expect(event).toBeTruthy();
    expect(event.user_id).toBeNull();
    expect(event.level).toBe('CRITICAL');
  });

  it('does NOT persist INFO / WARN / DEBUG (only ERROR/CRITICAL)', async () => {
    logger.info('some_info', 'fyi');
    logger.warn('some_warn', 'heads up');
    logger.debug('some_debug', 'trace');
    await flushPersistQueue();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requeues the batch and retries on a failed flush (best-effort, bounded)', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'sink down' } });
    logger.error('transient_persist', 'retry me');

    await flushPersistQueue(); // first attempt errors → event requeued
    expect(invoke).toHaveBeenCalledTimes(1);

    await flushPersistQueue(); // second attempt (invoke now succeeds by default)
    expect(invoke).toHaveBeenCalledTimes(2);
    const retried = invoke.mock.calls[1][1].body.events.find(
      (e: { event_type: string }) => e.event_type === 'transient_persist',
    );
    expect(retried).toBeTruthy();
  });

  it('holds events when no supabase client is available yet (very early boot)', async () => {
    vi.mocked(getSupabase).mockReturnValue(null as unknown as ReturnType<typeof getSupabase>);
    logger.error('no_client_yet', 'boot');
    await flushPersistQueue();
    expect(invoke).not.toHaveBeenCalled();

    // Once the client appears, the held event flushes.
    vi.mocked(getSupabase).mockReturnValue(fakeClient);
    await flushPersistQueue();
    const flushed = invoke.mock.calls[0][1].body.events.find(
      (e: { event_type: string }) => e.event_type === 'no_client_yet',
    );
    expect(flushed).toBeTruthy();
  });
});

describe('logger self-observability — dropped-event counters (EN-27 P2)', () => {
  it('counts ring-buffer overflow drops and reports them via getDiagnostics()', () => {
    const { ringBufferMax } = logger.getDiagnostics();
    const before = logger.getDiagnostics().dropped.ringBuffer;

    // Push well past the ring-buffer cap using DEBUG (ring-buffer only; no persist-queue path).
    const overflow = ringBufferMax + 50;
    for (let i = 0; i < overflow; i++) {
      logger.debug('rb_overflow_probe', `event ${i}`);
    }

    const after = logger.getDiagnostics();
    // At least the 50 events beyond capacity were dropped (more if the buffer was already partly
    // full from earlier tests) — the key property: the drop is COUNTED, not silent.
    expect(after.dropped.ringBuffer - before).toBeGreaterThanOrEqual(50);
    expect(after.ringBufferSize).toBeLessThanOrEqual(ringBufferMax);
  });

  it('getDiagnostics() exposes the queue sizes and both drop tallies', () => {
    const d = logger.getDiagnostics();
    expect(d).toMatchObject({
      sessionId: expect.any(String),
      ringBufferSize: expect.any(Number),
      persistQueueSize: expect.any(Number),
      dropped: { ringBuffer: expect.any(Number), persistQueue: expect.any(Number) },
    });
  });
});

describe('user-visible error surface (userMessage / shortRef)', () => {
  it('shortRef strips dashes and takes the first 8 chars', () => {
    expect(shortRef('abcd1234-e2e-chat-failure')).toBe('abcd1234');
  });

  it('userMessage renders "message (Ref: xxxxxxxx)" when a ref is present', () => {
    expect(userMessage('TTS_FAILED', 'Audio failed', 'abcd1234-ef56')).toBe('Audio failed (Ref: abcd1234)');
  });

  it('userMessage falls back to "message [CODE]" without a ref', () => {
    expect(userMessage('TTS_FAILED', 'Audio failed')).toBe('Audio failed [TTS_FAILED]');
  });
});
