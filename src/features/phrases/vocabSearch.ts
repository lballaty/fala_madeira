// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/phrases/vocabSearch.ts
// Description: Inventory-first vocabulary lookup (tracker EN-10). Builds a bidirectional,
//   diacritic-insensitive, fuzzy-tolerant search index from the inventoried
//   {word (PT), translation (EN)} pairs across bundled/loaded content Situations. A query in
//   EITHER language matches against the PT word OR the EN translation and returns the other
//   side (+ example/context when available). Matching normalizes both query and keys
//   (lowercase, NFD diacritic strip, whitespace collapse — reuses ./search.ts) and tries, in
//   order: normalized-exact, then a BOUNDED Levenshtein fuzzy fallback (per-length distance
//   threshold) so "cafe" finds "café" and small typos still resolve. Results are ranked
//   (exact before fuzzy, closer edit-distance first). The core (buildVocabIndex /
//   searchVocabInventory) is PURE and deterministic — no React, no network — so it unit-tests
//   cleanly; lookupVocabInventory is a thin async wrapper that lazily builds and memoizes the
//   index from contentRepository (offline-capable: bundled content is enough). Callers use the
//   inventory FIRST and fall back to the AI translate path only on a MISS.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import type { VocabResult } from '../../types';
import { contentRepository, type Situation } from '../../content';
import { normalizeForSearch } from './search';

/** Which direction an inventory hit resolved: query language → returned language. */
export type VocabMatchDirection = 'pt->en' | 'en->pt';

/** One inventoried vocabulary pair, pre-normalized for search. */
export interface VocabIndexEntry {
  /** European Portuguese word/phrase. */
  pt: string;
  /** English translation. */
  en: string;
  pronunciation?: string;
  /** Author when-to-use note, carried through as extra context. */
  note?: string;
  /** Situation the pair came from — used to build a usage example. */
  situationTitle: string;
  /** Pre-normalized PT key (matched when the query is Portuguese). */
  ptKey: string;
  /** Pre-normalized EN key (matched when the query is English). */
  enKey: string;
}

/** A ranked inventory hit: the matched pair, the resolved direction, and its rank score. */
export interface VocabMatch {
  entry: VocabIndexEntry;
  direction: VocabMatchDirection;
  /** true when the query matched a key exactly (after normalization). */
  exact: boolean;
  /** Levenshtein distance between the normalized query and the matched key (0 = exact). */
  distance: number;
}

/**
 * Bounded Levenshtein edit distance. Returns early with `max + 1` once the best
 * possible remaining cost provably exceeds `max`, so cost stays O(len * max) for
 * the small strings in the vocab set. `max` caps the work AND the acceptance
 * threshold used by the fuzzy fallback.
 */
export const boundedLevenshtein = (a: string, b: string, max: number): number => {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl <= max ? bl : max + 1;
  if (bl === 0) return al <= max ? al : max + 1;

  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      const v = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Whole row already exceeds the budget — no path can come back under it.
    if (rowMin > max) return max + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl] <= max ? prev[bl] : max + 1;
};

/**
 * Fuzzy distance budget for a normalized key of the given length. Short words
 * tolerate no typos (else "cha" would match "che", "cho", …); medium words 1;
 * longer words 2. Exact-after-normalization always wins before this applies.
 */
export const fuzzyThresholdForLength = (len: number): number => {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
};

/**
 * Build a pure, searchable inventory index from Situations' vocabulary. Keys are
 * pre-normalized once (accent/case-folded) so search is a cheap normalized
 * compare + bounded fuzzy pass. Deterministic: entries follow situation order,
 * vocabulary order within a situation; blank-key rows are skipped.
 */
export const buildVocabIndex = (situations: Situation[]): VocabIndexEntry[] => {
  const entries: VocabIndexEntry[] = [];
  for (const situation of situations) {
    for (const item of situation.vocabulary ?? []) {
      const ptKey = normalizeForSearch(item.word ?? '');
      const enKey = normalizeForSearch(item.translation ?? '');
      if (!ptKey && !enKey) continue; // nothing searchable
      entries.push({
        pt: item.word,
        en: item.translation,
        pronunciation: item.pronunciation,
        note: item.note,
        situationTitle: situation.title,
        ptKey,
        enKey,
      });
    }
  }
  return entries;
};

/**
 * Search the inventory in BOTH directions. A hit against the PT key resolves
 * `pt->en` (query was Portuguese → return the English); a hit against the EN key
 * resolves `en->pt`. Tries normalized-exact first across the whole index, and
 * only if there is no exact hit falls back to the bounded fuzzy pass. Results are
 * de-duplicated per (pt,en,direction) pair and ranked: exact first, then by edit
 * distance, then by shorter key (prefers the tighter match), then stable order.
 * An empty/whitespace query or a total miss returns `[]` — the caller then falls
 * back to the AI translate path.
 */
export const searchVocabInventory = (index: VocabIndexEntry[], rawQuery: string): VocabMatch[] => {
  const q = normalizeForSearch(rawQuery);
  if (!q) return [];

  const exact: VocabMatch[] = [];
  for (const entry of index) {
    if (entry.ptKey && entry.ptKey === q) exact.push({ entry, direction: 'pt->en', exact: true, distance: 0 });
    if (entry.enKey && entry.enKey === q) exact.push({ entry, direction: 'en->pt', exact: true, distance: 0 });
  }
  const chosen = exact.length > 0 ? exact : fuzzyMatches(index, q);
  return rankAndDedupe(chosen);
};

/** Bounded fuzzy pass over both keys; each side keeps its best (smallest) distance. */
const fuzzyMatches = (index: VocabIndexEntry[], q: string): VocabMatch[] => {
  const matches: VocabMatch[] = [];
  for (const entry of index) {
    if (entry.ptKey) {
      const max = fuzzyThresholdForLength(entry.ptKey.length);
      if (max > 0) {
        const d = boundedLevenshtein(q, entry.ptKey, max);
        if (d <= max) matches.push({ entry, direction: 'pt->en', exact: false, distance: d });
      }
    }
    if (entry.enKey) {
      const max = fuzzyThresholdForLength(entry.enKey.length);
      if (max > 0) {
        const d = boundedLevenshtein(q, entry.enKey, max);
        if (d <= max) matches.push({ entry, direction: 'en->pt', exact: false, distance: d });
      }
    }
  }
  return matches;
};

const keyFor = (m: VocabMatch): string => `${m.entry.pt}\0${m.entry.en}\0${m.direction}`;

const rankAndDedupe = (matches: VocabMatch[]): VocabMatch[] => {
  // Keep the best (smallest-distance) match per (pt,en,direction) triple.
  const best = new Map<string, VocabMatch>();
  for (const m of matches) {
    const k = keyFor(m);
    const prior = best.get(k);
    if (!prior || m.distance < prior.distance) best.set(k, m);
  }
  return [...best.values()].sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    const ak = a.direction === 'pt->en' ? a.entry.ptKey : a.entry.enKey;
    const bk = b.direction === 'pt->en' ? b.entry.ptKey : b.entry.enKey;
    return ak.length - bk.length;
  });
};

/**
 * Shape an inventory match into the VocabResult the modal renders, mirroring the
 * AI-fallback contract: PT text in `example_pt`, its English in `example_en`,
 * `translation` = the resolved translation for the *query's* direction.
 */
export const matchToResult = (match: VocabMatch): VocabResult => {
  const { entry, direction } = match;
  const translation = direction === 'pt->en' ? entry.en : entry.pt;
  const explanationParts: string[] = [];
  if (entry.pronunciation) explanationParts.push(`Pronunciation: ${entry.pronunciation}`);
  if (entry.note) explanationParts.push(entry.note);
  explanationParts.push(`From the curriculum: ${entry.situationTitle}.`);
  return {
    translation,
    explanation: explanationParts.join(' '),
    example_pt: entry.pt,
    example_en: entry.en,
  };
};

// ---------------------------------------------------------------------------
// Thin async wrapper: lazily build + memoize the index from loaded content.
// ---------------------------------------------------------------------------

let indexPromise: Promise<VocabIndexEntry[]> | null = null;

/** Build (once) and memoize the inventory index from the content repository. */
const getIndex = (): Promise<VocabIndexEntry[]> => {
  if (!indexPromise) {
    indexPromise = contentRepository
      .listSituations()
      .then((situations) => buildVocabIndex(situations));
  }
  return indexPromise;
};

/**
 * Inventory-first lookup used by the vocab modal. Returns the top inventory
 * `VocabResult` when the query resolves in either direction, or `null` on a miss
 * (the caller then falls back to the AI translate path). Offline-capable — the
 * index is built from bundled/cached content.
 */
export const lookupVocabInventory = async (rawQuery: string): Promise<VocabResult | null> => {
  const index = await getIndex();
  const matches = searchVocabInventory(index, rawQuery);
  return matches.length > 0 ? matchToResult(matches[0]) : null;
};

/** Test-only: drop the memoized index so a fresh build picks up new content. */
export const __resetVocabIndexForTests = (): void => {
  indexPromise = null;
};
