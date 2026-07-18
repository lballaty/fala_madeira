// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/__tests__/sourcing.test.ts
// Description: EN-18 (WP1) unit tests — progress-aware sourcing. Proves the pool is limited to
//   STARTED situations, drops 0-word / stress-test reinforcement entries, groups by course
//   category (category-less situations → "other"), and that isStartedStatus honours the owner's
//   in_progress/completed rule while excluding avoidance statuses.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  buildVocabPool,
  introducesVocabulary,
  isStartedStatus,
  loadStartedSituationIds,
} from '../sourcing';
import type { CourseCategory, Situation } from '../../../../content/schema';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Minimal supabase stub: from().select().eq() resolves to {data, error}. */
const fakeSupabase = (
  data: Array<{ situation_id: string; status: string | null }> | null,
  error: unknown = null
): SupabaseClient =>
  ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data, error }) }) }),
  }) as unknown as SupabaseClient;
const USER = { id: 'u1' } as User;

const situation = (
  id: string,
  words: string[],
  opts: { title?: string; category?: CourseCategory } = {}
): Situation => ({
  id,
  title: opts.title ?? `Situation ${id}`,
  summary: '',
  tracks: [],
  level: 1,
  cefr: 'A2',
  phrase_patterns: [],
  vocabulary: words.map((word) => ({ word, translation: `${word}-en` })),
  ...(opts.category ? { course: { month: 1, day: 1, category: opts.category } } : {}),
});

describe('isStartedStatus (EN-18 owner rule)', () => {
  it('counts in_progress and completed as started', () => {
    expect(isStartedStatus('in_progress')).toBe(true);
    expect(isStartedStatus('completed')).toBe(true);
  });

  it('excludes avoidance / unknown / empty statuses', () => {
    expect(isStartedStatus('skipped')).toBe(false);
    expect(isStartedStatus('abandoned')).toBe(false);
    expect(isStartedStatus(null)).toBe(false);
    expect(isStartedStatus(undefined)).toBe(false);
    expect(isStartedStatus('')).toBe(false);
  });
});

describe('introducesVocabulary (spec §3 filter)', () => {
  it('accepts a situation with vocabulary', () => {
    expect(introducesVocabulary(situation('s1', ['a', 'b']))).toBe(true);
  });

  it('rejects a 0-word situation', () => {
    expect(introducesVocabulary(situation('s1', []))).toBe(false);
  });

  it('rejects a stress test even if (defensively) it carried vocabulary', () => {
    expect(
      introducesVocabulary(
        situation('sit-d7-week-1-stress-test', ['x'], { title: 'Week 1 Stress Test' })
      )
    ).toBe(false);
    expect(
      introducesVocabulary(situation('sit-grand', ['x'], { title: 'Grand Stress Test' }))
    ).toBe(false);
  });
});

describe('buildVocabPool (EN-18 progress-aware pool)', () => {
  it('includes only started situations that introduce vocabulary', () => {
    const situations = [
      situation('s1', ['a', 'b'], { category: 'daily' }),
      situation('s2', ['c'], { category: 'daily' }), // started but see below
      situation('s3', ['d', 'e'], { category: 'travel' }), // NOT started
      situation('sit-d7-week-1-stress-test', [], { title: 'Week 1 Stress Test' }), // started, 0-word
    ];
    const started = new Set(['s1', 's2', 'sit-d7-week-1-stress-test']);

    const pool = buildVocabPool(situations, started);

    expect(pool.situations.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(pool.wordCount).toBe(3); // a,b + c — stress test dropped, s3 not started
  });

  it('groups by course category and omits empty groups, ordered daily→…→other', () => {
    const situations = [
      situation('s1', ['a'], { category: 'work' }),
      situation('s2', ['b', 'c'], { category: 'daily' }),
      situation('s3', ['d'], { category: 'daily' }),
      situation('g1', ['e']), // no course.category → "other"
    ];
    const started = new Set(['s1', 's2', 's3', 'g1']);

    const pool = buildVocabPool(situations, started);

    expect(pool.groups.map((g) => g.category)).toEqual(['daily', 'work', 'other']);
    const daily = pool.groups.find((g) => g.category === 'daily')!;
    expect(daily.situations.map((s) => s.id)).toEqual(['s2', 's3']);
    expect(daily.wordCount).toBe(3);
    expect(pool.groups.find((g) => g.category === 'other')!.label).toBe('Other themes');
  });

  it('is empty when nothing is started', () => {
    const pool = buildVocabPool([situation('s1', ['a'])], new Set());
    expect(pool.situations).toHaveLength(0);
    expect(pool.groups).toHaveLength(0);
    expect(pool.wordCount).toBe(0);
  });
});

describe('loadStartedSituationIds (progress query)', () => {
  it('returns an empty set when signed out (no supabase or no user)', async () => {
    expect((await loadStartedSituationIds(null, USER)).size).toBe(0);
    expect((await loadStartedSituationIds(fakeSupabase([]), null)).size).toBe(0);
  });

  it('keeps only started (in_progress/completed) situation ids', async () => {
    const rows = [
      { situation_id: 's1', status: 'in_progress' },
      { situation_id: 's2', status: 'completed' },
      { situation_id: 's3', status: 'skipped' },
      { situation_id: 's4', status: null },
    ];
    const ids = await loadStartedSituationIds(fakeSupabase(rows), USER);
    expect([...ids].sort()).toEqual(['s1', 's2']);
  });

  it('degrades to an empty set (no throw) on a query error', async () => {
    const ids = await loadStartedSituationIds(fakeSupabase(null, new Error('rls denied')), USER);
    expect(ids.size).toBe(0);
  });
});
