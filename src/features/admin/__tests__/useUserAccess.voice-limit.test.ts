// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/__tests__/useUserAccess.voice-limit.test.ts
// Description: Regression for EN-25 — the per-user voice-limit grant. useUserAccess.grantAccess must
//   include voice_limit in the profiles UPDATE payload: a numeric value is clamped/truncated and
//   written, and an explicit null clears the per-user override (fall back to the global default).
//   The supabase client is mocked so the test is hermetic; we capture the exact update() payload.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('../../../lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(() => ({ request_id: 'req-test' })) },
  userMessage: (_code: string, msg: string) => msg,
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { useUserAccess } from '../useUserAccess';

const TARGET = {
  id: 'user-123',
  email: 'someone@example.com',
  subscription_tier: 'free' as const,
  unlocked_level: 1,
  voice_limit: null,
  role: 'user' as const,
};

/**
 * Builds a mocked SupabaseClient whose `.from('profiles')` supports:
 *  - select().ilike().maybeSingle() → resolves the TARGET (drives lookupByEmail)
 *  - update(payload).eq(col, val)  → captures payload, resolves { error: null }
 */
const makeSupabase = () => {
  const updateSpy = vi.fn();
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: TARGET, error: null })),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        updateSpy(payload);
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
    })),
  } as unknown as SupabaseClient;
  return { client, updateSpy };
};

const deps = (client: SupabaseClient) => ({
  supabase: client,
  isAdmin: true,
  actorId: 'admin-1',
  showToast: vi.fn(),
  handleSupabaseError: vi.fn(),
});

afterEach(() => vi.clearAllMocks());

describe('useUserAccess.grantAccess — per-user voice_limit (EN-25)', () => {
  it('writes a numeric voice_limit into the profiles UPDATE payload', async () => {
    const { client, updateSpy } = makeSupabase();
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.lookupByEmail(TARGET.email);
    });
    await waitFor(() => expect(result.current.target).not.toBeNull());

    await act(async () => {
      await result.current.grantAccess('free', null, 999999);
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ voice_limit: 999999 }));
  });

  it('writes voice_limit: null to CLEAR the per-user override', async () => {
    const { client, updateSpy } = makeSupabase();
    const { result } = renderHook(() => useUserAccess(deps(client)));

    await act(async () => {
      await result.current.lookupByEmail(TARGET.email);
    });
    await waitFor(() => expect(result.current.target).not.toBeNull());

    await act(async () => {
      await result.current.grantAccess('free', null, null);
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toHaveProperty('voice_limit', null);
  });
});
