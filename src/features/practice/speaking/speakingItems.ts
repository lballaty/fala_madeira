// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/speakingItems.ts
// Description: Content selection for the Speaking Coach engine (docs/CONTENT-ARCHITECTURE.md
//   §3: Speaking Coach consumes phrase_patterns + dialogues; vocabulary supports). Flattens a
//   Situation into a speakable drill queue (SpeakingItem[]): pattern bases with slots resolved
//   to their first option, ready-made variants, dialogue lines when present (seed dialogues
//   are EMPTY until enrichment — handled as a normal empty case), and a capped tail of
//   vocabulary items. Loads via the content repository only (content is data — never
//   hardcoded phrases in components). item `key` follows the mastery_items convention:
//   it points at content (pattern id, vocab word, dialogue id).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { contentRepository, Situation } from '../../../content';
import { logger } from '../../../lib/logger';
import { speakingConfig } from './speakingConfig';

export interface SpeakingItem {
  /** Content pointer (pronunciation_attempts.item_key / mastery_items.item_key convention). */
  key: string;
  /** The European-Portuguese target the learner says. */
  text: string;
  translation?: string;
  /** Optional pronunciation hint (vocabulary items carry these). */
  pronunciation?: string;
  source: 'pattern' | 'pattern-variant' | 'dialogue' | 'vocabulary';
}

export interface SpeakingContent {
  /** Situation the queue was built from (null only when no content exists at all). */
  situation: Situation | null;
  items: SpeakingItem[];
  /** Set when the requested situation could not serve this engine and a default stood in. */
  fallbackNote: string | null;
}

/** Resolve `{slot}` markers in a pattern base to each slot's first option (deterministic). */
const resolveSlots = (base: string, slots: { name: string; options: string[] }[] | undefined): string => {
  if (!slots) return base;
  return slots.reduce(
    (text, slot) => (slot.options.length > 0 ? text.split(`{${slot.name}}`).join(slot.options[0]) : text),
    base
  );
};

/** Flatten one Situation into the ordered drill queue. Pure given the situation. */
export const buildSpeakingItems = (situation: Situation): SpeakingItem[] => {
  const items: SpeakingItem[] = [];

  for (const pattern of situation.phrase_patterns) {
    items.push({
      key: pattern.id,
      text: resolveSlots(pattern.base, pattern.slots),
      translation: pattern.translation,
      source: 'pattern',
    });
    for (const variant of (pattern.variants ?? []).slice(0, speakingConfig.maxVariantsPerPattern)) {
      items.push({
        key: pattern.id,
        text: variant.text,
        translation: variant.translation,
        source: 'pattern-variant',
      });
    }
  }

  // Dialogues are empty in the seed pack (populated by the content-enrichment step);
  // when they exist their lines are prime shadowing material.
  for (const dialogue of situation.dialogues ?? []) {
    for (const line of dialogue.lines) {
      items.push({
        key: dialogue.id,
        text: line.text,
        translation: line.translation,
        source: 'dialogue',
      });
    }
  }

  for (const vocab of situation.vocabulary.slice(0, speakingConfig.maxVocabularyItems)) {
    items.push({
      key: vocab.word,
      text: vocab.word,
      translation: vocab.translation,
      pronunciation: vocab.pronunciation,
      source: 'vocabulary',
    });
  }

  return items;
};

/**
 * Load the drill queue for a situation id, or the engine's own default when the
 * hub routed in with none (PracticeModeProps.situationId === null): the first
 * situation in the repository that actually feeds this engine. Situations are
 * never prerequisite-gated (§5/§12) — a fallback is a data condition, not a lock.
 */
export const loadSpeakingContent = async (situationId: string | null): Promise<SpeakingContent> => {
  let fallbackNote: string | null = null;

  if (situationId) {
    const requested = await contentRepository.getSituation(situationId);
    if (requested) {
      const items = buildSpeakingItems(requested);
      if (items.length > 0) return { situation: requested, items, fallbackNote: null };
      fallbackNote = `"${requested.title}" has no speakable phrases yet — practicing a default situation instead.`;
    } else {
      logger.warn('SPEAKING_SITUATION_MISSING', `speaking mode opened with unknown situation id "${situationId}"`, {
        category: 'DATA_PROCESSING',
        details: { situationId },
      });
      fallbackNote = 'That situation could not be loaded — practicing a default situation instead.';
    }
  }

  for (const situation of await contentRepository.listSituations()) {
    const items = buildSpeakingItems(situation);
    if (items.length > 0) return { situation, items, fallbackNote };
  }

  logger.warn('SPEAKING_NO_CONTENT', 'no situation in the content repository feeds the speaking engine', {
    category: 'DATA_PROCESSING',
  });
  return { situation: null, items: [], fallbackNote };
};
