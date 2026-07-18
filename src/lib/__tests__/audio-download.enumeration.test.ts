// File: src/lib/__tests__/audio-download.enumeration.test.ts
// Description: EN-23 unit tests for the exported clip enumeration (linesForSituation) that the admin
//   audio panel reuses. Verifies dialogue lines carry their per-speaker voice_type, phrase patterns
//   + variants + vocabulary use the default tutor voice, roleplay NPC nodes carry their archetype,
//   and (voiceType, text) duplicates collapse to one clip. Heavy module boundaries are mocked so the
//   import is hermetic (mirrors audio-download.test.ts).
// Author: claude-en23
// Created: 2026-07-17

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../content/repository', () => ({ contentRepository: { listSituations: vi.fn() } }));
vi.mock('../../services/geminiService', () => {
  class FakeEdgeFunctionError extends Error {
    code: string;
    constructor(code: string, message = code) {
      super(message);
      this.code = code;
    }
  }
  return { synthesizeCached: vi.fn(), EdgeFunctionError: FakeEdgeFunctionError };
});
vi.mock('../audioCache', () => ({
  audioCache: { buildKey: vi.fn(), get: vi.fn(), usage: vi.fn() },
  readCacheLimitBytes: vi.fn(() => 5_000_000_000),
}));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { linesForSituation } from '../audio-download';
import { Situation } from '../../content/schema';

const situation = {
  id: 'sit-1',
  level: 0,
  dialogues: [
    { lines: [
      { text: 'Bom dia!', voice_type: 'shopkeeper_male' },
      { text: 'Olá!', voice_type: 'tourist_female' },
      { text: 'Bom dia!', voice_type: 'shopkeeper_male' }, // dup of first (same voice+text)
    ] },
  ],
  phrase_patterns: [
    { base: 'Quanto custa?', variants: [{ text: 'Quanto custa isto?' }] },
  ],
  vocabulary: [{ word: 'obrigado' }, { word: 'obrigado' }], // dup vocab
  roleplay: { nodes: [{ npc_text: 'Posso ajudar?', npc_voice_type: 'clerk_female' }] },
} as unknown as Situation;

describe('linesForSituation (EN-23 reuse)', () => {
  const lines = linesForSituation(situation);

  it('enumerates dialogue, phrase (base+variant), vocabulary and roleplay lines', () => {
    const texts = lines.map((l) => l.text);
    expect(texts).toContain('Bom dia!');
    expect(texts).toContain('Olá!');
    expect(texts).toContain('Quanto custa?');
    expect(texts).toContain('Quanto custa isto?');
    expect(texts).toContain('obrigado');
    expect(texts).toContain('Posso ajudar?');
  });

  it('carries the per-speaker voice_type on dialogue + roleplay lines', () => {
    expect(lines.find((l) => l.text === 'Bom dia!')?.voiceType).toBe('shopkeeper_male');
    expect(lines.find((l) => l.text === 'Posso ajudar?')?.voiceType).toBe('clerk_female');
  });

  it('leaves phrase/vocabulary voiceType undefined (default tutor voice)', () => {
    expect(lines.find((l) => l.text === 'Quanto custa?')?.voiceType).toBeUndefined();
    expect(lines.find((l) => l.text === 'obrigado')?.voiceType).toBeUndefined();
  });

  it('de-duplicates on (voiceType, text)', () => {
    expect(lines.filter((l) => l.text === 'Bom dia!')).toHaveLength(1);
    expect(lines.filter((l) => l.text === 'obrigado')).toHaveLength(1);
  });
});
