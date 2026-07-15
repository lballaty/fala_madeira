// File: src/lib/voiceType.ts
// Description: CLIENT mirror of the server voiceTypeForTutor (supabase/functions/_shared/tts/
//   router.ts) so the browser resolves the SAME voice archetype a tutor maps to as the edge does.
//   EN-8 keys the audio cache + server-hosted files by the resolved voiceType (not the raw tutor
//   id), so client and server MUST agree or hosted/downloaded clips are missed. Kept in lockstep
//   with router.ts: undefined -> teacher; age>40 -> older; else female -> teacher, male -> local.
//   A parity unit test (voiceType.test.ts) locks this against the server mapping table.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { Tutor } from '../types';
import { VoiceType } from '../content/schema';

/** Resolve the voice archetype for a tutor — identical logic to the server router. */
export const voiceTypeForTutor = (tutor?: Tutor): VoiceType => {
  if (!tutor) return 'teacher';
  if (tutor.age > 40) return 'older';
  return tutor.gender === 'female' ? 'teacher' : 'local';
};

/**
 * Resolve the cache-key VOICE SLOT for a synthesis request (EN-8). An explicit voice_type wins
 * (dialogue lines + pre-gen carry per-speaker archetypes like 'service_worker'); otherwise the
 * archetype is derived from the tutor via voiceTypeForTutor. Keying ALL tts by this resolved
 * value — never the raw tutor id — is what makes live playback, offline downloads, the Node
 * pre-gen script, and the server-hosted files agree on ONE key per (voice, text). The single
 * source of truth shared by geminiService.synthesizeCached and lib/audio-download.
 */
export const resolveVoice = (opts: { voiceType?: string; tutor?: Tutor }): string =>
  opts.voiceType || voiceTypeForTutor(opts.tutor);
