// File: supabase/functions/audio-warm/_core.ts
// Description: PURE, runtime-agnostic core of the EN-34 audio-warm edge function. Holds EVERY warm
//   decision so they are fully unit-testable without a Deno runtime: the canonical line walk
//   (linesForSituationCore — a byte-for-byte behavioural MIRROR of src/content/lines.ts, which the
//   Deno fn cannot import from the browser bundle, exactly like _shared/audioKey.ts mirrors
//   src/lib/audioKey.ts), the regen-first work planner (planWarmWork), the tier-merge helper
//   (mergeTiersCore — mirror of src/lib/audit-utils.ts mergeTiers), and the rate-limit clean-stop
//   decision (shouldStopForRateLimit). NO Deno globals, NO esm.sh/URL imports, NO network, NO fs.
//   Type-checked by the app tsc (it is NOT excluded — only Deno-flavoured files are) and imported
//   by vitest. index.ts (the Deno.serve glue) owns all I/O and binds these decisions to Supabase.
//
//   KEEP linesForSituationCore IN LOCKSTEP with src/content/lines.ts linesForSituation, and
//   mergeTiersCore IN LOCKSTEP with src/lib/audit-utils.ts mergeTiers. A parity unit test
//   (__tests__/_core.test.ts) locks the line walk against the canonical module for every bundled
//   pack; if one changes, change both.
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

// ---------------------------------------------------------------------------
// linesForSituationCore — MIRROR of src/content/lines.ts linesForSituation.
// Types are declared structurally (not imported) so this stays a zero-dependency
// pure module the Deno fn can bundle. The shapes match src/content/schema.ts.
// ---------------------------------------------------------------------------

/** One unit of work: the text to synthesize + its voice fingerprint for the cache key. */
export interface AudioLineCore {
  text: string;
  /** Dialogue lines carry a voice_type; other content uses the app-default tutor voice. */
  voiceType?: string;
}

// Minimal structural shape of a Situation payload (only the fields the walk reads).
interface DialogueLineShape { text?: string; voice_type?: string }
interface DialogueShape { lines?: DialogueLineShape[] }
interface PatternVariantShape { text?: string }
interface PhrasePatternShape { base?: string; variants?: PatternVariantShape[] }
interface VocabularyItemShape { word?: string }
interface RoleplayOptionShape { text?: string }
interface RoleplayNodeShape { npc_text?: string; npc_voice_type?: string; options?: RoleplayOptionShape[] }
interface RoleplayShape { nodes?: RoleplayNodeShape[] }
export interface SituationShape {
  dialogues?: DialogueShape[];
  phrase_patterns?: PhrasePatternShape[];
  vocabulary?: VocabularyItemShape[];
  roleplay?: RoleplayShape;
}

/**
 * Enumerate every speakable European-Portuguese line in a situation with its voice_type.
 * BYTE-FOR-BYTE behavioural mirror of src/content/lines.ts linesForSituation: dialogue lines each
 * carry their speaker's voice archetype; phrase patterns (base + variants), vocabulary, and roleplay
 * learner options use the default tutor voice (voiceType undefined); roleplay NPC lines carry their
 * archetype. De-duplicated within the situation on (voiceType, text). Insertion order preserved.
 */
export const linesForSituationCore = (situation: SituationShape): AudioLineCore[] => {
  const lines: AudioLineCore[] = [];
  const push = (text: string | undefined, voiceType?: string) => {
    const trimmed = text?.trim();
    if (trimmed) lines.push({ text: trimmed, voiceType });
  };

  // Multi-voice: dialogue lines each carry their speaker's voice archetype.
  for (const dialogue of situation.dialogues ?? []) {
    for (const line of dialogue.lines ?? []) push(line.text, line.voice_type);
  }

  // Phrase patterns (base + ready-made variants) — default tutor voice.
  for (const pattern of situation.phrase_patterns ?? []) {
    push(pattern.base);
    for (const variant of pattern.variants ?? []) push(variant.text);
  }

  // Vocabulary words — default tutor voice.
  for (const item of situation.vocabulary ?? []) push(item.word);

  // Roleplay: NPC lines carry their speaker archetype (multi-voice); learner OPTION lines are
  // reference pronunciations in the default tutor voice (like phrase_patterns/vocabulary).
  if (situation.roleplay) {
    for (const node of situation.roleplay.nodes ?? []) {
      push(node.npc_text, node.npc_voice_type);
      for (const option of node.options ?? []) push(option.text);
    }
  }

  // De-duplicate on (voiceType, text): the same clip caches to one key anyway.
  const seen = new Set<string>();
  return lines.filter((l) => {
    const k = `${l.voiceType ?? ''} ${l.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// ---------------------------------------------------------------------------
// mergeTiersCore — MIRROR of src/lib/audit-utils.ts mergeTiers (kept here so
// both the browser side and the Deno warm fn share ONE implementation shape).
// ---------------------------------------------------------------------------

/**
 * Add a store label ('bucket'|'verpex') to a clip's existing tiers[] set, deduped + stable-sorted.
 * Pure — the warm fn upserts the result into tts_audio_hosted.tiers.
 */
export const mergeTiersCore = (existing: readonly string[] | null | undefined, add: string): string[] =>
  [...new Set([...(existing ?? []), add])].filter(Boolean).sort();

// ---------------------------------------------------------------------------
// planWarmWork — regen-first, budget-bounded, hosted-dedup work planner.
// ---------------------------------------------------------------------------

/** One row to re-synthesize (drained from tts_audio_regen_queue). */
export interface RegenItem {
  /** queue row id */
  id: string;
  buildKey: string;
  voice: string;
  text: string;
  /** ISO-8601 tts_audio_regen_queue.enqueued_at — the idempotency guard compares it to hosted_at. */
  enqueuedAt: string;
}

/** One un-hosted NEW clip candidate (already enumerated + priority-ordered by the caller). */
export interface NewCandidate {
  buildKey: string;
  voice: string;
  text: string;
  /** keyToServerPath(buildKey) at generation 1 — the dedup identity against hostedByKey/each other. */
  objectName: string;
}

/** Current manifest state for a build_key (generation + which stores hold it). */
export interface HostedEntry {
  generation: number;
  tiers?: string[];
  /** ISO-8601 tts_audio_hosted.hosted_at — feeds isAlreadyFulfilled for the regen idempotency guard. */
  hostedAt?: string | null;
}

export interface PlanWarmWorkInput {
  /** pending regen rows (already limited by the caller's DB query). */
  pendingRegen: RegenItem[];
  /** build_key -> current hosted manifest entry (generation, tiers). */
  hostedByKey: Map<string, HostedEntry>;
  /** NEW clip candidates in PRIORITY order (onboarding -> level0 -> ... -> remainder). */
  newCandidates: NewCandidate[];
  /** total clips to attempt this run (regen + new share this budget). */
  maxPerRun: number;
}

export interface PlanWarmWorkResult {
  /** regen rows to drain this run (regen consumes the budget FIRST). */
  regenWork: RegenItem[];
  /** new clips to warm with the remaining budget, hosted-deduped, in priority order. */
  newWork: NewCandidate[];
}

/**
 * Decide what to do this tick. Regen ALWAYS comes first and consumes the budget first (draining the
 * admin re-record queue is higher priority than warming brand-new clips). Whatever budget remains is
 * filled with NEW candidates in the given order, SKIPPING any candidate already present in
 * hostedByKey (by build_key) or already selected this run (by object name — a clip referenced from
 * multiple situations must synthesize once). maxPerRun <= 0 or empty inputs yield empty work. The
 * caller pre-orders newCandidates by priority; the core only budgets/dedups/skips-hosted.
 */
export const planWarmWork = ({
  pendingRegen,
  hostedByKey,
  newCandidates,
  maxPerRun,
}: PlanWarmWorkInput): PlanWarmWorkResult => {
  const budget = Math.max(0, Math.floor(maxPerRun || 0));

  const regenWork = pendingRegen.slice(0, budget);
  let remaining = budget - regenWork.length;

  const newWork: NewCandidate[] = [];
  const selected = new Set<string>();
  for (const cand of newCandidates) {
    if (remaining <= 0) break;
    if (hostedByKey.has(cand.buildKey)) continue; // already hosted at some generation — skip
    if (selected.has(cand.objectName)) continue; // dedupe within this run by object name
    selected.add(cand.objectName);
    newWork.push(cand);
    remaining--;
  }

  return { regenWork, newWork };
};

// ---------------------------------------------------------------------------
// isAlreadyFulfilled — idempotency guard for the regen drain (EN-34 double-bump fix).
// ---------------------------------------------------------------------------

/**
 * Decide whether a pending regen row was ALREADY (re)hosted after it was enqueued, so a re-run must
 * NOT synth/host/bump it again — it only needs the mark-done completed.
 *
 * The scenario this guards: the drain hosts a clip (manifest upsert lands, setting hosted_at = now,
 * bumping generation) but then the "mark row done" UPDATE fails. The row stays 'pending'. Without a
 * guard, the next run reads that still-pending row, sees the now-bumped manifest generation, and
 * bumps AGAIN — a SECOND generation burned for ONE enqueue (double-bump). Because the manifest upsert
 * sets hosted_at to "now" (which is necessarily AFTER the row's enqueued_at), a manifest entry whose
 * hosted_at is strictly newer than the row's enqueued_at is proof the clip was re-hosted to satisfy
 * THIS enqueue. In that case the row is already fulfilled: skip the synth/host/bump and just mark it
 * done. hosted_at <= enqueued_at means the manifest reflects an OLDER hosting (or none), so this
 * enqueue still needs a fresh bump — proceed normally.
 *
 * Both timestamps are ISO-8601 strings (Date.toISOString / Postgres timestamptz). A missing/invalid
 * hosted_at (no manifest entry yet, or unparseable) returns false — never suppress a needed bump.
 */
export const isAlreadyFulfilled = (
  hostedAt: string | null | undefined,
  enqueuedAt: string | null | undefined,
): boolean => {
  if (!hostedAt || !enqueuedAt) return false;
  const hosted = Date.parse(hostedAt);
  const enqueued = Date.parse(enqueuedAt);
  if (Number.isNaN(hosted) || Number.isNaN(enqueued)) return false;
  return hosted > enqueued;
};

// ---------------------------------------------------------------------------
// shouldStopForRateLimit — clean-stop decision on consecutive rate-limited synths.
// ---------------------------------------------------------------------------

/**
 * Whether the batch should stop cleanly after N consecutive rate-limited/unavailable synths. At or
 * above the threshold we stop (partial progress is preserved by idempotency) rather than hammering a
 * throttled provider. Below the threshold we keep going. Default threshold is 2.
 */
export const shouldStopForRateLimit = (consecutiveRateLimited: number, threshold = 2): boolean =>
  consecutiveRateLimited >= threshold;
