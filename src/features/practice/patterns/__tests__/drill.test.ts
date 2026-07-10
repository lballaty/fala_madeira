// File: /Users/liborballaty/.../src/features/practice/patterns/__tests__/drill.test.ts
// Description: Unit tests for the pure Pattern-Builder drill composition (patterns/drill.ts):
//   parseBaseSegments, referencedSlotNames, isSlottedPattern (dynamic slotted vs bare
//   detection), drillableSlots, defaultSelections, slotValue, assemblePhrase, and composeDrill.
//   drill.ts transitively imports src/lib/logger (which imports supabase), so the logger is
//   mocked at the module boundary to keep the test hermetic (no network/DB).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it, vi } from 'vitest';

// Hermetic boundary: drill.ts imports { logger } from '../../../lib/logger', which pulls in
// supabase. Stub it so importing drill.ts never touches the network/DB.
vi.mock('../../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { PhrasePattern } from '../../../../content';
import {
  assemblePhrase,
  composeDrill,
  defaultSelections,
  drillableSlots,
  isSlottedPattern,
  parseBaseSegments,
  referencedSlotNames,
  slotValue,
} from '../drill';

const slotted: PhrasePattern = {
  id: 'p1',
  base: 'A limpeza é {when}.',
  slots: [{ name: 'when', options: ['hoje', 'amanhã', 'sexta'] }],
};

const bare: PhrasePattern = { id: 'p2', base: 'Bom dia.' };

describe('parseBaseSegments', () => {
  it('splits text and {slot} markers in order', () => {
    expect(parseBaseSegments('A limpeza é {when}.')).toEqual([
      { kind: 'text', text: 'A limpeza é ' },
      { kind: 'slot', name: 'when' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('returns a single text segment for a bare base', () => {
    expect(parseBaseSegments('Bom dia.')).toEqual([{ kind: 'text', text: 'Bom dia.' }]);
  });
});

describe('referencedSlotNames', () => {
  it('collects the slot names referenced by the base', () => {
    expect(referencedSlotNames('Vou {a} e {b}.')).toEqual(new Set(['a', 'b']));
  });
});

describe('isSlottedPattern', () => {
  it('is true when a slot with options is wired into the base', () => {
    expect(isSlottedPattern(slotted)).toBe(true);
  });

  it('is false for a bare pattern with no slots', () => {
    expect(isSlottedPattern(bare)).toBe(false);
  });

  it('degrades to false when a slot marker has no options', () => {
    const half: PhrasePattern = { id: 'p', base: 'A {x} é boa.', slots: [{ name: 'x', options: [] }] };
    expect(isSlottedPattern(half)).toBe(false);
  });

  it('degrades to false when an options-bearing slot is not referenced in the base', () => {
    const orphan: PhrasePattern = {
      id: 'p',
      base: 'A {x} é boa.',
      slots: [
        { name: 'x', options: ['coisa'] },
        { name: 'ghost', options: ['a'] },
      ],
    };
    expect(isSlottedPattern(orphan)).toBe(false);
  });
});

describe('drillableSlots / defaultSelections / slotValue', () => {
  it('returns only referenced slots with options', () => {
    expect(drillableSlots(slotted).map((s) => s.name)).toEqual(['when']);
  });

  it('defaults every drillable slot to its first option (index 0)', () => {
    expect(defaultSelections(slotted)).toEqual({ when: 0 });
  });

  it('slotValue returns the selected option, or the marker for an unknown slot', () => {
    expect(slotValue(slotted, 'when', { when: 1 })).toBe('amanhã');
    expect(slotValue(slotted, 'when', {})).toBe('hoje'); // unselected -> first option
    expect(slotValue(slotted, 'missing', {})).toBe('{missing}');
  });
});

describe('assemblePhrase', () => {
  it('substitutes selected chip values into the base', () => {
    expect(assemblePhrase(slotted, { when: 2 })).toBe('A limpeza é sexta.');
  });

  it('uses first-option defaults when unselected', () => {
    expect(assemblePhrase(slotted, {})).toBe('A limpeza é hoje.');
  });
});

describe('composeDrill', () => {
  it('preserves authored order when shuffle is off, dropping empty bases', () => {
    const patterns: PhrasePattern[] = [slotted, { id: 'empty', base: '   ' }, bare];
    const out = composeDrill(patterns, false);
    expect(out.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('returns the same multiset when shuffled (deterministic membership)', () => {
    const patterns: PhrasePattern[] = [slotted, bare];
    const out = composeDrill(patterns, true);
    expect(new Set(out.map((p) => p.id))).toEqual(new Set(['p1', 'p2']));
    expect(out).toHaveLength(2);
  });
});
