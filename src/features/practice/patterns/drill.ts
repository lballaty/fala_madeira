// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/patterns/drill.ts
// Description: Pure, deterministic drill-composition logic for the Pattern Builder engine
//   (docs/CONTENT-ARCHITECTURE.md §3: phrase_patterns + slots → substitution drills;
//   §5 core loop "Vary" step). No AI calls, no I/O: parsing {slot} markers out of a
//   PhrasePattern base, detecting slotted vs bare patterns dynamically (seed packs ship
//   {id, base} only — slots/variants arrive with the enrichment step), assembling the
//   phrase from chip selections, and composing/shuffling the drill queue. Grading
//   emissions (the Coach/SRS signal surface, §6b) live here so every drill kind emits
//   the same USER_ACTION shape through src/lib/logger.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import type { PhrasePattern, PatternSlot } from '../../../content';
import { logger } from '../../../lib/logger';

// Pattern-builder tunables. NOTE: these belong in src/config.ts (AGENTS.md §3 "config,
// not magic values") but that file is under an active write claim by the parallel
// srs-adaptive-engine step — migrate this block into config.ts once that claim is
// released (same deferral as practiceConfig in ../registry.ts).
export const patternDrillConfig = {
  /** Debounce window between TTS plays (matches useSpeechPlayback's guard). */
  speechDebounceMs: 300,
  /** TTS playback speed for drill phrases (config.audio.defaultPlaybackSpeed mirror). */
  playbackSpeed: 1.0,
} as const;

// ---------------------------------------------------------------------------
// Grades (self-graded recall → Coach/SRS signal, §6/§6b)
// ---------------------------------------------------------------------------

export const PATTERN_GRADES = ['got-it', 'almost', 'missed'] as const;
export type PatternGrade = (typeof PATTERN_GRADES)[number];

export const GRADE_LABELS: Record<PatternGrade, string> = {
  'got-it': 'Got it',
  almost: 'Almost',
  missed: 'Missed',
};

/** Which drill UI a pattern was practiced with (dynamic per pattern, never hardcoded). */
export type DrillKind = 'slotted' | 'phrase';

/** Zeroed tally of grades for a drill run. */
export const emptyTally = (): Record<PatternGrade, number> => ({ 'got-it': 0, almost: 0, missed: 0 });

// ---------------------------------------------------------------------------
// Base-phrase parsing ({slot} markers → segments)
// ---------------------------------------------------------------------------

/** One piece of a pattern base: literal text or a named substitution slot. */
export type BaseSegment = { kind: 'text'; text: string } | { kind: 'slot'; name: string };

const SLOT_MARKER = /\{([A-Za-z0-9_-]+)\}/g;

/** Split a pattern base ("A limpeza é {when}.") into text/slot segments, in order. */
export const parseBaseSegments = (base: string): BaseSegment[] => {
  const segments: BaseSegment[] = [];
  let lastIndex = 0;
  for (const match of base.matchAll(SLOT_MARKER)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ kind: 'text', text: base.slice(lastIndex, index) });
    segments.push({ kind: 'slot', name: match[1] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < base.length) segments.push({ kind: 'text', text: base.slice(lastIndex) });
  return segments;
};

/** Slot names actually referenced by {marker}s in the base text. */
export const referencedSlotNames = (base: string): Set<string> =>
  new Set(parseBaseSegments(base).flatMap((s) => (s.kind === 'slot' ? [s.name] : [])));

/**
 * A pattern is drillable as a slot-substitution exercise when it declares at least
 * one slot with options AND its base actually references every such slot. Seed data
 * ships bare {id, base} patterns (empty/absent slots) → those degrade to the phrase
 * drill. Detection is fully dynamic — no situation/pack ids are special-cased.
 */
export const isSlottedPattern = (pattern: PhrasePattern): boolean => {
  const slots = pattern.slots ?? [];
  if (slots.length === 0) return false;
  const referenced = referencedSlotNames(pattern.base);
  const usable = slots.filter((s) => s.options.length > 0 && referenced.has(s.name));
  // Every declared-with-options slot must be wired into the base; a half-authored
  // pattern (marker without options, or options without marker) degrades safely.
  return usable.length > 0 && usable.length === slots.filter((s) => s.options.length > 0).length;
};

/** The subset of a pattern's slots that are actually drillable (options + referenced). */
export const drillableSlots = (pattern: PhrasePattern): PatternSlot[] => {
  const referenced = referencedSlotNames(pattern.base);
  return (pattern.slots ?? []).filter((s) => s.options.length > 0 && referenced.has(s.name));
};

/** Current chip choice per slot name (index into PatternSlot.options). */
export type SlotSelections = Record<string, number>;

/** First-option default selection for every drillable slot. */
export const defaultSelections = (pattern: PhrasePattern): SlotSelections => {
  const selections: SlotSelections = {};
  for (const slot of drillableSlots(pattern)) selections[slot.name] = 0;
  return selections;
};

/**
 * The text a named slot currently shows: the selected option (first option when
 * unselected), or the raw {name} marker for an unknown/optionless slot (a visible
 * authoring bug rather than silent text loss).
 */
export const slotValue = (pattern: PhrasePattern, name: string, selections: SlotSelections): string => {
  const slot = (pattern.slots ?? []).find((s) => s.name === name);
  if (!slot || slot.options.length === 0) return `{${name}}`;
  const index = selections[name] ?? 0;
  return slot.options[index] ?? slot.options[0];
};

/** Assemble the speakable phrase from the base + current chip selections. */
export const assemblePhrase = (pattern: PhrasePattern, selections: SlotSelections): string =>
  parseBaseSegments(pattern.base)
    .map((segment) => (segment.kind === 'text' ? segment.text : slotValue(pattern, segment.name, selections)))
    .join('');

// ---------------------------------------------------------------------------
// Drill queue composition (deterministic — no AI calls)
// ---------------------------------------------------------------------------

/** Uniform Fisher–Yates shuffle (fresh array; input untouched). */
export const shuffled = <T>(items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Compose the drill queue over a situation's phrase_patterns: authored order by
 * default (curation order is meaningful, §5), Fisher–Yates when shuffle mode is on.
 * Patterns without a usable base are dropped (logged upstream by the view).
 */
export const composeDrill = (patterns: readonly PhrasePattern[], shuffle: boolean): PhrasePattern[] => {
  const usable = patterns.filter((p) => p.base.trim().length > 0);
  return shuffle ? shuffled(usable) : [...usable];
};

// ---------------------------------------------------------------------------
// Coach signal emissions (§6b Feedback & Focus loop)
// ---------------------------------------------------------------------------

export interface PatternGradeSignal {
  patternId: string;
  situationId: string | null;
  grade: PatternGrade;
  drillKind: DrillKind;
  /** The exact phrase drilled (assembled text for slotted patterns). */
  phrase: string;
}

/** Record one self-graded pattern outcome for Coach/SRS consumers. */
export const emitPatternGrade = ({ patternId, situationId, grade, drillKind, phrase }: PatternGradeSignal): void => {
  // COACH SIGNAL: pattern-drill grade — the Coach/adaptive-review loop (§6b) reads these
  // USER_ACTION events to steer the 'retrieve'/'say' mastery dimensions per pattern.
  logger.info('PATTERN_DRILL_GRADE', `pattern "${patternId}" graded "${grade}"`, {
    category: 'USER_ACTION',
    details: { patternId, situationId, grade, drillKind, phrase },
  });
};

/** Record the end-of-run tally so the Coach sees drill sessions, not just single grades. */
export const emitDrillComplete = (
  situationId: string | null,
  tally: Record<PatternGrade, number>,
  total: number,
): void => {
  // COACH SIGNAL: pattern-drill session summary — aggregate grading emission for the
  // Coach's session-level suggestions (§6b), paired with the per-pattern grades above.
  logger.info('PATTERN_DRILL_COMPLETE', `pattern drill finished (${total} pattern(s))`, {
    category: 'USER_ACTION',
    details: { situationId, total, ...tally },
  });
};
