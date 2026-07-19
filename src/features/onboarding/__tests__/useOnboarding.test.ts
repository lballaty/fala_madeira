// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/__tests__/useOnboarding.test.ts
// Description: Regression guard for TB-3 and TB-7.
//   TB-3: the onboarding gate must not re-hydrate (and so must not remount the flow back to step 1)
//   when gotrue hands back a NEW user object with the SAME id on TOKEN_REFRESHED (tab-focus). The
//   load effect is keyed on user?.id, not the user object.
//   TB-7: a returning user must skip the whole first-run flow even with NO local record, based on
//   the DB consent flags (has_accepted_terms && has_accepted_ai_usage) — and the local mirror heals.
//   Storage + logger boundaries are mocked so the test is hermetic.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';

const storageGet = vi.fn();
const storageSet = vi.fn();

vi.mock('../../../platform', () => ({
  platform: {
    storage: {
      get: (key: string) => storageGet(key),
      // Mirror the real adapter: set returns Promise<void> (production code chains .catch on it).
      set: (key: string, value: unknown) => {
        storageSet(key, value);
        return Promise.resolve();
      },
    },
  },
}));
vi.mock('../../../lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { useOnboarding } from '../useOnboarding';
import type { OnboardingResult } from '../useOnboarding';

const makeUser = (id: string): User => ({ id }) as User;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * Minimal supabase stub: from('profiles').update(payload).eq('id', id) resolves to { error: null }.
 * Captures the payload passed to .update() so a test can assert exactly which columns were written.
 */
const makeSupabaseStub = () => {
  const update = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn((_col: string, _val: string) => Promise.resolve({ error: null, payload })),
  }));
  const from = vi.fn((_table: string) => ({ update }));
  return { client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient, from, update };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useOnboarding hydration stability (TB-3)', () => {
  it('does NOT re-hydrate when the user object changes but the id is unchanged (tab-focus churn)', async () => {
    storageGet.mockResolvedValue({ complete: true, placementLevel: 2, completedAt: '2026-07-14T00:00:00.000Z' });

    const props = { supabase: null, user: makeUser('u1'), profile: null, setProfile: vi.fn() };
    const { result, rerender } = renderHook((p: typeof props) => useOnboarding(p), { initialProps: props });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.isComplete).toBe(true);
    expect(storageGet).toHaveBeenCalledTimes(1);

    // gotrue TOKEN_REFRESHED: a NEW user object with the SAME id. On the old `[user]` dep this
    // re-ran the effect (second storage read + isLoaded flip → OnboardingFlow remount to step 1).
    rerender({ ...props, user: makeUser('u1') });
    await flush();

    expect(storageGet).toHaveBeenCalledTimes(1); // effect did not re-run
    expect(result.current.isComplete).toBe(true); // gate stayed closed — no reset to "Bem-vindo"
    expect(result.current.isLoaded).toBe(true);
  });

  it('DOES re-hydrate when the user id actually changes (real sign-in / user switch)', async () => {
    storageGet.mockResolvedValue({ complete: false, placementLevel: 0, completedAt: null });

    const props = { supabase: null, user: makeUser('u1'), profile: null, setProfile: vi.fn() };
    const { result, rerender } = renderHook((p: typeof props) => useOnboarding(p), { initialProps: props });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(storageGet).toHaveBeenCalledTimes(1);

    rerender({ ...props, user: makeUser('u2') });
    await waitFor(() => expect(storageGet).toHaveBeenCalledTimes(2));
  });
});

describe('useOnboarding returning-user gate via DB consent (TB-7)', () => {
  const makeProfile = (terms: boolean, ai: boolean) =>
    ({ has_accepted_terms: terms, has_accepted_ai_usage: ai }) as unknown as import('../../../types').UserProfile;

  it('treats a returning user as complete on a device with NO local record when the profile shows consent', async () => {
    // New device / cleared storage: the local record read comes back empty (first run locally)...
    storageGet.mockResolvedValue(null);
    // ...but the DB profile proves onboarding was already finished (consent is the terminal step).
    const props = {
      supabase: null,
      user: makeUser('u1'),
      profile: makeProfile(true, true),
      setProfile: vi.fn(),
    };
    const { result } = renderHook((p: typeof props) => useOnboarding(p), { initialProps: props });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    // Gate is CLOSED (skip the whole flow) even though the local record was empty — no re-onboarding.
    expect(result.current.isComplete).toBe(true);
    // The local mirror self-heals so it never flashes again on this device.
    await waitFor(() => expect(storageSet).toHaveBeenCalledWith('onboarding:record:u1', expect.objectContaining({ complete: true })));
  });

  it('still gates a genuinely new user (no local record, consent not yet given)', async () => {
    storageGet.mockResolvedValue(null);
    const props = {
      supabase: null,
      user: makeUser('u2'),
      profile: makeProfile(false, false),
      setProfile: vi.fn(),
    };
    const { result } = renderHook((p: typeof props) => useOnboarding(p), { initialProps: props });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.isComplete).toBe(false); // first-run flow shows
    expect(storageSet).not.toHaveBeenCalled(); // nothing to heal
  });
});

describe('useOnboarding placement -> proficiency_level (TB-1 Option B, R1)', () => {
  const makeProfile = () =>
    ({
      id: 'u1',
      has_accepted_terms: false,
      has_accepted_ai_usage: false,
      unlocked_level: 1,
    }) as unknown as import('../../../types').UserProfile;

  const result: OnboardingResult = {
    placementLevel: 2, // "Basic conversation"
    acceptedTerms: true,
    acceptedAiUsage: true,
  };

  it('writes proficiency_level = the placement level to the SAME profiles.update as consent', async () => {
    storageGet.mockResolvedValue(null);
    const supa = makeSupabaseStub();
    const setProfile = vi.fn();
    const props = {
      supabase: supa.client,
      user: makeUser('u1'),
      profile: makeProfile(),
      setProfile,
    };
    const { result: hook } = renderHook((p: typeof props) => useOnboarding(p), { initialProps: props });
    await waitFor(() => expect(hook.current.isLoaded).toBe(true));

    await hook.current.complete(result);

    // Exactly one profiles.update carrying BOTH consent flags AND proficiency_level = placement.
    expect(supa.from).toHaveBeenCalledWith('profiles');
    expect(supa.update).toHaveBeenCalledTimes(1);
    const payload = supa.update.mock.calls[0][0];
    expect(payload).toMatchObject({
      has_accepted_terms: true,
      has_accepted_ai_usage: true,
      proficiency_level: 2,
    });
  });

  it('mirrors proficiency_level onto the optimistic setProfile', async () => {
    storageGet.mockResolvedValue(null);
    const supa = makeSupabaseStub();
    const setProfile = vi.fn();
    const props = {
      supabase: supa.client,
      user: makeUser('u1'),
      profile: makeProfile(),
      setProfile,
    };
    const { result: hook } = renderHook((p: typeof props) => useOnboarding(p), { initialProps: props });
    await waitFor(() => expect(hook.current.isLoaded).toBe(true));

    await hook.current.complete(result);

    expect(setProfile).toHaveBeenCalledWith(expect.objectContaining({ proficiency_level: 2 }));
  });

  it('INVARIANT (R5): the onboarding proficiency write contains NO unlocked_level key', async () => {
    storageGet.mockResolvedValue(null);
    const supa = makeSupabaseStub();
    const props = {
      supabase: supa.client,
      user: makeUser('u1'),
      profile: makeProfile(),
      setProfile: vi.fn(),
    };
    const { result: hook } = renderHook((p: typeof props) => useOnboarding(p), { initialProps: props });
    await waitFor(() => expect(hook.current.isLoaded).toBe(true));

    await hook.current.complete(result);

    const payload = supa.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty('unlocked_level');
  });
});
