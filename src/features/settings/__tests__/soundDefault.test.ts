// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/__tests__/soundDefault.test.ts
// Description: Regression for TB-5 — the tutor read-aloud preference must default OFF (opt-in) when
//   a user has no saved value, so the practice session doesn't auto-read every message aloud. A
//   stored preference is still respected. Unit-tests the pure seed helper (the shared e2e user has
//   a profile-level preference that overrides the seed, so this default is guarded here).
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { describe, it, expect } from 'vitest';
import { initialSoundEnabled } from '../useSettings';

describe('initialSoundEnabled — tutor read-aloud default (TB-5)', () => {
  it('defaults OFF when there is no saved preference', () => {
    expect(initialSoundEnabled(null)).toBe(false);
  });

  it('respects a saved "true"', () => {
    expect(initialSoundEnabled('true')).toBe(true);
  });

  it('respects a saved "false"', () => {
    expect(initialSoundEnabled('false')).toBe(false);
  });
});
