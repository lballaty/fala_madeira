// File: supabase/functions/ai-gateway/voiceLimit.ts
// Description: PURE daily voice-limit decision for the ai-gateway TTS action (EN-27 Option-1 edge
//   coverage; TB-8/EN-11 logic). Given the caller's profile, the raw global_settings value, and
//   today's date, it computes tier/usage/limit/allowed with the correct precedence — per-user
//   override -> global default -> hard floor 5 — and the daily reset. Extracted from index.ts so
//   this entitlement math is unit-testable without a Deno runtime (imports nothing Deno/esm.sh).
//   The handler keeps the DB reads/writes + persistLog wiring and calls this for the decision.
// Author: EN-27 error-hardening (Option-1 edge coverage)
// Created: 2026-07-17

export interface VoiceLimitProfile {
  subscription_tier?: string | null;
  voice_limit?: number | null;
  voice_usage_today?: number | null;
  last_voice_usage_date?: string | null;
}

export interface VoiceLimitDecision {
  /** premium/unlimited tiers bypass the limit entirely. */
  unlimited: boolean;
  /** effective usage today (reset to 0 when last_voice_usage_date is not today). */
  usage: number;
  /** effective daily limit (Infinity when unlimited). */
  limit: number;
  /** whether THIS request is under the limit. */
  allowed: boolean;
  /** the value to persist to voice_usage_today when the request is allowed. */
  nextUsage: number;
}

// Hard floor when neither a per-user override nor a valid global default is present. Must never be a
// hidden hardcoded config that masks a missing source-of-truth — it is the last-resort safety cap.
export const VOICE_LIMIT_FLOOR = 5;

/**
 * Compute the voice-limit decision. `globalValueRaw` is the raw string from
 * global_settings.value for key 'voice_limit' (or null/undefined if absent/unreadable).
 */
export function resolveVoiceLimit(
  profile: VoiceLimitProfile | null,
  globalValueRaw: string | null | undefined,
  today: string,
): VoiceLimitDecision {
  const tier = profile?.subscription_tier ?? "free";
  const unlimited = tier === "premium" || tier === "unlimited";
  if (unlimited) {
    return { unlimited: true, usage: 0, limit: Infinity, allowed: true, nextUsage: 0 };
  }

  // Daily reset: yesterday's usage does not count toward today.
  let usage = profile?.voice_usage_today ?? 0;
  if (profile?.last_voice_usage_date !== today) usage = 0;

  // Precedence: per-user override -> global default -> hard floor.
  const globalDefault = Number.parseInt(globalValueRaw ?? "", 10);
  const limit = profile?.voice_limit ?? (Number.isFinite(globalDefault) ? globalDefault : VOICE_LIMIT_FLOOR);

  return { unlimited: false, usage, limit, allowed: usage < limit, nextUsage: usage + 1 };
}
