// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/__tests__/useUserAccess.search.test.ts
// Description: EN-26 — user search behaviour of useUserAccess. Proves: (1) a partial query becomes a
//   case-insensitive substring match ('%q%'); (2) an EMPTY query browses all users ('%%'), ordered by
//   email and bounded; (3) the result cap truncates + flags (asks for LIMIT+1 to detect "more exist");
//   (4) a single match auto-selects as the grant target; (5) multiple matches populate the picklist
//   with no target; (6) zero matches clear target + toast; (7) selectTarget picks one and collapses the
//   list. The supabase client is mocked so the test is hermetic and captures the exact query builder.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('../../../lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(() => ({ request_id: 'req-test' })) },
  userMessage: (_code: string, msg: string) => msg,
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { useUserAccess, USER_SEARCH_LIMIT, type AccessTarget } from '../useUserAccess';

const row = (n: number): AccessTarget => ({
  id: `id-${n}`,
  email: `user${String(n).padStart(3, '0')}@example.com`,
  subscription_tier: 'free',
  unlocked_level: 1,
  voice_limit: null,
  role: 'user',
});

/** Mock `.from('profiles').select().ilike().order().limit()` → `{ data: rows }`, capturing args. */
const makeSupabase = (rows: AccessTarget[]) => {
  const ilikeSpy = vi.fn();
  const orderSpy = vi.fn();
  const limitSpy = vi.fn();
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn((col: string, pattern: string) => {
          ilikeSpy(col, pattern);
          return {
            order: vi.fn((col2: string, opts: unknown) => {
              orderSpy(col2, opts);
              return {
                limit: vi.fn(async (n: number) => {
                  limitSpy(n);
                  return { data: rows, error: null };
                }),
              };
            }),
          };
        }),
      })),
    })),
  } as unknown as SupabaseClient;
  return { client, ilikeSpy, orderSpy, limitSpy };
};

const deps = (client: SupabaseClient) => ({
  supabase: client,
  isAdmin: true,
  actorId: 'admin-1',
  showToast: vi.fn(),
  handleSupabaseError: vi.fn(),
});

afterEach(() => vi.clearAllMocks());

describe('useUserAccess.searchUsers — partial email + browse-all (EN-26)', () => {
  it('builds a case-insensitive SUBSTRING match for a partial query', async () => {
    const { client, ilikeSpy, orderSpy, limitSpy } = makeSupabase([row(1), row(2)]);
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.searchUsers('  Nadia  '); // trimmed
    });

    expect(ilikeSpy).toHaveBeenCalledWith('email', '%Nadia%');
    expect(orderSpy).toHaveBeenCalledWith('email', { ascending: true });
    expect(limitSpy).toHaveBeenCalledWith(USER_SEARCH_LIMIT + 1); // asks for one extra to detect truncation
  });

  it('an EMPTY query browses ALL users (matches everything, still bounded + ordered)', async () => {
    const { client, ilikeSpy, limitSpy } = makeSupabase([row(1)]);
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.searchUsers('   ');
    });

    expect(ilikeSpy).toHaveBeenCalledWith('email', '%%'); // '%%' → every row
    expect(limitSpy).toHaveBeenCalledWith(USER_SEARCH_LIMIT + 1);
  });

  it('auto-selects a SINGLE match as the grant target', async () => {
    const { client } = makeSupabase([row(7)]);
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.searchUsers('user007');
    });

    await waitFor(() => expect(result.current.target?.id).toBe('id-7'));
    expect(result.current.results).toHaveLength(0); // collapsed — no picklist for one match
  });

  it('MULTIPLE matches populate the picklist with no auto-selected target', async () => {
    const { client } = makeSupabase([row(1), row(2), row(3)]);
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.searchUsers('user');
    });

    await waitFor(() => expect(result.current.results).toHaveLength(3));
    expect(result.current.target).toBeNull();
    expect(result.current.resultsTruncated).toBe(false);
  });

  it('TRUNCATES to the cap and flags when more users exist than the limit', async () => {
    // The hook asks for LIMIT+1; when it gets LIMIT+1 back it shows LIMIT and marks truncated.
    const overflow = Array.from({ length: USER_SEARCH_LIMIT + 1 }, (_, i) => row(i));
    const { client } = makeSupabase(overflow);
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.searchUsers('');
    });

    await waitFor(() => expect(result.current.resultsTruncated).toBe(true));
    expect(result.current.results).toHaveLength(USER_SEARCH_LIMIT);
  });

  it('ZERO matches clear the target and surface a miss toast', async () => {
    const { client } = makeSupabase([]);
    const showToast = vi.fn();
    const { result } = renderHook(() => useUserAccess({ ...deps(client), showToast }));

    await act(async () => {
      await result.current.searchUsers('nobody');
    });

    await waitFor(() => expect(result.current.results).toHaveLength(0));
    expect(result.current.target).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/no users match/i), 'error');
  });

  it('selectTarget picks one result and collapses the list', async () => {
    const { client } = makeSupabase([row(1), row(2)]);
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.searchUsers('user');
    });
    await waitFor(() => expect(result.current.results).toHaveLength(2));

    act(() => {
      result.current.selectTarget(row(2));
    });

    expect(result.current.target?.id).toBe('id-2');
    expect(result.current.results).toHaveLength(0);
  });

  it('refuses to search when not admin / no client (guarded, toasts)', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useUserAccess({ supabase: null, isAdmin: false, actorId: null, showToast, handleSupabaseError: vi.fn() }),
    );

    await act(async () => {
      await result.current.searchUsers('anyone');
    });

    expect(result.current.results).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});
