// File: src/content/__tests__/lines.test.ts
// Description: Locks the pure linesForSituation enumerator (EN-8). Guards that the extraction from
//   audio-download.ts kept full coverage — dialogues (per-speaker voice_type), phrase_patterns
//   (base + variants), vocabulary, roleplay NPC lines (npc_voice_type) — AND that roleplay learner
//   OPTION text is now enumerated in the default voice (COORD-1: scripted-simulator audio must be
//   downloadable + pre-hostable). Also locks (voiceType,text) de-duplication.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { describe, it, expect } from 'vitest';
import type { Situation } from '../schema';
import { linesForSituation } from '../lines';

// Minimal Situation carrying only the fields linesForSituation reads.
const situation = (): Situation =>
  ({
    dialogues: [
      { lines: [
        { text: 'Olá', voice_type: 'local' },
        { text: 'Bom dia', voice_type: 'teacher' },
      ] },
    ],
    phrase_patterns: [{ base: 'Faz favor', variants: [{ text: 'Se faz favor' }] }],
    vocabulary: [{ word: 'água' }],
    roleplay: {
      nodes: [
        {
          id: 'n1',
          npc_text: 'Que deseja?',
          npc_voice_type: 'service_worker',
          options: [{ text: 'Um café' }, { text: 'Uma água' }],
        },
        // A second node repeating an option text — must de-duplicate to one clip.
        { id: 'n2', npc_text: 'Mais alguma coisa?', npc_voice_type: 'service_worker', options: [{ text: 'Um café' }] },
      ],
    },
  } as unknown as Situation);

describe('linesForSituation', () => {
  const lines = linesForSituation(situation());
  const has = (text: string, voiceType?: string) =>
    lines.some((l) => l.text === text && l.voiceType === voiceType);

  it('enumerates dialogue lines with their per-speaker voice_type', () => {
    expect(has('Olá', 'local')).toBe(true);
    expect(has('Bom dia', 'teacher')).toBe(true);
  });

  it('enumerates phrase patterns (base + variants) and vocabulary in the default voice', () => {
    expect(has('Faz favor', undefined)).toBe(true);
    expect(has('Se faz favor', undefined)).toBe(true);
    expect(has('água', undefined)).toBe(true);
  });

  it('enumerates roleplay NPC lines with npc_voice_type', () => {
    expect(has('Que deseja?', 'service_worker')).toBe(true);
    expect(has('Mais alguma coisa?', 'service_worker')).toBe(true);
  });

  it('enumerates roleplay learner OPTION text in the default voice (COORD-1)', () => {
    expect(has('Um café', undefined)).toBe(true);
    expect(has('Uma água', undefined)).toBe(true);
  });

  it('de-duplicates a repeated (voiceType,text) so a clip is enumerated once', () => {
    expect(lines.filter((l) => l.text === 'Um café').length).toBe(1);
  });
});
