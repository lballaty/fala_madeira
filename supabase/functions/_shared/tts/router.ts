// File: supabase/functions/_shared/tts/router.ts
// Description: TTS provider registry + the Deno-bound wiring for TTS routing. The ROUTING DECISION
//   (chain build, try-each-provider loop, persist-on-failure) lives in the pure, unit-tested
//   ./routeCore.ts; this file is the thin wrapper that binds routeCore's injected dependencies to
//   the real Deno implementations: the provider registry (PROVIDERS), the edge logger (persistLog),
//   the BYO-key resolver (Deno.env.get), and gemini's tutor→voice mapping. Keeping the Deno/esm.sh
//   surface here (and the testable logic in routeCore) is what lets vitest cover the EF-37
//   provider-failure/persist path without a Deno runtime. NO hardcoded fallback keys or URLs.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09
// Updated: 2026-07-17 (EN-27 — routing decision extracted to routeCore.ts for test coverage)

import type { ProviderId, TtsProvider, TtsResult } from "./types.ts";
import { persistLog } from "../persistLog.ts";
import { azureProvider } from "./azure.ts";
import { geminiProvider, voiceForTutor } from "./gemini.ts";
import { googleProvider } from "./google.ts";
import { elevenLabsProvider } from "./elevenlabs.ts";
import { openAiProvider } from "./openai.ts";
import { pollyProvider } from "./polly.ts";
import { type RouteTtsDeps, type RouteTtsRequest, routeTtsCore } from "./routeCore.ts";

// Re-export the pure surface so existing importers keep working unchanged.
export { DEFAULT_CHAIN, VOICE_MAP, voiceTypeForTutor } from "./routeCore.ts";
export type { RouteTtsRequest } from "./routeCore.ts";

// Registry of every connector (activation is purely secret-presence, per provider).
const PROVIDERS: Record<ProviderId, TtsProvider> = {
  azure: azureProvider,
  gemini: geminiProvider,
  google: googleProvider,
  elevenlabs: elevenLabsProvider,
  openai: openAiProvider,
  polly: pollyProvider,
};

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && v in PROVIDERS;
}

// The real, Deno-bound dependency bundle handed to the pure routing core.
const liveDeps: RouteTtsDeps = {
  providers: PROVIDERS,
  persist: persistLog,
  resolveByoKey: (ref: string) => !!Deno.env.get(ref),
  voiceForTutor,
};

// Public entry (unchanged signature). Delegates the decision to the pure, unit-tested core.
export function routeTts(req: RouteTtsRequest): Promise<TtsResult> {
  return routeTtsCore(req, liveDeps);
}
