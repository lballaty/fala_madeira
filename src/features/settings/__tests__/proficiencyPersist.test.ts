// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/__tests__/proficiencyPersist.test.ts
// Description: TB-1 (Option B) — regression for the Settings "Your level" persist action
//   (REQUIREMENTS §5.4/§5.5, R3). The shared setProficiencyLevel writer must: (1) write
//   profiles.proficiency_level to the DB, (2) mirror onto the optimistic setProfile, (3) update the
//   local OnboardingRecord.placementLevel mirror. SEPARATION INVARIANT (R5): the DB write contains
//   NO unlocked_level key. Storage + logger boundaries are mocked so the test is hermetic.
// Author: TB-1 Option B (proficiency_level)
// Created: 2026-07-19

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '../../../types';

const storageGet = vi.fn();
const storageSet = vi.fn();

vi.mock('../../../platform', () => ({
  platform: {
    storage: {
      get: (key: string) => storageGet(key),
      set: (key: string, value: unknown) => {
        storageSet(key, value);
        return Promise.resolve();
      },
    },
  },
}));
vi.mock('../../../lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { setProficiencyLevel } from '../../onboarding/proficiency';

/** Minimal supabase stub capturing the .update() payload; .eq resolves to { error: null }. */
const makeSupabaseStub = () => {
  const update = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn((_col: string, _val: string) => Promise.resolve({ error: null, payload })),
  }));
  const from = vi.fn((_table: string) => ({ update }));
  return { client: { from } as unknown as SupabaseClient, from, update };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('setProficiencyLevel — Settings "Your level" persist (TB-1, R3/R5)', () => {
  it('writes proficiency_level to the profiles row (DB source of truth)', async () => {
    storageGet.mockResolvedValue(null);
    const supa = makeSupabaseStub();
    const ok = await setProficiencyLevel({
      supabase: supa.client,
      userId: 'u1',
      level: 1,
      setProfile: vi.fn(),
    });

    expect(ok).toBe(true);
    expect(supa.from).toHaveBeenCalledWith('profiles');
    expect(supa.update).toHaveBeenCalledTimes(1);
    expect(supa.update.mock.calls[0][0]).toMatchObject({ proficiency_level: 1 });
  });

  it('mirrors proficiency_level onto the optimistic setProfile', async () => {
    storageGet.mockResolvedValue(null);
    const supa = makeSupabaseStub();
    const setProfile = vi.fn();
    await setProficiencyLevel({ supabase: supa.client, userId: 'u1', level: 2, setProfile });

    // setProfile is called with a functional updater; apply it to a prior profile to assert.
    expect(setProfile).toHaveBeenCalledTimes(1);
    const updater = setProfile.mock.calls[0][0] as (p: UserProfile | null) => UserProfile | null;
    const prev = { id: 'u1', unlocked_level: 3 } as unknown as UserProfile;
    expect(updater(prev)).toMatchObject({ proficiency_level: 2, unlocked_level: 3 });
  });

  it('updates the local OnboardingRecord.placementLevel mirror', async () => {
    storageGet.mockResolvedValue({ complete: true, placementLevel: 0, completedAt: null });
    const supa = makeSupabaseStub();
    await setProficiencyLevel({ supabase: supa.client, userId: 'u1', level: 2, setProfile: vi.fn() });

    expect(storageSet).toHaveBeenCalledWith(
      'onboarding:record:u1',
      expect.objectContaining({ placementLevel: 2, complete: true }),
    );
  });

  it('INVARIANT (R5): the proficiency write contains NO unlocked_level key', async () => {
    storageGet.mockResolvedValue(null);
    const supa = makeSupabaseStub();
    await setProficiencyLevel({ supabase: supa.client, userId: 'u1', level: 1, setProfile: vi.fn() });

    expect(supa.update.mock.calls[0][0]).not.toHaveProperty('unlocked_level');
  });
});
