// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/phrases/library.ts
// Description: Pure aggregation layer for the Phrase Library (CONTENT-ARCHITECTURE §3 E10).
//   Flattens vocabulary items + phrase patterns (base + register variants) across ALL loaded
//   Situations (src/content repository) into flat PhraseEntry rows carrying PT text, EN
//   translation, pronunciation, register, when-to-use notes, and provenance (which situation
//   the entry comes from). Search haystacks are pre-normalized at build time (./search.ts) so
//   live filtering is a cheap substring pass. Register when-to-use lines come from
//   docs/CONTENT-STANDARDS.md §3 (tu / você / o senhor guidance). Deterministic, offline —
//   works entirely from cached/bundled content.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import type { PhrasePattern, PracticalLevel, Register, Situation } from '../../content';
import { normalizeForSearch } from './search';

/** Where a library entry came from inside its Situation. */
export type PhraseEntryKind = 'vocabulary' | 'pattern' | 'variant';

/** One flat, searchable row in the Phrase Library. */
export interface PhraseEntry {
  /** Stable id: situationId + kind + source position (list keys, audio busy state). */
  id: string;
  /** European Portuguese text (patterns render with each slot's first option filled in). */
  pt: string;
  /** English translation; may be empty for patterns authored without one. */
  en: string;
  pronunciation?: string;
  register?: Register;
  /** Author's when-to-use note (VocabularyItem.note / PatternVariant.note). */
  note?: string;
  kind: PhraseEntryKind;
  level: PracticalLevel;
  /** Track ids the source situation serves (m:n) — powers the track filter. */
  tracks: string[];
  situationId: string;
  situationTitle: string;
  /** Pre-normalized search haystack (pt + en + pronunciation + note + situation title). */
  haystack: string;
}

/**
 * Register → when-to-use guidance, taken from docs/CONTENT-STANDARDS.md §3
 * ("Register: tu / você / o senhor"). Shown when an entry carries an explicit
 * register but no author note — the register field IS the when-to-use signal.
 */
export const REGISTER_WHEN_TO_USE: Record<Register, string> = {
  informal: 'Informal (tu) — friends, peers, younger people, casual neighborhood contexts.',
  neutral: 'Neutral — safe in most everyday situations.',
  formal:
    'Formal — strangers, officials, service situations: use "o senhor / a senhora" or the verb without a pronoun.',
};

/** The when-to-use line for an entry: author note first, register guidance as fallback. */
export const whenToUse = (entry: Pick<PhraseEntry, 'note' | 'register'>): string | null =>
  entry.note ?? (entry.register ? REGISTER_WHEN_TO_USE[entry.register] : null);

/**
 * Render a pattern base as a readable phrase: each `{slot}` marker is replaced
 * with the slot's first substitution option (the canonical example the Pattern
 * Builder drills first). Unknown markers are left as-is so authoring gaps stay
 * visible instead of silently disappearing.
 */
export const renderPatternBase = (pattern: PhrasePattern): string => {
  let text = pattern.base;
  for (const slot of pattern.slots ?? []) {
    const first = slot.options[0];
    if (first !== undefined) text = text.split(`{${slot.name}}`).join(first);
  }
  return text;
};

const buildHaystack = (parts: Array<string | undefined>): string =>
  normalizeForSearch(parts.filter(Boolean).join(' '));

/**
 * Flatten situations into library entries. Order is stable: situations in
 * repository order, vocabulary before patterns, variants right after their
 * base pattern — so the list never jumps around between renders/refreshes.
 */
export const buildPhraseLibrary = (situations: Situation[]): PhraseEntry[] => {
  const entries: PhraseEntry[] = [];

  for (const situation of situations) {
    const common = {
      level: situation.level,
      tracks: situation.tracks,
      situationId: situation.id,
      situationTitle: situation.title,
    };

    situation.vocabulary.forEach((item, i) => {
      entries.push({
        ...common,
        id: `${situation.id}:vocab:${i}`,
        pt: item.word,
        en: item.translation,
        pronunciation: item.pronunciation,
        register: item.register,
        note: item.note,
        kind: 'vocabulary',
        haystack: buildHaystack([item.word, item.translation, item.pronunciation, item.note, situation.title]),
      });
    });

    for (const pattern of situation.phrase_patterns) {
      const basePt = renderPatternBase(pattern);
      entries.push({
        ...common,
        id: `${situation.id}:pattern:${pattern.id}`,
        pt: basePt,
        en: pattern.translation ?? '',
        kind: 'pattern',
        haystack: buildHaystack([basePt, pattern.translation, situation.title]),
      });
      (pattern.variants ?? []).forEach((variant, i) => {
        entries.push({
          ...common,
          id: `${situation.id}:variant:${pattern.id}:${i}`,
          pt: variant.text,
          // A variant without its own translation means the base one: same phrase, different register.
          en: variant.translation ?? pattern.translation ?? '',
          register: variant.register,
          note: variant.note,
          kind: 'variant',
          haystack: buildHaystack([variant.text, variant.translation ?? pattern.translation, variant.note, situation.title]),
        });
      });
    }
  }

  return entries;
};
