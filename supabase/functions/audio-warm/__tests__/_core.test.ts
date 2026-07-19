// File: supabase/functions/audio-warm/__tests__/_core.test.ts
// Description: Vitest coverage for the PURE audio-warm core (EN-34 step w1). Imports ONLY the pure
//   _core.ts + the canonical src content modules — NEVER index.ts (the Deno.serve glue is covered by
//   an agentic code review in step w2, not a Deno harness). The headline is the Refinement B parity
//   test: for EVERY situation in EVERY bundled pack, linesForSituationCore must deep-equal the
//   canonical linesForSituation from src/content/lines.ts. That locks the Deno mirror against the one
//   true line walk so "what the warm fn hosts" can never silently drift from "what the app speaks".
//   Also exercises planWarmWork (regen-first, hosted-skip, budget) and shouldStopForRateLimit.
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

import { describe, expect, it } from 'vitest';

import {
  linesForSituationCore,
  mergeTiersCore,
  planWarmWork,
  shouldStopForRateLimit,
  type HostedEntry,
  type NewCandidate,
  type RegenItem,
} from '../_core';
import { linesForSituation } from '../../../../src/content/lines';
import { BUNDLED_PACKS } from '../../../../src/content/bundled';

describe('linesForSituationCore — Refinement B parity with src/content/lines.ts', () => {
  it('deep-equals the canonical walk for every situation in every bundled pack', () => {
    let situationCount = 0;
    for (const pack of BUNDLED_PACKS) {
      for (const situation of pack.situations) {
        situationCount++;
        expect(linesForSituationCore(situation)).toEqual(linesForSituation(situation));
      }
    }
    // Guard: the parity assertion is meaningless if no situations were walked.
    expect(situationCount).toBeGreaterThan(0);
  });
});

describe('planWarmWork', () => {
  const cand = (n: string): NewCandidate => ({
    buildKey: `tts:default:teacher:${n}`,
    voice: 'teacher',
    text: `text-${n}`,
    objectName: `tts_default_teacher_${n}.pcm`,
  });
  const regen = (id: string): RegenItem => ({
    id,
    buildKey: `tts:default:teacher:regen-${id}`,
    voice: 'teacher',
    text: `regen-text-${id}`,
  });

  it('drains regen FIRST, then fills remaining budget with new candidates', () => {
    const res = planWarmWork({
      pendingRegen: [regen('a'), regen('b')],
      hostedByKey: new Map(),
      newCandidates: [cand('1'), cand('2'), cand('3')],
      maxPerRun: 4,
    });
    expect(res.regenWork.map((r) => r.id)).toEqual(['a', 'b']);
    // budget 4 - 2 regen = 2 new, in priority order
    expect(res.newWork.map((c) => c.objectName)).toEqual([
      'tts_default_teacher_1.pcm',
      'tts_default_teacher_2.pcm',
    ]);
  });

  it('regen consumes the WHOLE budget before any new work', () => {
    const res = planWarmWork({
      pendingRegen: [regen('a'), regen('b'), regen('c')],
      hostedByKey: new Map(),
      newCandidates: [cand('1'), cand('2')],
      maxPerRun: 2,
    });
    expect(res.regenWork.map((r) => r.id)).toEqual(['a', 'b']);
    expect(res.newWork).toEqual([]);
  });

  it('skips new candidates already present in hostedByKey (by build_key)', () => {
    const hosted = new Map<string, HostedEntry>([
      [cand('1').buildKey, { generation: 1, tiers: ['bucket'] }],
    ]);
    const res = planWarmWork({
      pendingRegen: [],
      hostedByKey: hosted,
      newCandidates: [cand('1'), cand('2')],
      maxPerRun: 10,
    });
    expect(res.newWork.map((c) => c.objectName)).toEqual(['tts_default_teacher_2.pcm']);
  });

  it('dedupes new candidates within a run by object name', () => {
    const res = planWarmWork({
      pendingRegen: [],
      hostedByKey: new Map(),
      newCandidates: [cand('1'), cand('1'), cand('2')],
      maxPerRun: 10,
    });
    expect(res.newWork.map((c) => c.objectName)).toEqual([
      'tts_default_teacher_1.pcm',
      'tts_default_teacher_2.pcm',
    ]);
  });

  it('respects the maxPerRun budget across regen + new', () => {
    const res = planWarmWork({
      pendingRegen: [regen('a')],
      hostedByKey: new Map(),
      newCandidates: [cand('1'), cand('2'), cand('3')],
      maxPerRun: 2,
    });
    expect(res.regenWork).toHaveLength(1);
    expect(res.newWork).toHaveLength(1);
  });

  it('empty inputs -> empty work', () => {
    const res = planWarmWork({
      pendingRegen: [],
      hostedByKey: new Map(),
      newCandidates: [],
      maxPerRun: 15,
    });
    expect(res.regenWork).toEqual([]);
    expect(res.newWork).toEqual([]);
  });

  it('maxPerRun <= 0 -> empty work', () => {
    const res = planWarmWork({
      pendingRegen: [regen('a')],
      hostedByKey: new Map(),
      newCandidates: [cand('1')],
      maxPerRun: 0,
    });
    expect(res.regenWork).toEqual([]);
    expect(res.newWork).toEqual([]);
  });
});

describe('shouldStopForRateLimit', () => {
  it('is false below the threshold', () => {
    expect(shouldStopForRateLimit(0)).toBe(false);
    expect(shouldStopForRateLimit(1)).toBe(false);
  });

  it('is true at or above the threshold (default 2)', () => {
    expect(shouldStopForRateLimit(2)).toBe(true);
    expect(shouldStopForRateLimit(3)).toBe(true);
  });

  it('honors an explicit threshold', () => {
    expect(shouldStopForRateLimit(2, 3)).toBe(false);
    expect(shouldStopForRateLimit(3, 3)).toBe(true);
  });
});

describe('mergeTiersCore', () => {
  it('adds, dedupes, and stable-sorts', () => {
    expect(mergeTiersCore(['verpex'], 'bucket')).toEqual(['bucket', 'verpex']);
    expect(mergeTiersCore(['bucket'], 'bucket')).toEqual(['bucket']);
    expect(mergeTiersCore(null, 'bucket')).toEqual(['bucket']);
    expect(mergeTiersCore(undefined, 'verpex')).toEqual(['verpex']);
  });
});
