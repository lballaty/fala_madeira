// File: /Users/liborballaty/.../src/features/practice/missions/__tests__/prepSheet.test.ts
// Description: Unit tests for the pure Missions prep-sheet builder (missions/prepSheet.ts):
//   renderPatternExample (slot -> first option) and buildPrepSheet's authored vs self-made
//   degradation paths + the per-section caps. The module imports only content schema types
//   (no I/O), so no mocks are needed.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import type { PhrasePattern, Situation } from '../../../../content/schema';
import { buildPrepSheet, missionsConfig, renderPatternExample } from '../prepSheet';

const situation = (o: Partial<Situation> & Pick<Situation, 'id'>): Situation => ({
  title: `Title ${o.id}`,
  summary: 'Summary',
  tracks: [],
  level: 1,
  cefr: 'A2',
  phrase_patterns: [],
  vocabulary: [],
  ...o,
});

describe('renderPatternExample', () => {
  it('replaces each {slot} with its first option', () => {
    const pattern: PhrasePattern = {
      id: 'p',
      base: 'A limpeza é {when} de {day}.',
      slots: [
        { name: 'when', options: ['hoje'] },
        { name: 'day', options: ['manhã'] },
      ],
    };
    expect(renderPatternExample(pattern)).toBe('A limpeza é hoje de manhã.');
  });

  it('leaves a bare base untouched', () => {
    expect(renderPatternExample({ id: 'p', base: 'Bom dia.' })).toBe('Bom dia.');
  });
});

describe('buildPrepSheet', () => {
  it('uses authored mission data when present', () => {
    const s = situation({
      id: 's-auth',
      mission: {
        title: 'Call the plumber',
        prep: ['Explique o problema'],
        fallback_phrases: ['Pode repetir?'],
        likely_responses: ['Vou já para aí.'],
      },
    });
    const sheet = buildPrepSheet(s);
    expect(sheet.kind).toBe('authored');
    expect(sheet.title).toBe('Call the plumber');
    expect(sheet.prep).toEqual([{ text: 'Explique o problema' }]);
    expect(sheet.vocabulary).toEqual([]);
  });

  it('degrades to a self-made sheet from patterns/vocab/dialogues with caps + universal fallbacks', () => {
    const s = situation({
      id: 's-self',
      phrase_patterns: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, base: `Frase ${i}.` })),
      vocabulary: Array.from({ length: 6 }, (_, i) => ({ word: `w${i}`, translation: `t${i}` })),
      dialogues: [
        {
          id: 'd',
          lines: [
            { speaker: 'A', voice_type: 'local', text: 'Linha 1' },
            { speaker: 'A', voice_type: 'local', text: 'Linha 2' },
            { speaker: 'A', voice_type: 'local', text: 'Linha 3' },
          ],
        },
      ],
    });
    const sheet = buildPrepSheet(s);
    expect(sheet.kind).toBe('self_made');
    expect(sheet.prep).toHaveLength(missionsConfig.selfMadePrepPhraseMax);
    expect(sheet.vocabulary).toHaveLength(missionsConfig.selfMadeVocabMax);
    expect(sheet.likelyResponses).toHaveLength(missionsConfig.selfMadeLikelyResponseMax);
    expect(sheet.fallbacks.length).toBeGreaterThan(0); // universal escape hatches
  });
});
