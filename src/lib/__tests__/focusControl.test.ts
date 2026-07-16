// File: src/lib/__tests__/focusControl.test.ts
// Description: Unit tests for the EN-18 focusControl primitive against a jsdom DOM: it finds a
//   control by data-testid, scrolls it into view, moves focus to it, applies then removes the
//   highlight ring, and resolves false when the control is never present.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusControl } from '../focusControl';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('focusControl', () => {
  it('scrolls to, focuses, and highlights a present control, then clears the highlight', async () => {
    const el = document.createElement('button');
    el.setAttribute('data-testid', 'goal-track-chooser');
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const p = focusControl('goal-track-chooser');
    // Drive the requestAnimationFrame poll + settle the promise.
    await vi.advanceTimersByTimeAsync(50);
    const found = await p;

    expect(found).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(el.classList.contains('ring-ios-blue')).toBe(true);
    expect(document.activeElement).toBe(el);

    // Highlight is short-lived — it clears after the timeout.
    await vi.advanceTimersByTimeAsync(2300);
    expect(el.classList.contains('ring-ios-blue')).toBe(false);
  });

  it('resolves false when the control never appears', async () => {
    const p = focusControl('never-rendered');
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBe(false);
  });
});
