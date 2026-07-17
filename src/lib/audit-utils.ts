// File: src/lib/audit-utils.ts
// Description: EN-8 pure, network-free coverage core shared by the pre-gen generator
//   (scripts/pregen-audio.mjs) and the coverage auditor (scripts/audit-audio.mjs) so the two can
//   never silently disagree on WHICH clips level-N hosting covers. A single walk —
//   clipsByLevel(packs) — enumerates every speakable line via the SAME pure functions the client
//   and offline-download paths use (linesForSituation → resolveVoice → buildKey → keyToServerPath),
//   deduped per level by server object name. expectedNamesByLevel() is DERIVED from that walk, so
//   the generator's target set and the auditor's expected set are the same set by construction
//   (the round-trip invariant locked in src/lib/__tests__/audit-utils.test.ts). Also holds the
//   coverage diff math (diffCoverage/findOrphans) and the provider-hit filter (providerHits) the
//   auditor uses for the --verify-l0 no-provider-synthesis gating proof. Everything here is pure:
//   no network, no Supabase, no fs — callers own I/O.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import type { ContentPack, PracticalLevel, VoiceType } from '../content/schema';
import { linesForSituation } from '../content/lines';
import { buildKey, keyToServerPath } from './audioKey';
import { resolveVoice } from './voiceType';

/** One clip to synthesize/host: the source line plus its resolved cache key + server object name. */
export interface AudioClip {
  text: string;
  voiceType?: VoiceType;
  /** Cache key (buildKey('default', resolvedVoice, text)) — identical to the client/offline path. */
  key: string;
  /** Server object name (keyToServerPath(key)) — the /audio and buffer filename. */
  name: string;
}

/** Per-level coverage counts for one level's expected set against what's hosted/buffered. */
export interface LevelCoverage {
  expected: number;
  on_verpex: number;
  in_buffer: number;
  missing_everywhere: number;
  buffer_lag: number;
}

/** A public.logs row shape as read by the auditor (details may arrive as an object or JSON string). */
export interface LogRow {
  details: unknown;
}

/**
 * The SINGLE source of truth for "what clips does level-N hosting cover". Walks every bundled pack's
 * situations, enumerates each speakable line (linesForSituation), resolves its voice + cache key +
 * server object name exactly as the client does, and dedupes per level by object name (the same clip
 * caches/hosts to one name regardless of how many situations reference it). Insertion order is
 * preserved (packs → situations → lines) so the generator's work order is stable.
 */
export const clipsByLevel = (packs: ContentPack[]): Map<PracticalLevel, AudioClip[]> => {
  const byLevel = new Map<PracticalLevel, AudioClip[]>();
  const seenByLevel = new Map<PracticalLevel, Set<string>>();
  for (const pack of packs) {
    for (const situation of pack.situations) {
      const lvl = situation.level;
      if (!byLevel.has(lvl)) {
        byLevel.set(lvl, []);
        seenByLevel.set(lvl, new Set());
      }
      const list = byLevel.get(lvl)!;
      const seen = seenByLevel.get(lvl)!;
      for (const line of linesForSituation(situation)) {
        const voice = resolveVoice({ voiceType: line.voiceType });
        const key = buildKey('default', voice, line.text);
        const name = keyToServerPath(key);
        if (seen.has(name)) continue;
        seen.add(name);
        list.push({ text: line.text, voiceType: line.voiceType, key, name });
      }
    }
  }
  return byLevel;
};

/**
 * Per-level Set of expected server object names — DERIVED from clipsByLevel, so it is exactly the
 * name set the generator would target. This is what makes the round-trip invariant true rather than
 * two hand-kept copies that can drift.
 */
export const expectedNamesByLevel = (packs: ContentPack[]): Map<PracticalLevel, Set<string>> => {
  const byLevel = new Map<PracticalLevel, Set<string>>();
  for (const [lvl, clips] of clipsByLevel(packs)) {
    byLevel.set(lvl, new Set(clips.map((c) => c.name)));
  }
  return byLevel;
};

/**
 * Coverage counts for one level's `expected` name set against the sets actually on Verpex / in the
 * buffer: on_verpex (hosted), in_buffer (staged), missing_everywhere (neither), buffer_lag (staged
 * but not yet copied to Verpex). Pure set arithmetic.
 */
export const diffCoverage = ({
  expected,
  onVerpex,
  inBuffer,
}: {
  expected: Set<string>;
  onVerpex: Set<string>;
  inBuffer: Set<string>;
}): LevelCoverage => {
  let on_verpex = 0;
  let in_buffer = 0;
  let missing_everywhere = 0;
  let buffer_lag = 0;
  for (const name of expected) {
    const v = onVerpex.has(name);
    const b = inBuffer.has(name);
    if (v) on_verpex++;
    if (b) in_buffer++;
    if (!v && !b) missing_everywhere++;
    if (b && !v) buffer_lag++;
  }
  return { expected: expected.size, on_verpex, in_buffer, missing_everywhere, buffer_lag };
};

/** Names present (on Verpex or in the buffer) that are NOT expected — retention/orphan visibility. */
export const findOrphans = ({
  expected,
  onVerpex,
  inBuffer,
}: {
  expected: Set<string>;
  onVerpex: Set<string>;
  inBuffer: Set<string>;
}): string[] =>
  [...new Set([...inBuffer, ...onVerpex])].filter((n) => !expected.has(n));

/**
 * Filter tts_source log rows to PROVIDER-tier synthesis events whose clip falls inside `expectedNames`
 * (the level being verified). A non-empty result means the 503-avoidance win was NOT demonstrated —
 * something re-synthesized through the paid provider instead of serving a hosted clip. details may be
 * an object or a JSON string; a key that fails to map is simply excluded.
 */
export const providerHits = <T extends LogRow>(logRows: T[] | null | undefined, expectedNames: Set<string>): T[] =>
  (logRows ?? []).filter((row) => {
    let d: unknown = row.details;
    if (typeof d === 'string') {
      try {
        d = JSON.parse(d);
      } catch {
        d = {};
      }
    }
    const rec = (d ?? {}) as { tier?: unknown; key?: unknown };
    return rec.tier === 'provider' && expectedNames.has(keyToServerPath(String(rec.key ?? '')));
  });
