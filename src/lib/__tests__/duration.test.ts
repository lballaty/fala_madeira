// File: src/lib/__tests__/duration.test.ts
// Description: Guards TB-21 — the "time spent" display must scale past minutes (min → h → d) instead
//   of an ever-growing "Nm". Covers unit roll-up boundaries and the zero/negative/NaN guards.
// Author: TB-21 fix (with assistant)
// Created: 2026-07-17

import { describe, expect, it } from 'vitest';
import { formatDuration } from '../duration';

describe('formatDuration (TB-21 time-spent scaling)', () => {
  it('renders minutes under an hour', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(59)).toBe('0m'); // <1m rounds down to 0m
    expect(formatDuration(42 * 60)).toBe('42m');
    expect(formatDuration(59 * 60 + 59)).toBe('59m');
  });

  it('rolls up to hours+minutes between 1h and 1d', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3 * 3600 + 12 * 60)).toBe('3h 12m');
    expect(formatDuration(23 * 3600 + 59 * 60)).toBe('23h 59m');
  });

  it('rolls up to days+hours at/after 1d (no more runaway minutes)', () => {
    expect(formatDuration(86400)).toBe('1d 0h');
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe('2d 4h');
    // The bug: a multi-day total used to read as thousands of minutes; now it's days.
    expect(formatDuration(7 * 86400)).toBe('7d 0h');
  });

  it('treats negative/NaN as zero', () => {
    expect(formatDuration(-100)).toBe('0m');
    expect(formatDuration(Number.NaN)).toBe('0m');
  });
});
