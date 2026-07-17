// File: supabase/functions/_shared/tts/routeCore.ts
// Description: PURE, runtime-agnostic core of the TTS routing decision (EN-27 Option-1 edge
//   coverage). The provider-chain build + try-each-provider loop + persist-on-failure behaviour
//   lives here with EVERY Deno/network dependency INJECTED (providers, persist, BYO-key resolver,
//   gemini voice mapper). It imports ONLY ./types.ts (interfaces + TtsUnavailableError; a type-only
//   TutorLike import that is erased), so it has NO `https://esm.sh` URL imports and NO `Deno.*`
//   globals — which means vitest (Node) can load and unit-test it. router.ts is now a thin wrapper
//   that binds these injected deps to the real Deno-bound implementations (PROVIDERS, persistLog,
//   Deno.env, gemini's voiceForTutor). This is the deleteUserData pattern applied to the router so
//   the EF-37 provider-failure/persist path finally has an OUTCOME test.
// Author: EN-27 error-hardening (Option-1 edge coverage)
// Created: 2026-07-17

import {
  isVoiceType,
  type ProviderId,
  type TtsProvider,
  type TtsResult,
  TtsUnavailableError,
  type TutorLike,
  type VoiceType,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Voice map: the ONLY place voice_type -> per-provider voice IDs are defined.
// (Moved verbatim from router.ts; see CONTENT-ARCHITECTURE §8. Azure age/register
// variety is completed by SSML prosody inside azure.ts; "phone"/"noisy" pick base
// voices — acoustic degradation is a client-side post-process.)
// ---------------------------------------------------------------------------
export const VOICE_MAP: Record<VoiceType, Record<ProviderId, string>> = {
  teacher: { azure: "pt-PT-RaquelNeural", gemini: "Kore", google: "pt-PT-Wavenet-A", elevenlabs: "21m00Tcm4TlvDq8ikWAM", openai: "nova", polly: "Ines" },
  local: { azure: "pt-PT-DuarteNeural", gemini: "Fenrir", google: "pt-PT-Wavenet-B", elevenlabs: "pNInz6obpgDQGcFmaJgB", openai: "onyx", polly: "Cristiano" },
  older: { azure: "pt-PT-FernandaNeural", gemini: "Charon", google: "pt-PT-Wavenet-C", elevenlabs: "ErXwobaYiN019PkySvjV", openai: "ash", polly: "Cristiano" },
  younger: { azure: "pt-PT-FernandaNeural", gemini: "Leda", google: "pt-PT-Wavenet-D", elevenlabs: "MF3mGyEYCl7XYWbV9V6O", openai: "shimmer", polly: "Ines" },
  service_worker: { azure: "pt-PT-DuarteNeural", gemini: "Orus", google: "pt-PT-Wavenet-B", elevenlabs: "TxGEqnHWrfWFTfGW9XjX", openai: "echo", polly: "Cristiano" },
  phone: { azure: "pt-PT-RaquelNeural", gemini: "Zephyr", google: "pt-PT-Standard-A", elevenlabs: "AZnzlk1XvdvUeBnXmlld", openai: "alloy", polly: "Ines" },
  noisy: { azure: "pt-PT-DuarteNeural", gemini: "Puck", google: "pt-PT-Standard-B", elevenlabs: "EXAVITQu4vr4xnSDxMaL", openai: "verse", polly: "Cristiano" },
};

// Default chain (TB-13): locale-pinned European-Portuguese providers FIRST (Azure/Google/Polly take
// a pt-PT locale the engine cannot override) then Gemini as the always-available steered fallback.
export const DEFAULT_CHAIN: ProviderId[] = ["azure", "google", "polly", "gemini"];

// Structural mirror of persistLog's EdgeLogInput — declared locally so this pure module never
// imports persistLog.ts (which pulls the esm.sh supabase client). The real persistLog is assignable.
export type EdgeLogLevel = "CRITICAL" | "ERROR" | "WARN";
export type EdgeLogCategory = "SYSTEM_HEALTH" | "SECURITY" | "DATA_PROCESSING" | "AI_DECISION" | "USER_ACTION";
export interface EdgeLogInputLike {
  level: EdgeLogLevel;
  category: EdgeLogCategory;
  eventType: string;
  message: string;
  requestId: string;
  correlationId?: string;
  traceId?: string;
  userId?: string | null;
  details?: Record<string, unknown>;
}

// Injected dependencies — the real router binds these to Deno-bound implementations; tests bind fakes.
export interface RouteTtsDeps {
  /** Provider registry (real = PROVIDERS from router.ts). */
  providers: Record<ProviderId, TtsProvider>;
  /** Persist an edge log row (real = persistLog). Awaited so an edge isolate can't exit mid-write. */
  persist: (input: EdgeLogInputLike) => Promise<void>;
  /** Resolve whether a bring-your-own-key ref name exists as an edge secret (real = Deno.env.get). */
  resolveByoKey: (ref: string) => boolean;
  /** Gemini tutor→voice mapping (real = voiceForTutor from gemini.ts). */
  voiceForTutor: (tutor?: TutorLike) => string;
}

export interface RouteTtsRequest {
  text: string;
  voiceType?: unknown;
  tutor?: TutorLike;
  provider?: unknown;
  preferredProvider?: unknown;
  byoKeyRef?: unknown;
  requestId: string;
  userId?: string | null;
}

const makeIsProviderId = (providers: Record<string, TtsProvider>) =>
  (v: unknown): v is ProviderId => typeof v === "string" && v in providers;

// Map a legacy tutor object to a voice_type for non-Gemini providers.
export function voiceTypeForTutor(tutor?: TutorLike): VoiceType {
  if (!tutor) return "teacher";
  if ((tutor.age ?? 0) > 40) return "older";
  return tutor.gender === "female" ? "teacher" : "local";
}

// Whether a preferred provider can serve: its platform secret is present, OR its BYO key ref
// resolves. A stale/unresolvable ref persists a WARN and returns false (falls back to the chain).
async function preferredProviderIsUsable(
  providerId: ProviderId,
  byoKeyRef: string | undefined,
  req: RouteTtsRequest,
  deps: RouteTtsDeps,
): Promise<boolean> {
  if (deps.providers[providerId].isAvailable()) return true;
  if (byoKeyRef) {
    if (deps.resolveByoKey(byoKeyRef)) return true;
    await deps.persist({
      level: "WARN",
      category: "AI_DECISION",
      eventType: "TTS_BYO_KEY_REF_UNRESOLVED",
      message:
        "Preferred TTS provider's platform secret is absent and its bring-your-own key ref " +
        "did not resolve to an edge secret; falling back to the default provider chain.",
      requestId: req.requestId,
      userId: req.userId,
      details: { provider: providerId, byoKeyRef },
    });
  }
  return false;
}

async function buildChain(req: RouteTtsRequest, deps: RouteTtsDeps): Promise<ProviderId[]> {
  const isProviderId = makeIsProviderId(deps.providers);
  if (isProviderId(req.provider)) return [req.provider];

  const byoKeyRef = typeof req.byoKeyRef === "string" && req.byoKeyRef ? req.byoKeyRef : undefined;

  if (
    isProviderId(req.preferredProvider) &&
    await preferredProviderIsUsable(req.preferredProvider, byoKeyRef, req, deps)
  ) {
    const preferred = req.preferredProvider;
    return [preferred, ...DEFAULT_CHAIN.filter((p) => p !== preferred)];
  }
  return DEFAULT_CHAIN;
}

function resolveVoice(
  providerId: ProviderId,
  voiceType: VoiceType,
  explicitVoiceType: boolean,
  deps: RouteTtsDeps,
  tutor?: TutorLike,
): string {
  if (providerId === "gemini" && !explicitVoiceType) return deps.voiceForTutor(tutor);
  return VOICE_MAP[voiceType][providerId];
}

// Try providers in order; skip unavailable ones; PERSIST + continue past a per-provider failure
// (EN-27 P0.2 — the EF-37 storm left zero queryable rows because this was console-only); throw
// TtsUnavailableError when nothing served the request.
export async function routeTtsCore(req: RouteTtsRequest, deps: RouteTtsDeps): Promise<TtsResult> {
  const explicitVoiceType = isVoiceType(req.voiceType);
  const voiceType: VoiceType = explicitVoiceType ? (req.voiceType as VoiceType) : voiceTypeForTutor(req.tutor);

  const chain = await buildChain(req, deps);
  const attempted: ProviderId[] = [];

  for (const providerId of chain) {
    const provider = deps.providers[providerId];
    if (!provider.isAvailable()) continue; // missing secret = provider unavailable
    attempted.push(providerId);

    const voice = resolveVoice(providerId, voiceType, explicitVoiceType, deps, req.tutor);
    try {
      const audio = await provider.synthesize(req.text, voice, {
        voiceType,
        tutor: req.tutor,
        requestId: req.requestId,
      });
      return { ...audio, provider: providerId, voiceType };
    } catch (e) {
      await deps.persist({
        level: "ERROR",
        category: "AI_DECISION",
        eventType: "TTS_PROVIDER_FAILED",
        message: `TTS provider '${providerId}' failed: ${String(e)}`,
        requestId: req.requestId,
        userId: req.userId,
        details: { provider: providerId, voice, voiceType, attempt: attempted.length },
      });
    }
  }

  throw new TtsUnavailableError(
    attempted.length === 0
      ? "No TTS provider is configured (no provider secrets present)."
      : `All available TTS providers failed (${attempted.join(", ")}).`,
    attempted,
  );
}
