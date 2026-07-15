// File: supabase/functions/_shared/tts/router.ts
// Description: TTS provider registry + routing for FalaMadeira edge functions. Owns the
//   single voice map (7 voice_type styles -> per-provider voice IDs) and the default
//   provider chain (azure -> gemini, per AGENTS.md §5). Each provider self-reports
//   availability from Deno.env presence of its secret(s) — a missing key simply means
//   that provider is skipped, and if NO provider is available/succeeds the router throws
//   TtsUnavailableError so the edge function returns a structured error and the client
//   falls back to browser Web Speech. NO hardcoded fallback keys or URLs anywhere.
//   Client cache-key guidance: provider + voice (both returned in metadata), never speed.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import {
  isVoiceType,
  type ProviderId,
  type TtsProvider,
  type TtsResult,
  TtsUnavailableError,
  type TutorLike,
  type VoiceType,
} from "./types.ts";
import { azureProvider } from "./azure.ts";
import { geminiProvider, voiceForTutor } from "./gemini.ts";
import { googleProvider } from "./google.ts";
import { elevenLabsProvider } from "./elevenlabs.ts";
import { openAiProvider } from "./openai.ts";
import { pollyProvider } from "./polly.ts";

// ---------------------------------------------------------------------------
// Voice map: the ONLY place voice_type -> per-provider voice IDs are defined.
// voice_type variety per docs/CONTENT-ARCHITECTURE.md §8. Azure ships three pt-PT
// neural voices (Raquel/Duarte/Fernanda); age/register variety there is completed by
// SSML prosody inside azure.ts. "phone"/"noisy" pick base voices — acoustic degradation
// is a client-side post-process (later step).
// ---------------------------------------------------------------------------
export const VOICE_MAP: Record<VoiceType, Record<ProviderId, string>> = {
  teacher: {
    azure: "pt-PT-RaquelNeural",
    gemini: "Kore",
    google: "pt-PT-Wavenet-A",
    elevenlabs: "21m00Tcm4TlvDq8ikWAM", // Rachel — clear, articulate
    openai: "nova",
    polly: "Ines",
  },
  local: {
    azure: "pt-PT-DuarteNeural",
    gemini: "Fenrir",
    google: "pt-PT-Wavenet-B",
    elevenlabs: "pNInz6obpgDQGcFmaJgB", // Adam — natural conversational
    openai: "onyx",
    polly: "Cristiano",
  },
  older: {
    azure: "pt-PT-FernandaNeural", // prosody-lowered in azure.ts
    gemini: "Charon",
    google: "pt-PT-Wavenet-C",
    elevenlabs: "ErXwobaYiN019PkySvjV", // Antoni — deeper, measured
    openai: "ash",
    polly: "Cristiano",
  },
  younger: {
    azure: "pt-PT-FernandaNeural", // prosody-raised in azure.ts
    gemini: "Leda",
    google: "pt-PT-Wavenet-D",
    elevenlabs: "MF3mGyEYCl7XYWbV9V6O", // Elli — youthful
    openai: "shimmer",
    polly: "Ines",
  },
  service_worker: {
    azure: "pt-PT-DuarteNeural", // rate-raised in azure.ts (brisk counter service)
    gemini: "Orus",
    google: "pt-PT-Wavenet-B",
    elevenlabs: "TxGEqnHWrfWFTfGW9XjX", // Josh — brisk, direct
    openai: "echo",
    polly: "Cristiano",
  },
  phone: {
    azure: "pt-PT-RaquelNeural",
    gemini: "Zephyr",
    google: "pt-PT-Standard-A",
    elevenlabs: "AZnzlk1XvdvUeBnXmlld", // Domi
    openai: "alloy",
    polly: "Ines",
  },
  noisy: {
    azure: "pt-PT-DuarteNeural",
    gemini: "Puck",
    google: "pt-PT-Standard-B",
    elevenlabs: "EXAVITQu4vr4xnSDxMaL", // Bella
    openai: "verse",
    polly: "Cristiano",
  },
};

// Registry of every connector (activation is purely secret-presence, per provider).
const PROVIDERS: Record<ProviderId, TtsProvider> = {
  azure: azureProvider,
  gemini: geminiProvider,
  google: googleProvider,
  elevenlabs: elevenLabsProvider,
  openai: openAiProvider,
  polly: pollyProvider,
};

// Default chain (TB-13): locale-pinned European-Portuguese providers FIRST — Azure/Google/Polly
// each take a pt-PT locale the engine cannot override (hard guarantee of mainland pronunciation) —
// then Gemini as the always-available server fallback (steered to European Portuguese in gemini.ts,
// best-effort: its voices have no locale param). Unconfigured providers self-skip, so a deployment
// with only a Gemini key still works (steered), and the client Web Speech fallback is also pt-PT.
// The final fallback — browser Web Speech — is client-side and triggers on the structured
// TTS_UNAVAILABLE error, not here. OpenAI/ElevenLabs are reachable only via an explicit `provider`
// request field (not the default chain) since their accent is inferred, not locale-pinned.
export const DEFAULT_CHAIN: ProviderId[] = ["azure", "google", "polly", "gemini"];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && v in PROVIDERS;
}

// Map a legacy tutor object to a voice_type for non-Gemini providers, so tutor-only
// requests (today's client) still get sensible voice variety everywhere.
export function voiceTypeForTutor(tutor?: TutorLike): VoiceType {
  if (!tutor) return "teacher";
  if ((tutor.age ?? 0) > 40) return "older";
  return tutor.gender === "female" ? "teacher" : "local";
}

export interface RouteTtsRequest {
  text: string;
  // Explicit voice_type from the client (preferred, new contract).
  voiceType?: unknown;
  // Legacy tutor object (existing playSpeech contract) — still fully supported.
  tutor?: TutorLike;
  // Optional explicit provider override (must be registered AND available).
  provider?: unknown;
  // The authenticated caller's stored TTS preference (profiles.tts_provider). When set and
  // resolvable, it is prepended to the default chain; the default chain remains as fallback.
  preferredProvider?: unknown;
  // Reference (NAME) of an edge/Vault secret holding the caller's bring-your-own key
  // (profiles.tts_byo_key_ref). Raw keys are NEVER passed or stored here — only the ref name.
  byoKeyRef?: unknown;
  requestId: string;
}

// Decide whether a preferred provider can actually serve a request:
//  - its platform secret is present (provider.isAvailable()), OR
//  - a bring-your-own key is resolvable from the edge-secret namespace via the ref name.
// A stale/unresolvable BYO ref is logged WARN and returns false, so routing silently falls
// back to the default chain instead of failing TTS. NB: presence of a BYO key here does not
// yet reconfigure the connector's auth (connectors read their own platform secret); this is
// the resolution + gating seam so a user preference is only honored when a usable credential
// exists. Raw key values are never read into logs.
function preferredProviderIsUsable(
  providerId: ProviderId,
  byoKeyRef: string | undefined,
  requestId: string,
): boolean {
  if (PROVIDERS[providerId].isAvailable()) return true;
  if (byoKeyRef) {
    if (Deno.env.get(byoKeyRef)) return true;
    console.warn(JSON.stringify({
      level: "WARN",
      event_type: "TTS_BYO_KEY_REF_UNRESOLVED",
      requestId,
      provider: providerId,
      // The ref NAME is safe to log; the raw key value is never read into logs.
      byoKeyRef,
      message:
        "Preferred TTS provider's platform secret is absent and its bring-your-own key ref " +
        "did not resolve to an edge secret; falling back to the default provider chain.",
    }));
  }
  return false;
}

// Build the ordered provider chain for a request:
//  1. explicit `provider` override (single provider, existing contract) — highest priority;
//  2. otherwise the user's `preferredProvider` (when usable) prepended to the default chain,
//     de-duplicated, with the default chain (azure -> gemini) always kept as fallback.
function buildChain(req: RouteTtsRequest): ProviderId[] {
  if (isProviderId(req.provider)) return [req.provider];

  const byoKeyRef = typeof req.byoKeyRef === "string" && req.byoKeyRef
    ? req.byoKeyRef
    : undefined;

  if (
    isProviderId(req.preferredProvider) &&
    preferredProviderIsUsable(req.preferredProvider, byoKeyRef, req.requestId)
  ) {
    const preferred = req.preferredProvider;
    return [preferred, ...DEFAULT_CHAIN.filter((p) => p !== preferred)];
  }

  return DEFAULT_CHAIN;
}

// Resolve the provider-specific voice id for a request. For Gemini with a tutor and no
// explicit voiceType, preserve the exact legacy tutor→voice mapping (Kore/Zephyr/etc.).
function resolveVoice(
  providerId: ProviderId,
  voiceType: VoiceType,
  explicitVoiceType: boolean,
  tutor?: TutorLike,
): string {
  if (providerId === "gemini" && !explicitVoiceType) return voiceForTutor(tutor);
  return VOICE_MAP[voiceType][providerId];
}

// Try providers in order (explicit override, else the default chain). Skips providers
// whose secrets are absent; logs and continues past per-provider failures; throws
// TtsUnavailableError when nothing served the request.
export async function routeTts(req: RouteTtsRequest): Promise<TtsResult> {
  const explicitVoiceType = isVoiceType(req.voiceType);
  const voiceType: VoiceType = explicitVoiceType
    ? req.voiceType as VoiceType
    : voiceTypeForTutor(req.tutor);

  const chain: ProviderId[] = buildChain(req);

  const attempted: ProviderId[] = [];

  for (const providerId of chain) {
    const provider = PROVIDERS[providerId];
    if (!provider.isAvailable()) continue; // missing secret = provider unavailable
    attempted.push(providerId);

    const voice = resolveVoice(providerId, voiceType, explicitVoiceType, req.tutor);
    try {
      const audio = await provider.synthesize(req.text, voice, {
        voiceType,
        tutor: req.tutor,
        requestId: req.requestId,
      });
      return { ...audio, provider: providerId, voiceType };
    } catch (e) {
      // Structured log per the observability standard; continue down the chain.
      console.error(JSON.stringify({
        level: "ERROR",
        event_type: "TTS_PROVIDER_FAILED",
        requestId: req.requestId,
        provider: providerId,
        voice,
        voiceType,
        message: String(e),
      }));
    }
  }

  throw new TtsUnavailableError(
    attempted.length === 0
      ? "No TTS provider is configured (no provider secrets present)."
      : `All available TTS providers failed (${attempted.join(", ")}).`,
    attempted,
  );
}
