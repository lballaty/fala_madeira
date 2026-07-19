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

import { enqueueRegen, fetchHostedGenerations, getReviews, isRepoError, listRegenQueue, upsertVerdict } from '../ttsAudioReviewRepo';

/** Minimal chainable Supabase stub. Terminal ops (.in/.single/.insert) resolve `result`. `capture`
 *  (when passed) records the last insert payload so a test can assert the enqueue→queue contract. */
const makeSupabase = (result: { data?: unknown; error?: unknown }, capture?: { insert?: unknown }) => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.upsert = () => builder;
  builder.in = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.insert = (payload: unknown) => {
    if (capture) capture.insert = payload;
    return Promise.resolve(result);
  };
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

  // c1 (W6): the enqueue→queue contract — the inserted row must carry everything the audio-warm edge
  // fn consumes to re-synthesize + fulfil (build_key + voice + text) plus a non-empty reason (the
  // verdict/notes context, threaded by the hook) and status='pending'.
  it('inserts the re-synthesis inputs + a non-empty verdict-derived reason with status=pending', async () => {
    const capture: { insert?: unknown } = {};
    const r = await enqueueRegen(makeSupabase({ error: null }, capture), { ...input, reason: 're_record: muffled' });
    expect(isRepoError(r)).toBe(false);
    const row = capture.insert as Record<string, unknown>;
    expect(row.build_key).toBe('k1');
    expect(row.voice).toBe('default');
    expect(row.text).toBe('Olá');
    expect(row.status).toBe('pending');
    expect(typeof row.reason).toBe('string');
    expect((row.reason as string).length).toBeGreaterThan(0);
    expect(row.reason).toBe('re_record: muffled');
  });
});

describe('listRegenQueue', () => {
  it('returns queue rows on success', async () => {
    const r = await listRegenQueue(makeSupabase({ data: [{ id: 'q1', build_key: 'k1', status: 'pending' }] }));
    expect(isRepoError(r)).toBe(false);
    if (!isRepoError(r)) expect(r.data).toHaveLength(1);
  });
});

// c2 (W5): the hosted-generation manifest read is BEST-EFFORT — present rows map by build_key, and
// ANY failure (query error / not-yet-applied table) degrades to an EMPTY map (⇒ every clip gen 1),
// NEVER a throw. It also never surfaces a RepoError (returns a bare Map, not a RepoResult).
describe('fetchHostedGenerations', () => {
  it('returns an empty map for no keys / no client without touching the client', async () => {
    expect((await fetchHostedGenerations(null, ['k1'])).size).toBe(0);
    expect((await fetchHostedGenerations(makeSupabase({ data: [] }), [])).size).toBe(0);
  });

  it('maps present rows by build_key with generation + object_name', async () => {
    const rows = [
      { build_key: 'k1', generation: 3, object_name: 'k1.v3.pcm' },
      { build_key: 'k2', generation: 1, object_name: 'k2.pcm' },
    ];
    const m = await fetchHostedGenerations(makeSupabase({ data: rows }), ['k1', 'k2']);
    expect(m.get('k1')).toEqual({ generation: 3, objectName: 'k1.v3.pcm' });
    expect(m.get('k2')).toEqual({ generation: 1, objectName: 'k2.pcm' });
    expect(m.has('k3')).toBe(false); // absent → caller defaults to generation 1
  });

  it('degrades to an EMPTY map (not a throw) on a query error / missing table', async () => {
    const m = await fetchHostedGenerations(makeSupabase({ error: { code: '42P01', message: 'relation does not exist' } }), ['k1']);
    expect(m.size).toBe(0);
  });
});
