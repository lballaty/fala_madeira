// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/itemKeys.ts
// Description: item_key convention for vocabulary mastery rows (mastery_items, docs/
//   CONTENT-ARCHITECTURE.md §6). CONVENTION (shared contract — the Coach's focus
//   suggestions and the content-enrichment step emit/parse the SAME keys, do not fork it):
//     item_key = `vocab:<situation_id>:<word>`
//   where <situation_id> is the Situation id from the content repository (never contains
//   ':') and <word> is VocabularyItem.word verbatim (may contain spaces/punctuation and,
//   in principle, ':'; parsing therefore splits on the FIRST ':' after the prefix only).
//   Also exposes countVocabularyDue — the due-badge number for this engine (see the
//   HUB BADGE SEAM note on it).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { isDue, type MasteryItem } from '../../../lib/srs';
import type { ReviewDimension } from '../../../content/schema';

export const VOCAB_ITEM_KEY_PREFIX = 'vocab:';

/**
 * The mastery dimensions this engine drives (§6): flip-cards grade 'retrieve' by
 * default; the audio-first card variant grades 'hear'. 'say' belongs to the
 * speaking/pronunciation engine and 'avoid' is behavioral (recordAvoidance) —
 * neither is graded here.
 */
export const VOCABULARY_DIMENSIONS: readonly ReviewDimension[] = ['retrieve', 'hear'];

/** Build the canonical mastery item_key for one vocabulary word of a situation. */
export const vocabItemKey = (situationId: string, word: string): string =>
  `${VOCAB_ITEM_KEY_PREFIX}${situationId}:${word}`;

export interface ParsedVocabItemKey {
  situationId: string;
  word: string;
}

/**
 * Parse a `vocab:<situation_id>:<word>` key. Returns null for non-vocab keys or
 * malformed ones (missing segments). The word segment is everything after the
 * second ':' so words containing ':' round-trip.
 */
export const parseVocabItemKey = (itemKey: string): ParsedVocabItemKey | null => {
  if (!itemKey.startsWith(VOCAB_ITEM_KEY_PREFIX)) return null;
  const rest = itemKey.slice(VOCAB_ITEM_KEY_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator === rest.length - 1) return null;
  return { situationId: rest.slice(0, separator), word: rest.slice(separator + 1) };
};

/** True when a mastery item_key belongs to this engine's vocabulary namespace. */
export const isVocabItemKey = (itemKey: string): boolean =>
  parseVocabItemKey(itemKey) !== null;

/**
 * HUB BADGE SEAM — the due count the Practice hub's Vocabulary tile should show
 * (mockup: "5 due" pill). The hub currently renders static tiles with no badge;
 * when the badge lands, the hub calls useDueItems({ supabase, user }) and passes
 * hook `items` (ALL mastery rows, uncapped) plus `new Date()` here. The in-mode
 * "due" line uses the same definition, so both surfaces always agree.
 */
export const countVocabularyDue = (items: MasteryItem[], now: Date): number =>
  items.filter(
    (item) =>
      isVocabItemKey(item.itemKey) &&
      VOCABULARY_DIMENSIONS.includes(item.dimension) &&
      isDue(item, now)
  ).length;
