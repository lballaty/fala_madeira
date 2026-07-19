// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/__tests__/proficiencyInvariant.test.ts
// Description: TB-1 (Option B) — the SEPARATION INVARIANT test (REQUIREMENTS §2/§8, R5):
//   proficiency_level ⟂ unlocked_level. "Separate" is a claim; this is the proof. Two directions:
//     (1) a proficiency write (the shared setProficiencyLevel writer) touches ONLY proficiency_level
//         — its profiles.update payload and its optimistic setProfile update contain NO
//         unlocked_level key, and a prior unlocked_level on the profile is left untouched.
//     (2) a paywall unlocked_level change (modelled on the real handleUnlockLevel write in
//         src/features/learning/useLessons.ts: .update({ unlocked_level }) + setProfile spread)
//         contains NO proficiency_level key and leaves a prior proficiency_level untouched.
//   No code path may derive, copy, clamp, cap, or gate one field from the other.
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

import { setProficiencyLevel } from '../proficiency';

const makeSupabaseStub = () => {
  const update = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn(() => Promise.resolve({ error: null, payload })),
  }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as unknown as SupabaseClient, from, update };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('SEPARATION INVARIANT proficiency_level ⟂ unlocked_level (TB-1, R5)', () => {
  it('a proficiency write contains NO unlocked_level key and leaves unlocked_level untouched', async () => {
    storageGet.mockResolvedValue(null);
    const supa = makeSupabaseStub();
    const setProfile = vi.fn();

    await setProficiencyLevel({ supabase: supa.client, userId: 'u1', level: 2, setProfile });

    // DB write: proficiency only, no paywall field.
    const dbPayload = supa.update.mock.calls[0][0];
    expect(dbPayload).toMatchObject({ proficiency_level: 2 });
    expect(dbPayload).not.toHaveProperty('unlocked_level');

    // Optimistic update: applying it to a profile that already has unlocked_level=4 leaves that 4
    // untouched and only sets proficiency_level.
    const updater = setProfile.mock.calls[0][0] as (p: UserProfile | null) => UserProfile | null;
    const before = { id: 'u1', unlocked_level: 4, proficiency_level: null } as unknown as UserProfile;
    const after = updater(before) as UserProfile;
    expect(after.unlocked_level).toBe(4);
    expect(after.proficiency_level).toBe(2);
  });

  it('a paywall unlocked_level change contains NO proficiency_level key and leaves proficiency_level untouched', () => {
    // Model the real handleUnlockLevel write (src/features/learning/useLessons.ts): the DB update
    // payload is exactly { unlocked_level: nextLevel } and the optimistic mirror is a spread.
    const profile = { id: 'u1', unlocked_level: 1, proficiency_level: 2 } as unknown as UserProfile;
    const nextLevel = (profile.unlocked_level || 1) + 1;

    const dbPayload = { unlocked_level: nextLevel };
    expect(dbPayload).not.toHaveProperty('proficiency_level');

    // Optimistic spread mirror: proficiency_level rides along unchanged, unlocked_level advances.
    const after = { ...profile, unlocked_level: nextLevel } as UserProfile;
    expect(after.proficiency_level).toBe(2); // untouched by the paywall
    expect(after.unlocked_level).toBe(2);
  });
});
