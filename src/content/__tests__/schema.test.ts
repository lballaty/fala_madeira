// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/content/__tests__/schema.test.ts
// Description: Unit tests for the content model validators (src/content/schema.ts) — the
//   fatal-gate pure module behind scripts/validate-content.mjs and the Content Studio.
//   Covers validateSituation / validateContentPack / canonicalPackPayload: a valid baseline
//   plus each failure mode (bad level, bad voice_type, unresolved track/situation ref,
//   checksum-stability) and the multi-mode "practiceable" warning. Pure/deterministic — no
//   mocks needed (the module has no I/O by contract).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import {
  canonicalPackPayload,
  stableStringify,
  validateContentPack,
  validateSituation,
  type ContentPack,
  type Situation,
} from '../schema';

/** A minimal valid situation that feeds >= 2 practice modes (patterns + vocabulary). */
const validSituation = (overrides: Partial<Situation> = {}): Situation => ({
  id: 'sit-cafe',
  title: 'Ordering a coffee',
  summary: 'Order and pay for a coffee at a café counter.',
  tracks: ['track-survival'],
  level: 1,
  cefr: 'A2',
  phrase_patterns: [
    { id: 'pp-1', base: 'Um café, {size} por favor.', slots: [{ name: 'size', options: ['pequeno', 'grande'] }] },
  ],
  vocabulary: [{ word: 'café', translation: 'coffee' }],
  ...overrides,
});

/** A minimal valid pack: one track that references the one situation. */
const validPack = (overrides: Partial<ContentPack> = {}): ContentPack => ({
  id: 'pack-seed',
  name: 'Seed pack',
  version: '1.0.0',
  situations: [validSituation()],
  tracks: [{ id: 'track-survival', name: 'Survival', goal: 'Survive day one', situations: ['sit-cafe'] }],
  ...overrides,
});

describe('validateSituation', () => {
  it('accepts a well-formed situation with no errors or warnings', () => {
    const issues = validateSituation(validSituation());
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(issues.filter((i) => i.severity === 'warning')).toEqual([]);
  });

  it('flags a non-object', () => {
    const issues = validateSituation(null);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });

  it('errors on an out-of-range practical level (bad level)', () => {
    const issues = validateSituation(validSituation({ level: 9 as Situation['level'] }));
    const levelErr = issues.find((i) => i.path === 'situation.level');
    expect(levelErr?.severity).toBe('error');
    expect(levelErr?.message).toMatch(/not one of/);
  });

  it('errors on a bad CEFR value', () => {
    const issues = validateSituation(validSituation({ cefr: 'C2' as Situation['cefr'] }));
    expect(issues.some((i) => i.path === 'situation.cefr' && i.severity === 'error')).toBe(true);
  });

  it('errors on a bad dialogue voice_type', () => {
    const s = validSituation({
      dialogues: [
        {
          id: 'dlg-1',
          lines: [{ speaker: 'Empregado', voice_type: 'robot' as never, text: 'Bom dia!' }],
        },
      ],
    });
    const issues = validateSituation(s);
    const voiceErr = issues.find((i) => i.path.endsWith('lines[0].voice_type'));
    expect(voiceErr?.severity).toBe('error');
    expect(voiceErr?.message).toMatch(/not one of/);
  });

  it('warns when a situation feeds fewer than 2 practice modes', () => {
    const s = validSituation({ phrase_patterns: [], vocabulary: [{ word: 'sim', translation: 'yes' }] });
    const issues = validateSituation(s);
    expect(issues.some((i) => i.severity === 'warning' && /fewer than 2 practice modes/.test(i.message))).toBe(true);
  });

  it('warns when a slot is not referenced in the base phrase', () => {
    const s = validSituation({
      phrase_patterns: [{ id: 'pp-x', base: 'Olá.', slots: [{ name: 'ghost', options: ['a'] }] }],
    });
    const issues = validateSituation(s);
    expect(issues.some((i) => i.severity === 'warning' && /does not reference slot/.test(i.message))).toBe(true);
  });

  it('validates roleplay branch integrity (unresolved next / bad entry_node)', () => {
    const s = validSituation({
      roleplay: {
        scenario: 'At the counter',
        difficulty: 1,
        entry_node: 'missing-start',
        nodes: [{ id: 'n1', npc_text: 'Boa tarde', options: [{ text: 'Olá', next: 'nowhere' }] }],
      },
    });
    const issues = validateSituation(s);
    expect(issues.some((i) => /entry_node "missing-start" does not match/.test(i.message))).toBe(true);
    expect(issues.some((i) => /next "nowhere" does not match/.test(i.message))).toBe(true);
  });
});

describe('validateContentPack', () => {
  it('returns valid=true with no errors for a well-formed pack', () => {
    const result = validateContentPack(validPack());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('errors on a missing version', () => {
    const pack = validPack();
    delete (pack as Partial<ContentPack>).version;
    const result = validateContentPack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'pack.version')).toBe(true);
  });

  it('errors on an unresolved track -> situation ref', () => {
    const pack = validPack({
      tracks: [{ id: 'track-survival', name: 'Survival', goal: 'g', situations: ['sit-ghost'] }],
    });
    const result = validateContentPack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /situation ref "sit-ghost" not found/.test(e.message))).toBe(true);
  });

  it('errors on an unresolved situation -> track ref when the pack declares tracks', () => {
    const pack = validPack({
      situations: [validSituation({ tracks: ['track-ghost'] })],
    });
    const result = validateContentPack(pack);
    expect(result.errors.some((e) => /track ref "track-ghost" not found/.test(e.message))).toBe(true);
  });

  it('warns (not errors) on a situation track ref when the pack declares NO tracks', () => {
    const pack = validPack({ tracks: undefined });
    const result = validateContentPack(pack);
    // The track ref cannot resolve, but with no tracks in-pack it is a warning (cross-pack allowed).
    expect(result.errors.some((e) => /track ref/.test(e.message))).toBe(false);
    expect(result.warnings.some((w) => /track ref "track-survival" cannot be resolved/.test(w.message))).toBe(true);
  });

  it('errors on duplicate situation ids', () => {
    const pack = validPack({ situations: [validSituation(), validSituation()] });
    const result = validateContentPack(pack);
    expect(result.errors.some((e) => /duplicate situation id "sit-cafe"/.test(e.message))).toBe(true);
  });

  it('errors when situations is not an array', () => {
    const result = validateContentPack({ id: 'p', name: 'n', version: '1', situations: 'nope' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'pack.situations')).toBe(true);
  });
});

describe('canonicalPackPayload / stableStringify', () => {
  it('is stable regardless of object key order (checksum determinism)', () => {
    const a = validPack();
    const b: ContentPack = {
      // Same content, different literal key ordering.
      version: '1.0.0',
      situations: [validSituation()],
      name: 'Seed pack',
      id: 'pack-seed',
      tracks: a.tracks,
    };
    expect(canonicalPackPayload(a)).toBe(canonicalPackPayload(b));
  });

  it('excludes checksum and status so publish-state changes do not change the payload', () => {
    const base = validPack();
    const withMeta = validPack({ checksum: 'deadbeef', status: 'published' });
    expect(canonicalPackPayload(base)).toBe(canonicalPackPayload(withMeta));
  });

  it('changes when actual content changes', () => {
    const base = validPack();
    const changed = validPack({ situations: [validSituation({ title: 'Different title' })] });
    expect(canonicalPackPayload(base)).not.toBe(canonicalPackPayload(changed));
  });

  it('stableStringify sorts keys recursively and drops undefined', () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
    expect(stableStringify({ a: undefined, b: 2 })).toBe('{"b":2}');
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });
});
