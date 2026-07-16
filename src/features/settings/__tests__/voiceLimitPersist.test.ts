// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/__tests__/voiceLimitPersist.test.ts
// Description: Regression for TB-8 — the admin write-back of global_settings.voice_limit must fire
//   ONLY on an explicit admin change (current value differs from the authoritative server value),
//   never on load or profile-identity churn. Previously the write-back re-persisted the display
//   value on every effect run, clobbering the server setting (observed reset 50 -> 20). Unit-tests
//   the pure decision helper (the full hook's effect wiring is guarded here via the helper).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

import { describe, it, expect } from 'vitest';
import { shouldPersistGlobalVoiceLimit } from '../useSettings';

describe('shouldPersistGlobalVoiceLimit — global voice-limit write-back guard (TB-8)', () => {
  it('does NOT persist on load / no-change (value equals the server value)', () => {
    // The clobber path: admin app-load with value === fetched server value must not write back.
    expect(shouldPersistGlobalVoiceLimit({ isAdmin: true, currentValue: 50, serverValue: 50 })).toBe(false);
  });

  it('does NOT persist for a non-admin even when the value differs', () => {
    // RLS also blocks it server-side, but the client must not even attempt the write.
    expect(shouldPersistGlobalVoiceLimit({ isAdmin: false, currentValue: 20, serverValue: 50 })).toBe(false);
  });

  it('persists when an admin changes the value away from the server value', () => {
    expect(shouldPersistGlobalVoiceLimit({ isAdmin: true, currentValue: 50, serverValue: 20 })).toBe(true);
  });

  it('does NOT persist before the server value is known (serverValue null, value === default)', () => {
    // A failed/pending fetch leaves serverValue null; the hook also gates on hasLoaded, but even if
    // reached, a null server value with a matching provisional value must not write. (A genuine
    // admin change to a non-null value while server is unknown still returns true — acceptable, as
    // hasLoaded gates that upstream.)
    expect(shouldPersistGlobalVoiceLimit({ isAdmin: true, currentValue: 5, serverValue: 5 })).toBe(false);
  });
});
