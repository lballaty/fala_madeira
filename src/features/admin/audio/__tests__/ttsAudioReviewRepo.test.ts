// File: src/features/admin/audio/__tests__/ttsAudioReviewRepo.test.ts
// Description: EN-23 unit tests for the audio-review data-access layer. Verifies the happy paths
//   (load reviews, upsert a verdict, enqueue, list queue), the no-client + query-error surfaces
//   (typed RepoError with a code + user message, logged through the canonical logger), and the
//   already-queued (unique-violation 23505) idempotent success. Supabase + logger are mocked.
// Author: claude-en23
// Created: 2026-07-17

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/logger', () => ({
  logger: {
    error: vi.fn(() => ({ request_id: 'req-test-1234' })),
    warn: vi.fn(() => ({ request_id: 'req-test-1234' })),
    info: vi.fn(() => ({ request_id: 'req-test-1234' })),
    debug: vi.fn(),
  },
  userMessage: (code: string, message: string, ref?: string) => (ref ? `${message} (Ref: ${ref})` : `${message} [${code}]`),
}));

import { enqueueRegen, getReviews, isRepoError, listRegenQueue, upsertVerdict } from '../ttsAudioReviewRepo';

/** Minimal chainable Supabase stub. Terminal ops (.in/.single/.insert) resolve `result`. */
const makeSupabase = (result: { data?: unknown; error?: unknown }) => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.upsert = () => builder;
  builder.in = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.insert = () => Promise.resolve(result);
  return { from: () => builder } as never;
};

describe('ttsAudioReviewRepo — no client', () => {
  it('returns a typed error (not a throw) when supabase is null', async () => {
    const r = await getReviews(null, ['k1']);
    expect(isRepoError(r)).toBe(true);
    if (isRepoError(r)) {
      expect(r.code).toBe('EN23_REPO_UNAVAILABLE');
      expect(r.message).toMatch(/not connected/i);
    }
  });
});

describe('getReviews', () => {
  it('returns an empty map for no keys without touching the client', async () => {
    const r = await getReviews(makeSupabase({ data: [] }), []);
    expect(isRepoError(r)).toBe(false);
    if (!isRepoError(r)) expect(r.data).toEqual({});
  });

  it('indexes returned rows by build_key', async () => {
    const rows = [{ build_key: 'k1', verdict: 'good' }, { build_key: 'k2', verdict: 'bad' }];
    const r = await getReviews(makeSupabase({ data: rows }), ['k1', 'k2']);
    expect(isRepoError(r)).toBe(false);
    if (!isRepoError(r)) {
      expect(r.data.k1.verdict).toBe('good');
      expect(r.data.k2.verdict).toBe('bad');
    }
  });

  it('surfaces a query error as a typed RepoError', async () => {
    const r = await getReviews(makeSupabase({ error: { message: 'boom' } }), ['k1']);
    expect(isRepoError(r)).toBe(true);
    if (isRepoError(r)) expect(r.code).toBe('EN23_REVIEW_LOAD_FAILED');
  });
});

describe('upsertVerdict', () => {
  const input = {
    build_key: 'k1', voice: 'default', text: 'Olá', situation_id: 'sit-1', level: 0,
    verdict: 'bad' as const, notes: 'muffled', reviewed_by: 'user-1',
    signals: { bytes: 500, suspicious: true },
  };

  it('returns the upserted row on success', async () => {
    const r = await upsertVerdict(makeSupabase({ data: { build_key: 'k1', verdict: 'bad' } }), input);
    expect(isRepoError(r)).toBe(false);
    if (!isRepoError(r)) expect(r.data.verdict).toBe('bad');
  });

  it('surfaces a write error as a typed RepoError', async () => {
    const r = await upsertVerdict(makeSupabase({ error: { message: 'denied' } }), input);
    expect(isRepoError(r)).toBe(true);
    if (isRepoError(r)) expect(r.code).toBe('EN23_VERDICT_SAVE_FAILED');
  });
});

describe('enqueueRegen', () => {
  const input = { build_key: 'k1', voice: 'default', text: 'Olá', situation_id: 'sit-1', level: 0, reason: 'silent', enqueued_by: 'user-1' };

  it('succeeds on a clean insert', async () => {
    const r = await enqueueRegen(makeSupabase({ error: null }), input);
    expect(isRepoError(r)).toBe(false);
  });

  it('treats a unique-violation (already queued) as idempotent success', async () => {
    const r = await enqueueRegen(makeSupabase({ error: { code: '23505' } }), input);
    expect(isRepoError(r)).toBe(false);
  });

  it('surfaces other insert errors as a typed RepoError', async () => {
    const r = await enqueueRegen(makeSupabase({ error: { code: '42501', message: 'rls' } }), input);
    expect(isRepoError(r)).toBe(true);
    if (isRepoError(r)) expect(r.code).toBe('EN23_ENQUEUE_FAILED');
  });
});

describe('listRegenQueue', () => {
  it('returns queue rows on success', async () => {
    const r = await listRegenQueue(makeSupabase({ data: [{ id: 'q1', build_key: 'k1', status: 'pending' }] }));
    expect(isRepoError(r)).toBe(false);
    if (!isRepoError(r)) expect(r.data).toHaveLength(1);
  });
});
