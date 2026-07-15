// File: src/features/guidance/__tests__/matchCapabilities.test.ts
// Description: Unit tests for the EN-18 help-answer -> capability matcher. Verifies title/keyword
//   scoring, accent-insensitivity, the target-only filter, the result limit, and empty input.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { describe, expect, it } from 'vitest';
import { matchCapabilities } from '../matchCapabilities';

describe('matchCapabilities', () => {
  it('returns nothing for empty or whitespace input', () => {
    expect(matchCapabilities('')).toEqual([]);
    expect(matchCapabilities('   ')).toEqual([]);
  });

  it('matches by capability keywords', () => {
    const res = matchCapabilities('You can download lessons for offline use in Profile.');
    expect(res.map((c) => c.id)).toContain('offline-downloads');
  });

  it('ranks a title mention above a lone keyword hit', () => {
    const res = matchCapabilities('Open the Situation Simulator to role-play a conversation.');
    expect(res[0].id).toBe('situation-simulator');
  });

  it('is accent-insensitive', () => {
    // "café" appears in the vocab-lookup keywords/prose; querying without the accent still matches.
    const res = matchCapabilities('How do I look up a word like cafe?');
    expect(res.map((c) => c.id)).toContain('vocab-lookup');
  });

  it('only returns capabilities that have a navigable target', () => {
    const res = matchCapabilities('What are the voice practice limits and access keys?');
    for (const c of res) {
      expect(c.target?.controlId).toBeTruthy();
    }
  });

  it('respects the result limit', () => {
    const res = matchCapabilities('home learning practice tutor profile download goal vocab help', 2);
    expect(res.length).toBeLessThanOrEqual(2);
  });
});
