// File: src/lib/__tests__/audit-utils.test.ts
// Description: EN-8 unit tests for the pure coverage core (src/lib/audit-utils.ts) shared by the
//   pre-gen generator and the coverage auditor. Locks: (1) the ROUND-TRIP INVARIANT — the set of
//   object names the generator would target for a level equals the auditor's expected set for that
//   level (both derived from the SAME clipsByLevel walk), so the two scripts can never silently
//   drift on hosting scope; (2) per-level dedupe + level splitting on synthetic packs; (3) the
//   diffCoverage set arithmetic (on_verpex/in_buffer/missing_everywhere/buffer_lag); (4) findOrphans;
//   (5) providerHits filtering tts_source rows to provider-tier events inside a key set (object and
//   JSON-string details). Pure — no network, no Supabase, no fs.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { describe, expect, it } from 'vitest';
import type { ContentPack, Situation } from '../../content/schema';
import { BUNDLED_PACKS } from '../../content/bundled';
import { buildKey, keyToServerPath } from '../audioKey';
import {
  clipsByLevel,
  clipsForOnboarding,
  clipsForCorpus,
  mergeTiers,
  expectedNamesByLevel,
  diffCoverage,
  findOrphans,
  providerHits,
} from '../audit-utils';
import { config } from '../../config';

// Minimal Situation carrying only the fields linesForSituation + the audit walk read.
const situation = (
  level: number,
  opts: { phrases?: string[]; vocab?: string[]; dialogue?: Array<[string, string?]> } = {},
): Situation =>
  ({
    level,
    dialogues: opts.dialogue
      ? [{ lines: opts.dialogue.map(([text, voice_type]) => ({ text, voice_type })) }]
      : [],
    phrase_patterns: (opts.phrases ?? []).map((base) => ({ base, variants: [] })),
    vocabulary: (opts.vocab ?? []).map((word) => ({ word })),
  }) as unknown as Situation;

const pack = (situations: Situation[]): ContentPack => ({ situations }) as unknown as ContentPack;

describe('audit-utils — clipsByLevel / expectedNamesByLevel (single source of truth)', () => {
  it('ROUND-TRIP INVARIANT: expectedNamesByLevel(level) === names of clipsByLevel(level), for every bundled level', () => {
    const clips = clipsByLevel(BUNDLED_PACKS);
    const names = expectedNamesByLevel(BUNDLED_PACKS);
    // Same levels present on both sides.
    expect([...names.keys()].sort()).toEqual([...clips.keys()].sort());
    for (const [lvl, clipList] of clips) {
      const derived = new Set(clipList.map((c) => c.name));
      expect(names.get(lvl)).toEqual(derived);
    }
  });

  it('level 0 is non-empty (guards an accidental empty scope that would make coverage vacuously pass)', () => {
    const l0 = expectedNamesByLevel(BUNDLED_PACKS).get(0);
    expect(l0 && l0.size).toBeGreaterThan(0);
  });

  it('dedupes per level by object name and splits by situation level (synthetic packs)', () => {
    // Two situations at level 0 share the phrase "olá" → one clip; "adeus" is distinct. Level 1 is
    // its own bucket. A repeated word within a situation also collapses to one clip.
    const packs = [
      pack([
        situation(0, { phrases: ['olá', 'adeus', 'olá'] }),
        situation(0, { vocab: ['olá'] }), // same text+default voice → same name → deduped
        situation(1, { phrases: ['bom dia'] }),
      ]),
    ];
    const clips = clipsByLevel(packs);
    const l0 = clips.get(0)!;
    const l0names = new Set(l0.map((c) => c.name));
    expect(l0names.size).toBe(2); // olá, adeus (all default voice)
    expect(clips.get(1)!.length).toBe(1); // bom dia
    // Derived expected set matches.
    expect(expectedNamesByLevel(packs).get(0)).toEqual(l0names);
  });

  it('each clip carries the client-identical key + server name', () => {
    const clips = clipsByLevel([pack([situation(0, { phrases: ['água'] })])]);
    const clip = clips.get(0)![0];
    expect(clip.text).toBe('água');
    expect(clip.key).toBe(buildKey('default', 'teacher', 'água')); // default vocab → teacher voice
    expect(clip.name).toBe(keyToServerPath(clip.key));
  });
});

describe('audit-utils — clipsForOnboarding / clipsForCorpus (EN-34 corpus selection)', () => {
  it('onboarding corpus is non-empty, deduped, and keyed identically to every other tier', () => {
    const clips = clipsForOnboarding();
    expect(clips.length).toBeGreaterThan(0);
    const names = new Set(clips.map((c) => c.name));
    expect(names.size).toBe(clips.length); // deduped by object name
    // seeded with the actual first-win greeting the onboarding flow speaks, at the default voice
    const firstWin = clips.find((c) => c.text === config.onboarding.firstWinPhrase);
    expect(firstWin).toBeDefined();
    expect(firstWin!.key).toBe(buildKey('default', 'teacher', config.onboarding.firstWinPhrase));
    expect(firstWin!.name).toBe(keyToServerPath(firstWin!.key));
  });

  it("clipsForCorpus('onboarding') === clipsForOnboarding()", () => {
    expect(clipsForCorpus(BUNDLED_PACKS, 'onboarding')).toEqual(clipsForOnboarding());
  });

  it("clipsForCorpus('level:<n>') selects that level; empty falls back to fallbackLevel", () => {
    const packs = [pack([situation(0, { phrases: ['olá'] }), situation(1, { phrases: ['bom dia'] })])];
    expect(clipsForCorpus(packs, 'level:1').map((c) => c.text)).toEqual(['bom dia']);
    expect(clipsForCorpus(packs, '', 0).map((c) => c.text)).toEqual(['olá']); // fallback to level 0
  });

  it("clipsForCorpus('all') flattens every level, deduped globally by object name", () => {
    // 'olá' at level 0 and level 1 share the same default-voice object name → one clip in 'all'.
    const packs = [pack([situation(0, { phrases: ['olá', 'adeus'] }), situation(1, { phrases: ['olá'] })])];
    const all = clipsForCorpus(packs, 'all');
    const names = all.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length); // no duplicate object names across levels
    expect(all.map((c) => c.text).sort()).toEqual(['adeus', 'olá']);
  });

  it('throws on an unknown corpus spec (a typo must never silently host the wrong set)', () => {
    expect(() => clipsForCorpus(BUNDLED_PACKS, 'levl:0')).toThrow(/unknown --corpus/);
  });
});

describe('audit-utils — mergeTiers (EN-34 hosted-manifest tiers)', () => {
  it('adds a store label, dedupes, and stable-sorts; tolerates null/empty', () => {
    expect(mergeTiers(null, 'bucket')).toEqual(['bucket']);
    expect(mergeTiers([], 'bucket')).toEqual(['bucket']);
    expect(mergeTiers(['bucket'], 'bucket')).toEqual(['bucket']); // idempotent
    expect(mergeTiers(['verpex'], 'bucket')).toEqual(['bucket', 'verpex']); // sorted
    expect(mergeTiers(['verpex', 'bucket'], 'verpex')).toEqual(['bucket', 'verpex']);
  });
});

describe('audit-utils — diffCoverage', () => {
  const S = (...xs: string[]) => new Set(xs);

  it('counts on_verpex / in_buffer / missing_everywhere / buffer_lag correctly', () => {
    const expected = S('a.pcm', 'b.pcm', 'c.pcm', 'd.pcm');
    const onVerpex = S('a.pcm'); // a: hosted
    const inBuffer = S('a.pcm', 'b.pcm'); // a: also buffered; b: buffered-but-not-hosted (lag)
    // c, d: missing everywhere.
    expect(diffCoverage({ expected, onVerpex, inBuffer })).toEqual({
      expected: 4,
      on_verpex: 1,
      in_buffer: 2,
      missing_everywhere: 2,
      buffer_lag: 1,
    });
  });

  it('fully-hosted level → 0 missing, 0 lag', () => {
    const expected = S('x.pcm', 'y.pcm');
    expect(diffCoverage({ expected, onVerpex: S('x.pcm', 'y.pcm'), inBuffer: S() })).toEqual({
      expected: 2,
      on_verpex: 2,
      in_buffer: 0,
      missing_everywhere: 0,
      buffer_lag: 0,
    });
  });
});

describe('audit-utils — findOrphans', () => {
  const S = (...xs: string[]) => new Set(xs);
  it('returns names present (buffer or verpex) but not expected', () => {
    const orphans = findOrphans({
      expected: S('a.pcm'),
      onVerpex: S('a.pcm', 'z.pcm'),
      inBuffer: S('a.pcm', 'q.pcm'),
    });
    expect(new Set(orphans)).toEqual(S('z.pcm', 'q.pcm'));
  });
  it('no orphans when everything present is expected', () => {
    expect(findOrphans({ expected: S('a.pcm', 'b.pcm'), onVerpex: S('a.pcm'), inBuffer: S('b.pcm') })).toEqual([]);
  });
});

describe('audit-utils — providerHits', () => {
  const keyFor = (text: string) => buildKey('default', 'teacher', text);
  const nameFor = (text: string) => keyToServerPath(keyFor(text));

  it('keeps ONLY provider-tier rows whose clip is in the expected name set', () => {
    const inScope = keyFor('água');
    const outOfScope = keyFor('fora');
    const expectedNames = new Set([nameFor('água')]);
    const rows = [
      { details: { tier: 'provider', key: inScope } }, // KEEP
      { details: { tier: 'verpex', key: inScope } }, // drop: not provider-tier
      { details: { tier: 'provider', key: outOfScope } }, // drop: not in scope
      { details: JSON.stringify({ tier: 'provider', key: inScope }) }, // KEEP: details as JSON string
      { details: { tier: 'provider' } }, // drop: no key
    ];
    const hits = providerHits(rows, expectedNames);
    expect(hits.length).toBe(2);
    expect(hits).toContain(rows[0]);
    expect(hits).toContain(rows[3]);
  });

  it('handles null/empty input and malformed JSON details without throwing', () => {
    expect(providerHits(null, new Set(['a.pcm']))).toEqual([]);
    expect(providerHits([{ details: '{not json' }], new Set(['a.pcm']))).toEqual([]);
  });
});
