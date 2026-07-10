// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/simulator/scenario.ts
// Description: Pure helpers for the Situation Simulator (CONTENT-ARCHITECTURE §3: branching
//   roleplay, difficulty L1 guided → L5 messy real-life). No React/Supabase imports by
//   contract — everything here is deterministic and unit-testable: difficulty flavor text,
//   the free-AI-roleplay scenario prompt builder (§7 scenario-generator role over the tutor
//   edge fn), the NPC-reply parser (EN: translation lines + [FIM] end marker), and the
//   loose-match helper (accent/case/punctuation-normalized token+bigram Dice similarity)
//   that lets L3+ learners answer scripted roleplay nodes in their own words.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import type {
  RoleplayDifficulty,
  RoleplayNode,
  RoleplayOption,
  Situation,
} from '../../../content/schema';

// ---------------------------------------------------------------------------
// Tunables. NOTE: these belong in src/config.ts (AGENTS.md §3 "config, not
// magic values") but that file is under an active write claim by the parallel
// srs-adaptive-engine step — migrate this block into config.ts once the claim
// is released (same deferral as practiceConfig in ../registry.ts).
// ---------------------------------------------------------------------------
export const simulatorConfig = {
  /** Minimum normalized similarity for a free-text reply to match a scripted option (L3+). */
  matchThreshold: 0.55,
  /** Unmatched free replies before the coach nudges toward the "Need a hint?" reveal. */
  missesBeforeHintNudge: 2,
  /** Response latency (ms) after an NPC line beyond which the turn counts as a stall. */
  stallLatencyMs: 20000,
  /** One-shot dictation budget for platform.speech.recognize(). */
  dictationTimeoutMs: 12000,
  /** Difficulties at or below this show option buttons + translations (guided). */
  guidedMaxDifficulty: 2 as RoleplayDifficulty,
  /** Max phrase-pattern bases woven into the free-roleplay scenario prompt. */
  promptPatternMax: 6,
  /** Max vocabulary items woven into the free-roleplay scenario prompt. */
  promptVocabMax: 10,
  /** TTS playback rate per difficulty (L1 slow and patient → L5 natural). */
  ttsRateByDifficulty: { 1: 0.8, 2: 0.9, 3: 1.0, 4: 1.0, 5: 1.0 } as Record<RoleplayDifficulty, number>,
} as const;

/** Short pill captions per difficulty (v3 mockup sim-levelnote). */
export const DIFFICULTY_NOTES: Record<RoleplayDifficulty, string> = {
  1: 'guided · slow · hints on',
  2: 'normal speed · hints on',
  3: 'less scaffolding · answer in your own words',
  4: 'fast, colloquial',
  5: 'messy real life — noise, speed, reductions',
};

// Behavior flavor injected into the free-roleplay prompt: L1 slow/patient/simple with
// corrections → L5 colloquial, indirect, interruptions, Madeira-realistic messiness.
const FREE_PROMPT_FLAVORS: Record<RoleplayDifficulty, string> = {
  1: 'Difficulty L1 (guided): speak very slowly and simply — short sentences, basic vocabulary, endless patience. If the learner makes a mistake, gently correct it in one short English sentence before carrying on.',
  2: 'Difficulty L2: speak clearly at a relaxed pace with simple, natural phrasing. Be encouraging; only correct mistakes that block understanding, and keep corrections brief.',
  3: 'Difficulty L3: speak at natural speed with everyday colloquial touches. Do not simplify unless the learner is clearly lost — then rephrase in easier Portuguese, never in English.',
  4: 'Difficulty L4: speak fast and colloquially, with common spoken reductions ("tá", "pra", "\'manhã"). Be a little indirect, ask follow-up questions, and expect the learner to keep up.',
  5: 'Difficulty L5 (messy real life): fast, colloquial Madeiran speech — interrupt yourself, self-correct, drift onto small tangents, answer indirectly. Occasionally mishear the learner and make them repeat themselves. Background distractions may cut a sentence short (show it with "…"). Zero accommodation.',
};

// ---------------------------------------------------------------------------
// Free AI roleplay: scenario prompt + NPC reply protocol
// ---------------------------------------------------------------------------

/**
 * Build the scenario prompt that turns the general tutor chat (geminiService.startChat)
 * into an in-character roleplay counterpart for this situation. The reply protocol the
 * prompt establishes is parsed by parseFreeReply: optional "EN:" translation lines at
 * L1–L2 and a final "[FIM]" line when the scene reaches its natural end.
 */
export function buildFreeRoleplayPrompt(situation: Situation, difficulty: RoleplayDifficulty): string {
  const patterns = situation.phrase_patterns
    .slice(0, simulatorConfig.promptPatternMax)
    .map((p) => `"${p.base}"`)
    .join(', ');
  const vocabulary = situation.vocabulary
    .slice(0, simulatorConfig.promptVocabMax)
    .map((v) => `${v.word} (${v.translation})`)
    .join(', ');
  const goals = (situation.goals ?? []).join('; ');

  return [
    'ROLEPLAY MODE. From now on you are playing the OTHER PERSON in a real-life situation in Madeira, Portugal — a real counterpart (waiter, cleaner, clerk, neighbour, caller…), NOT a language teacher. Stay in character for the whole conversation.',
    '',
    `SCENE: ${situation.title} — ${situation.summary}`,
    goals ? `The learner wants to be able to: ${goals}` : null,
    '',
    'RULES:',
    "1. Infer a natural counterpart role from the scene and open with that person's first spoken line.",
    '2. Speak only European Portuguese as heard in Madeira. One conversational turn at a time — one or two short spoken lines, never lectures, lists, or markdown.',
    `3. ${FREE_PROMPT_FLAVORS[difficulty]}`,
    difficulty <= simulatorConfig.guidedMaxDifficulty
      ? '4. After each Portuguese line, add one extra line starting with "EN:" containing its English translation.'
      : '4. Do not use English and do not translate (except the single correction sentence if your difficulty rule allows it).',
    patterns || vocabulary
      ? `5. Naturally work the learner's practice material into the scene where it fits: patterns ${patterns || '(none)'}; vocabulary ${vocabulary || '(none)'}.`
      : null,
    '6. When the conversation reaches its natural end (matter settled, goodbyes exchanged), add a final line containing exactly "[FIM]".',
    '',
    'Begin the scene now with your first line.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export interface ParsedNpcReply {
  /** The character's Portuguese line(s), stripped of protocol markers. */
  text: string;
  /** English translation aggregated from "EN:" lines (L1–L2 protocol), if any. */
  translation?: string;
  /** True when the model signalled the natural end of the scene ([FIM]). */
  done: boolean;
}

/** Parse an NPC reply per the prompt protocol: "EN:" translation lines + "[FIM]" end marker. */
export function parseFreeReply(raw: string): ParsedNpcReply {
  const done = raw.includes('[FIM]');
  const lines = raw
    .replace(/\[FIM\]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const translationLines: string[] = [];
  const textLines: string[] = [];
  for (const line of lines) {
    const match = line.match(/^EN:\s*(.*)$/i);
    if (match) translationLines.push(match[1]);
    else textLines.push(line);
  }
  return {
    text: textLines.join('\n'),
    translation: translationLines.length > 0 ? translationLines.join(' ') : undefined,
    done,
  };
}

// ---------------------------------------------------------------------------
// Scripted roleplay: loose free-text matching against node options (L3+)
// ---------------------------------------------------------------------------

/** Accent/case/punctuation-insensitive normalization for European Portuguese text. */
export const normalizePt = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenSet = (s: string): Set<string> => new Set(normalizePt(s).split(' ').filter(Boolean));

const bigramSet = (s: string): Set<string> => {
  const compact = normalizePt(s).replace(/ /g, '');
  const out = new Set<string>();
  for (let i = 0; i < compact.length - 1; i++) out.add(compact.slice(i, i + 2));
  return out;
};

const dice = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return (2 * intersection) / (a.size + b.size);
};

/**
 * Normalized similarity in [0, 1]: the max of word-token Dice (robust to reordering)
 * and character-bigram Dice (robust to inflection/typos on short phrases).
 */
export const similarity = (a: string, b: string): number =>
  Math.max(dice(tokenSet(a), tokenSet(b)), dice(bigramSet(a), bigramSet(b)));

export interface OptionMatch {
  index: number;
  score: number;
}

/** Best-scoring option for a free-text/voice reply, or null when the node has no options. */
export function matchOption(input: string, options: RoleplayOption[]): OptionMatch | null {
  let best: OptionMatch | null = null;
  options.forEach((option, index) => {
    const score = similarity(input, option.text);
    if (!best || score > best.score) best = { index, score };
  });
  return best;
}

/** Resolve a node by id inside a roleplay graph (null when the ref is broken). */
export const findNode = (nodes: RoleplayNode[], id: string): RoleplayNode | null =>
  nodes.find((node) => node.id === id) ?? null;
