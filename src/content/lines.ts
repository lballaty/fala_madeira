// File: src/content/lines.ts
// Description: PURE (no platform/config/DOM imports) enumeration of every speakable European-
//   Portuguese line in a Situation, with its voice_type. Extracted from src/lib/audio-download.ts
//   (EN-8) so the SAME line set feeds BOTH the browser offline downloader AND the Node pre-gen
//   script (which cannot import the browser bundle). Keeping it dependency-free is deliberate.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { Situation, VoiceType } from './schema';

// One unit of work: the text to synthesize + its voice fingerprint for the cache key.
export interface AudioLine {
  text: string;
  /** Dialogue lines carry a voice_type; other content uses the app-default tutor voice. */
  voiceType?: VoiceType;
}

/**
 * Enumerate every speakable European-Portuguese line in a situation with its voice_type.
 * Dialogue lines drive the MULTI-VOICE requirement (each line's own archetype); phrase
 * patterns and vocabulary use the default tutor voice (voiceType undefined). De-duplicated
 * within the situation so a repeated phrase is only synthesized once.
 */
export const linesForSituation = (situation: Situation): AudioLine[] => {
  const lines: AudioLine[] = [];
  const push = (text: string | undefined, voiceType?: VoiceType) => {
    const trimmed = text?.trim();
    if (trimmed) lines.push({ text: trimmed, voiceType });
  };

  // Multi-voice: dialogue lines each carry their speaker's voice archetype.
  for (const dialogue of situation.dialogues ?? []) {
    for (const line of dialogue.lines) push(line.text, line.voice_type);
  }

  // Phrase patterns (base + ready-made variants) — default tutor voice.
  for (const pattern of situation.phrase_patterns) {
    push(pattern.base);
    for (const variant of pattern.variants ?? []) push(variant.text);
  }

  // Vocabulary words — default tutor voice.
  for (const item of situation.vocabulary) push(item.word);

  // Roleplay (Situation Simulator, scripted mode): NPC lines carry their speaker archetype
  // (multi-voice); learner OPTION lines are reference pronunciations in the default tutor voice
  // (like phrase_patterns/vocabulary). Enumerating both makes scripted-simulator audio fully
  // downloadable + pre-hostable via the same keys (EN-8 / COORD-1: on-demand tap-to-hear).
  if (situation.roleplay) {
    for (const node of situation.roleplay.nodes) {
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
