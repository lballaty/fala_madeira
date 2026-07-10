// File: /Users/liborballaty/.../src/features/practice/simulator/__tests__/scenario.test.ts
// Description: Unit tests for the pure Situation Simulator helpers (simulator/scenario.ts):
//   normalizePt, similarity (token + bigram Dice), matchOption, parseFreeReply (EN: + [FIM]
//   protocol), findNode, and buildFreeRoleplayPrompt shape. No React/Supabase imports in the
//   module (deterministic) so no mocks are needed.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import type { RoleplayNode, RoleplayOption, Situation } from '../../../../content/schema';
import {
  buildFreeRoleplayPrompt,
  findNode,
  matchOption,
  normalizePt,
  parseFreeReply,
  similarity,
} from '../scenario';

describe('normalizePt', () => {
  it('strips accents/case/punctuation and collapses whitespace', () => {
    expect(normalizePt('  Olá,  TUDO   bem? ')).toBe('ola tudo bem');
  });
});

describe('similarity', () => {
  it('is 1 for identical (normalized) phrases', () => {
    expect(similarity('Bom dia', 'bom dia')).toBe(1);
  });

  it('is robust to accents/case/punctuation', () => {
    expect(similarity('Está tudo bem?', 'esta tudo bem')).toBe(1);
  });

  it('is 0 for disjoint short phrases', () => {
    expect(similarity('xyz', 'qrs')).toBe(0);
  });

  it('gives partial credit for reordered overlapping tokens', () => {
    const score = similarity('quero um cafe', 'um cafe quero se faz favor');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe('matchOption', () => {
  const options: RoleplayOption[] = [
    { text: 'Quero um café, por favor.' },
    { text: 'A conta, se faz favor.' },
  ];

  it('returns the best-scoring option index', () => {
    const match = matchOption('queria um cafe por favor', options);
    expect(match?.index).toBe(0);
    expect(match!.score).toBeGreaterThan(0.5);
  });

  it('returns null when there are no options', () => {
    expect(matchOption('anything', [])).toBeNull();
  });
});

describe('parseFreeReply', () => {
  it('separates EN: translation lines from the Portuguese text', () => {
    const parsed = parseFreeReply('Bom dia! O que deseja?\nEN: Good morning! What would you like?');
    expect(parsed.text).toBe('Bom dia! O que deseja?');
    expect(parsed.translation).toBe('Good morning! What would you like?');
    expect(parsed.done).toBe(false);
  });

  it('detects the [FIM] end marker and strips it', () => {
    const parsed = parseFreeReply('Até logo!\n[FIM]');
    expect(parsed.done).toBe(true);
    expect(parsed.text).toBe('Até logo!');
    expect(parsed.text).not.toContain('[FIM]');
  });

  it('leaves translation undefined when there are no EN: lines', () => {
    const parsed = parseFreeReply('Olá.');
    expect(parsed.translation).toBeUndefined();
  });

  it('aggregates multiple EN: lines', () => {
    const parsed = parseFreeReply('Linha um.\nEN: Line one.\nLinha dois.\nEN: Line two.');
    expect(parsed.translation).toBe('Line one. Line two.');
    expect(parsed.text).toBe('Linha um.\nLinha dois.');
  });
});

describe('findNode', () => {
  const nodes: RoleplayNode[] = [
    { id: 'n1', npc_text: 'Boa tarde', options: [] },
    { id: 'n2', npc_text: 'Adeus', options: [] },
  ];

  it('resolves a node by id', () => {
    expect(findNode(nodes, 'n2')?.npc_text).toBe('Adeus');
  });

  it('returns null for a broken ref', () => {
    expect(findNode(nodes, 'missing')).toBeNull();
  });
});

describe('buildFreeRoleplayPrompt', () => {
  const situation: Situation = {
    id: 's1',
    title: 'At the café',
    summary: 'Order a coffee.',
    tracks: [],
    level: 1,
    cefr: 'A2',
    phrase_patterns: [{ id: 'p1', base: 'Um café, por favor.' }],
    vocabulary: [{ word: 'café', translation: 'coffee' }],
    goals: ['order a coffee confidently'],
  };

  it('includes an EN: translation instruction at guided difficulty (<= 2)', () => {
    const prompt = buildFreeRoleplayPrompt(situation, 1);
    expect(prompt).toMatch(/EN:/);
    expect(prompt).toContain('At the café');
    expect(prompt).toContain('[FIM]');
  });

  it('forbids translation at higher difficulty (> 2)', () => {
    const prompt = buildFreeRoleplayPrompt(situation, 4);
    expect(prompt).toMatch(/Do not use English/);
  });
});
