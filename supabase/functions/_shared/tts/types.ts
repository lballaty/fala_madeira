// File: supabase/functions/_shared/tts/types.ts
// Description: Shared types for the server-side TTS provider adapter layer. Defines the
//   TtsProvider interface every connector implements, the 7-way voice_type catalog
//   (docs/CONTENT-ARCHITECTURE.md §8: teacher / local / older / younger / service_worker /
//   phone / noisy), the synthesis result envelope (base64 audio + mime + sample rate +
//   provider/voice metadata for the client cache key: provider+voice, no speed), and the
//   structured no-provider error that tells the client to fall back to browser Web Speech.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import type { TutorLike } from "../gemini.ts";
export type { TutorLike };

// Speaker variety required by the Listening Engine (CONTENT-ARCHITECTURE §8):
// clear teacher, natural local, older, younger, service-worker style, phone-audio,
// noisy café/market. "phone" and "noisy" pick a base voice here; acoustic degradation
// (band-pass / background noise) is a client-side post-process in a later step.
export const VOICE_TYPES = [
  "teacher",
  "local",
  "older",
  "younger",
  "service_worker",
  "phone",
  "noisy",
] as const;

export type VoiceType = (typeof VOICE_TYPES)[number];

export function isVoiceType(v: unknown): v is VoiceType {
  return typeof v === "string" && (VOICE_TYPES as readonly string[]).includes(v);
}

export type ProviderId =
  | "azure"
  | "gemini"
  | "google"
  | "elevenlabs"
  | "openai"
  | "polly";

// Per-call options passed alongside the resolved provider voice id.
export interface TtsSynthesisOptions {
  voiceType: VoiceType;
  // Legacy tutor object from the client (used by the Gemini connector to preserve the
  // pre-adapter tutor→voice behaviour when the client sends no explicit voiceType).
  tutor?: TutorLike;
  // Correlation id threaded from the edge-function request for observability.
  requestId?: string;
}

// What every connector returns: base64 audio + enough metadata for the client to decode
// and to build its cache key (provider + voice, never speed — speed is a playback-time
// transform, not a synthesis input in this design).
export interface TtsAudio {
  audioBase64: string;
  mimeType: string;
  sampleRateHz: number;
  voice: string;
}

// Result the router hands back to the edge function (adds which provider actually served).
export interface TtsResult extends TtsAudio {
  provider: ProviderId;
  voiceType: VoiceType;
}

export interface TtsProvider {
  readonly id: ProviderId;
  // Availability is decided ONLY by the presence of the provider's secret(s) in
  // Deno.env — no hardcoded fallback keys or URLs, ever. Missing key = unavailable.
  isAvailable(): boolean;
  synthesize(
    text: string,
    voice: string,
    opts: TtsSynthesisOptions,
  ): Promise<TtsAudio>;
}

// Thrown by the router when no provider in the chain is available/succeeded. The edge
// function maps this to a structured TTS_UNAVAILABLE error so the client can fall back
// to browser Web Speech instead of showing a generic failure.
export class TtsUnavailableError extends Error {
  readonly attempted: ProviderId[];
  constructor(message: string, attempted: ProviderId[]) {
    super(message);
    this.name = "TtsUnavailableError";
    this.attempted = attempted;
  }
}

// Base64-encode raw audio bytes without blowing the call stack on large buffers.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
