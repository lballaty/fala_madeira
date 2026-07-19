// File: src/features/session/__tests__/usePathContext.placement.test.ts
// Description: TB-1a/R9 unit test for the placement-threading seam. Verifies usePathContext threads
//   the caller's placementLevel into PathContext.placementLevel verbatim (the real proficiency),
//   and falls back to 0 (D1/§5.4 — complete beginner, the honest non-skipping default) when no
//   placement is supplied. This is the wiring that fixes the reported "placement makes no difference"
//   bug: App.tsx now passes profile.proficiency_level here instead of relying on the old ?? 1 default.
//   All boundaries (content repo, due-items/SRS, logger) are mocked so the test is hermetic.
// Author: claude-tb1a
// Created: 2026-07-19

import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { PracticalLevel } from '../../../content/schema';

vi.mock('../../../content/repository', () => ({
  contentRepository: {
    listSituations: vi.fn(async () => []),
    listTracks: vi.fn(async () => []),
  },
}));
vi.mock('../../../hooks/useDueItems', () => ({
  useDueItems: vi.fn(() => ({ items: [] })),
}));
vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { usePathContext } from '../usePathContext';

// A minimal supabase double: usePathContext only reads user_situation_progress (best-effort); with a
// null user it short-circuits to an empty completion set, so no query surface is exercised here.
const supabase = null as unknown as SupabaseClient;
const user = null as unknown as User;

describe('usePathContext placement threading (TB-1a R9)', () => {
  it('threads the real placementLevel verbatim into PathContext', async () => {
    const { result } = renderHook(() =>
      usePathContext({ supabase, user, placementLevel: 2 as PracticalLevel }),
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.context.placementLevel).toBe(2);
  });

  it('falls back to 0 (complete beginner) when no placement is supplied (D1/§5.4)', async () => {
    const { result } = renderHook(() => usePathContext({ supabase, user }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    // Previously this defaulted to 1 (skipping unplaced learners ahead); TB-1a makes it 0.
    expect(result.current.context.placementLevel).toBe(0);
  });

  it('threads placement 0 verbatim (distinct from the undefined→0 fallback path)', async () => {
    const { result } = renderHook(() =>
      usePathContext({ supabase, user, placementLevel: 0 as PracticalLevel }),
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.context.placementLevel).toBe(0);
  });
});
