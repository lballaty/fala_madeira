// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/__tests__/useOnboarding.test.ts
// Description: Regression guard for TB-3 — the onboarding gate must not re-hydrate (and so must not
//   remount the flow back to step 1) when gotrue hands back a NEW user object with the SAME id on
//   TOKEN_REFRESHED (browser tab-focus / "switch pages and go back"). The load effect is keyed on
//   user?.id, not the user object; this test proves same-id churn does not re-read storage, while a
//   real id change does. Storage + logger boundaries are mocked so the test is hermetic.
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
      set: (key: string, value: unknown) => storageSet(key, value),
    },
  },
}));
vi.mock('../../../lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { useOnboarding } from '../useOnboarding';

const makeUser = (id: string): User => ({ id }) as User;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
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
