// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/home/__tests__/proficiencyLabel.test.ts
// Description: TB-1 (Option B) — regression for the Home greeting proficiency label derivation
//   (REQUIREMENTS §5.3, R2/R6). The label is derived ONLY from proficiency_level (the placement
//   domain 0/1/2, mirroring OnboardingFlow's placement option labels), NEVER from the paywall
//   unlocked_level. Null / undefined / out-of-range must fall back to the neutral "Student" —
//   never crash, never fabricate "Absolute Beginner".
// Author: TB-1 Option B (proficiency_level)
// Created: 2026-07-19

import { describe, it, expect } from 'vitest';
import { proficiencyLabel } from '../useHome';

describe('proficiencyLabel — Home greeting derivation (TB-1, R2/R6)', () => {
  it('maps the placement domain 0/1/2 to the placement option labels', () => {
    expect(proficiencyLabel(0)).toBe('Complete beginner');
    expect(proficiencyLabel(1)).toBe('A few words');
    expect(proficiencyLabel(2)).toBe('Basic conversation');
  });

  it('falls back to the neutral "Student" for null (not yet placed)', () => {
    expect(proficiencyLabel(null)).toBe('Student');
  });

  it('falls back to the neutral "Student" for undefined (pre-existing user, no column value)', () => {
    expect(proficiencyLabel(undefined)).toBe('Student');
  });

  it('falls back to "Student" for out-of-range values (never crash, never mislabel)', () => {
    // Higher-than-mapped practical levels (the column allows 0..5) and nonsense both degrade
    // gracefully until the label map grows — they must NOT render a fabricated beginner label.
    expect(proficiencyLabel(3)).toBe('Student');
    expect(proficiencyLabel(5)).toBe('Student');
    expect(proficiencyLabel(-1)).toBe('Student');
    expect(proficiencyLabel(99)).toBe('Student');
  });
});
