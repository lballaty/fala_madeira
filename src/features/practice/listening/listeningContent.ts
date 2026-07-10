// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/listening/listeningContent.ts
// Description: Pure content logic for the Listening Engine (no React, no I/O). Turns a
//   Situation into playable ListenItems — dialogue lines when dialogues exist (schema
//   DialogueLine: speaker + voice_type), otherwise a phrase/vocabulary fallback so seed
//   situations (whose dialogues[] are empty until enrichment) stay genuinely practiceable.
//   Also generates deterministic "what did you hear?" comprehension checks (seeded PRNG —
//   no AI call) and scores dictation attempts with an LCS word diff.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import type { Dialogue, PhrasePattern, Situation, VoiceType } from '../../../content';

// ---------------------------------------------------------------------------
// Listen items (one playable line)
// ---------------------------------------------------------------------------

export interface ListenItem {
  id: string;
  /** European Portuguese text sent to TTS and used for transcript/dictation/checks. */
  text: string;
  translation?: string;
  /** Display name — dialogue speaker, or 'Phrase'/'Word' in the fallback. */
  speaker: string;
  voiceType: VoiceType;
}

/** Render a pattern's base text with each `{slot}` filled by its first option (deterministic). */
export const renderPatternText = (pattern: PhrasePattern): string =>
  (pattern.slots ?? []).reduce(
    (text, slot) => text.split(`{${slot.name}}`).join(slot.options[0] ?? slot.name),
    pattern.base
  );

/** Dialogue lines → listen items (the engine's primary path once enrichment lands). */
export const buildDialogueItems = (dialogue: Dialogue): ListenItem[] =>
  dialogue.lines.map((line, i) => ({
    id: `${dialogue.id}::line-${i}`,
    text: line.text,
    translation: line.translation,
    speaker: line.speaker,
    voiceType: line.voice_type,
  }));

/**
 * No-dialogue degradation: listen to the situation's phrase patterns (clear teacher
 * voice) and vocabulary (natural local voice) with the same speed/reveal/replay/
 * dictation/check mechanics. Seed situations carry these today (§2.1).
 */
export const buildPhraseItems = (situation: Situation, maxItems: number): ListenItem[] => {
  const phraseItems: ListenItem[] = situation.phrase_patterns.map((pattern) => ({
    id: `${situation.id}::pattern-${pattern.id}`,
    text: renderPatternText(pattern),
    translation: pattern.translation,
    speaker: 'Phrase',
    voiceType: 'teacher',
  }));
  const vocabItems: ListenItem[] = situation.vocabulary.map((item, i) => ({
    id: `${situation.id}::vocab-${i}`,
    text: item.word,
    translation: item.translation,
    speaker: 'Word',
    voiceType: 'local',
  }));
  return [...phraseItems, ...vocabItems].slice(0, maxItems);
};

// ---------------------------------------------------------------------------
// Word helpers (per-word tap-to-replay, dictation tokenizing)
// ---------------------------------------------------------------------------

/** Display tokens of a line (whitespace split; punctuation kept for display). */
export const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Strip leading/trailing punctuation so a tapped word replays as a clean word. */
export const cleanWord = (word: string): string =>
  word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Accent/case/punctuation-insensitive form used for matching (dictation, distractor dedupe). */
const normalizeWord = (word: string): string =>
  cleanWord(word)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

const normalizeText = (text: string): string => wordsOf(text).map(normalizeWord).join(' ');

// ---------------------------------------------------------------------------
// Deterministic PRNG (checks are generated from content, not AI — same content,
// same seed, same checks on every device)
// ---------------------------------------------------------------------------

const hashSeed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <T>(rng: () => number, input: readonly T[]): T[] => {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// ---------------------------------------------------------------------------
// "What did you hear?" comprehension checks
// ---------------------------------------------------------------------------

export interface CheckChoice {
  text: string;
  correct: boolean;
}

export interface ListeningCheck {
  id: string;
  /** ListenItem the learner replays for this check. */
  targetItemId: string;
  choices: CheckChoice[];
}

/**
 * Build up to `maxChecks` checks: play a target item, pick what you heard among
 * 2–3 transcripts (correct + distractors drawn from the other items). Fully
 * deterministic per seedKey; returns [] when there are not enough distinct items.
 */
export const buildChecks = (
  items: ListenItem[],
  seedKey: string,
  maxChecks: number,
  choicesPerCheck: number
): ListeningCheck[] => {
  // Distinct-by-normalized-text pool (duplicate texts make unanswerable checks).
  const seen = new Set<string>();
  const pool = items.filter((item) => {
    const norm = normalizeText(item.text);
    if (norm === '' || seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
  if (pool.length < 2) return [];

  const rng = mulberry32(hashSeed(seedKey));
  const targets = shuffled(rng, pool)
    .slice(0, Math.min(maxChecks, pool.length))
    // Present in content order so checks follow the dialogue's flow.
    .sort((a, b) => pool.indexOf(a) - pool.indexOf(b));

  return targets.map((target) => {
    const distractors = shuffled(
      rng,
      pool.filter((item) => item.id !== target.id)
    ).slice(0, Math.max(1, choicesPerCheck - 1));
    const choices = shuffled(rng, [
      { text: target.text, correct: true },
      ...distractors.map((d) => ({ text: d.text, correct: false })),
    ]);
    return { id: `check-${target.id}`, targetItemId: target.id, choices };
  });
};

// ---------------------------------------------------------------------------
// Dictation scoring (type what you heard → LCS word diff)
// ---------------------------------------------------------------------------

export interface DiffToken {
  token: string;
  /** True when this token matched the other side (accent/case/punctuation-insensitive). */
  hit: boolean;
}

export interface DictationResult {
  /** The expected transcript, tokenized; misses are the words the learner didn't catch. */
  expected: DiffToken[];
  /** What the learner typed; misses are extra/wrong words. */
  typed: DiffToken[];
  matched: number;
  total: number;
  /** matched / total (0–1). */
  score: number;
}

/** Align expected vs typed words with an LCS diff and score the attempt. */
export const scoreDictation = (expectedText: string, typedText: string): DictationResult => {
  const expected = wordsOf(expectedText);
  const typed = wordsOf(typedText);
  const e = expected.map(normalizeWord);
  const t = typed.map(normalizeWord);

  // Classic LCS length table…
  const m = e.length;
  const n = t.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = e[i - 1] === t[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // …then backtrack marking the matched pairs.
  const expectedHit = new Array<boolean>(m).fill(false);
  const typedHit = new Array<boolean>(n).fill(false);
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (e[i - 1] === t[j - 1]) {
      expectedHit[i - 1] = true;
      typedHit[j - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const matched = expectedHit.filter(Boolean).length;
  return {
    expected: expected.map((token, idx) => ({ token, hit: expectedHit[idx] })),
    typed: typed.map((token, idx) => ({ token, hit: typedHit[idx] })),
    matched,
    total: m,
    score: m === 0 ? 0 : matched / m,
  };
};
