// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/missions/prepSheet.ts
// Description: Prep-sheet builder for the Real-World Missions engine. Authored path: the
//   situation carries `mission` data (title, prep, fallback_phrases, likely_responses —
//   src/content/schema.ts Mission) and maps straight onto the prep screen. Degraded path
//   (DATA REALITY: situation.mission is empty in the seed until enrichment fills it): builds
//   a lightweight "self-made mission" prep sheet from the situation's REAL phrase_patterns
//   (slots rendered with their first option) and vocabulary, plus universal fallback phrases,
//   with likely responses sampled from the situation's dialogues when present.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import type { PhrasePattern, Situation } from '../../../content/schema';

// Missions-slice tunables. NOTE: these belong in src/config.ts (AGENTS.md §3 "config, not
// magic values") but that file is under an active write claim by the parallel
// srs-adaptive-engine step — migrate this block into config.ts once that claim is released.
export const missionsConfig = {
  /** Max phrase-pattern phrases on a self-made prep sheet. */
  selfMadePrepPhraseMax: 3,
  /** Max vocabulary items on a self-made prep sheet. */
  selfMadeVocabMax: 4,
  /** Max dialogue lines sampled as "what they'll likely say" on a self-made sheet. */
  selfMadeLikelyResponseMax: 2,
  /** Debounce between prep-audio plays (matches useSpeechPlayback's guard). */
  playDebounceMs: 300,
} as const;

/** One line on the prep sheet; `text` is European Portuguese and is what audio plays. */
export interface PrepPhrase {
  text: string;
  translation?: string;
}

export interface PrepSheet {
  /** 'authored' = situation.mission data; 'self_made' = built from patterns/vocab. */
  kind: 'authored' | 'self_made';
  title: string;
  /** What to rehearse before doing it for real. */
  prep: PrepPhrase[];
  /** Escape hatches when it goes sideways. */
  fallbacks: PrepPhrase[];
  /** What the other party will probably say. */
  likelyResponses: PrepPhrase[];
  /** Extra vocabulary to have ready (self-made sheets only). */
  vocabulary: PrepPhrase[];
}

/**
 * Universal escape hatches for self-made missions (every real-world attempt needs
 * a way out — CONTENT-ARCHITECTURE §12 calm/honest: getting stuck is normal).
 */
const UNIVERSAL_FALLBACKS: PrepPhrase[] = [
  { text: 'Desculpe, pode repetir mais devagar?', translation: 'Sorry, can you repeat more slowly?' },
  { text: 'Estou a aprender português.', translation: 'I am learning Portuguese.' },
];

/** Render a pattern's base phrase with each {slot} replaced by its first option. */
export const renderPatternExample = (pattern: PhrasePattern): string => {
  let text = pattern.base;
  for (const slot of pattern.slots ?? []) {
    const option = slot.options[0];
    if (option !== undefined) text = text.split(`{${slot.name}}`).join(option);
  }
  return text;
};

/**
 * Build the prep sheet for a situation. Authored mission data wins; otherwise
 * degrade to a self-made sheet from the situation's real patterns/vocab so the
 * engine is useful TODAY (enrichment fills `mission` later).
 */
export const buildPrepSheet = (situation: Situation): PrepSheet => {
  const mission = situation.mission;
  if (mission) {
    return {
      kind: 'authored',
      title: mission.title,
      prep: mission.prep.map((text) => ({ text })),
      fallbacks: mission.fallback_phrases.map((text) => ({ text })),
      likelyResponses: mission.likely_responses.map((text) => ({ text })),
      vocabulary: [],
    };
  }

  const prep: PrepPhrase[] = situation.phrase_patterns
    .slice(0, missionsConfig.selfMadePrepPhraseMax)
    .map((pattern) => ({ text: renderPatternExample(pattern), translation: pattern.translation }));

  const vocabulary: PrepPhrase[] = situation.vocabulary
    .slice(0, missionsConfig.selfMadeVocabMax)
    .map((item) => ({ text: item.word, translation: item.translation }));

  const likelyResponses: PrepPhrase[] = (situation.dialogues ?? [])
    .flatMap((dialogue) => dialogue.lines)
    .slice(0, missionsConfig.selfMadeLikelyResponseMax)
    .map((line) => ({ text: line.text, translation: line.translation }));

  return {
    kind: 'self_made',
    title: situation.title,
    prep,
    fallbacks: UNIVERSAL_FALLBACKS,
    likelyResponses,
    vocabulary,
  };
};
