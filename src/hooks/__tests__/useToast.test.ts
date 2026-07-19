// File: src/hooks/__tests__/useToast.test.ts
// Description: EN-31 WP-C tests for the toast primitive's action support. Locks: an actionable toast
//   exposes its actions; taking an action runs the handler AND dismisses the toast; the 'info' type
//   (WP-D degradation notice) passes through; and a newer toast clears the previous dismiss timer so
//   a stale timer can't dismiss the newer toast early (single-slot correctness).
// Author: claude-en31-build (with owner)
// Created: 2026-07-19

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../lib/logger', () => ({ logger: { debug: vi.fn() } }));

import { useToast } from '../useToast';

describe('useToast — action support (EN-31 WP-C/WP-D)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

  it('exposes actions and taking one runs the handler then dismisses the toast', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showToast('boom', 'error', { actions: [{ label: 'Retry', onClick: handler }] }); });
    expect(result.current.toast?.actions).toHaveLength(1);
    act(() => { result.current.toast!.actions![0].onClick(); });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.current.toast).toBeNull();
  });

  it('passes the calm info type through (degradation notice)', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showToast("using your device's voice", 'info'); });
    expect(result.current.toast?.type).toBe('info');
  });

  it("a newer toast clears the previous toast's dismiss timer so it isn't dismissed early", () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.showToast('first', 'success'); });                                   // 3000ms window
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.showToast('second', 'error', { actions: [{ label: 'Retry', onClick: vi.fn() }] }); }); // 8000ms window
    act(() => { vi.advanceTimersByTime(2000); });                                                    // t=4000: the first (3000ms) timer would have fired if not cleared
    expect(result.current.toast?.message).toBe('second');
    act(() => { vi.advanceTimersByTime(6001); });                                                    // past the 8000ms action window
    expect(result.current.toast).toBeNull();
  });
});
