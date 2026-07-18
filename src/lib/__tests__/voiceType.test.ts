// File: src/lib/__tests__/voiceType.test.ts
// Description: Parity lock (EN-8) — the client voiceTypeForTutor mirror MUST return the same
//   VoiceType as the server mapping in supabase/functions/_shared/tts/router.ts for every
//   gender/age combination. The server logic is duplicated here as the expected table (the Deno
//   server fn can't be imported into the browser test); if router.ts changes, this test + the
//   mirror must be updated together.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { describe, it, expect } from 'vitest';
import type { Tutor } from '../../types';
import type { VoiceType } from '../../content/schema';
import { voiceTypeForTutor } from '../voiceType';

// Verbatim mirror of server router.ts voiceTypeForTutor (the source of truth this must match).
const serverExpected = (tutor?: { age?: number; gender?: string }): VoiceType => {
  if (!tutor) return 'teacher';
  if ((tutor.age ?? 0) > 40) return 'older';
  return tutor.gender === 'female' ? 'teacher' : 'local';
};

const tutor = (age: number, gender: 'male' | 'female'): Tutor =>
  ({ id: 't', name: 't', age, gender, description: '', avatar: '', personality: '' });

describe('client voiceTypeForTutor mirrors the server mapping', () => {
  it('returns teacher when no tutor', () => {
    expect(voiceTypeForTutor(undefined)).toBe('teacher');
    expect(voiceTypeForTutor(undefined)).toBe(serverExpected(undefined));
  });

  it('matches the server for every gender x age band', () => {
    const cases: Array<[number, 'male' | 'female']> = [
      [25, 'female'], [25, 'male'],
      [40, 'female'], [40, 'male'],   // boundary: 40 is NOT >40
      [41, 'female'], [41, 'male'],
      [65, 'female'], [65, 'male'],
    ];
    for (const [age, gender] of cases) {
      expect(voiceTypeForTutor(tutor(age, gender))).toBe(serverExpected({ age, gender }));
    }
  });

  it('locks the concrete expectations (older>40 either gender; female->teacher, male->local at/below 40)', () => {
    expect(voiceTypeForTutor(tutor(65, 'female'))).toBe('older');
    expect(voiceTypeForTutor(tutor(65, 'male'))).toBe('older');
    expect(voiceTypeForTutor(tutor(30, 'female'))).toBe('teacher');
    expect(voiceTypeForTutor(tutor(30, 'male'))).toBe('local');
    expect(voiceTypeForTutor(tutor(40, 'male'))).toBe('local');
  });
});
