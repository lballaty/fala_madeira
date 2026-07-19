// File: supabase/functions/audio-warm/index.ts
// Description: EN-34 audio-warm edge function (Deno.serve glue). A service/cron endpoint that, per
//   tick: (1) DRAINS the tts_audio_regen_queue FIRST — re-synthesizes each pending (text, voice),
//   hosts it at generation+1 (busting every cache layer), upserts the tts_audio_hosted manifest, and
//   marks the queue row done; then (2) warms NEW un-hosted curated clips in priority order
//   (onboarding -> level 0 -> higher levels), enumerated from public.situations payloads + the
//   onboarding corpus, skipping keys already in the manifest. Rate-limit-aware: on consecutive
//   provider-unavailable/429 synths it STOPS the batch cleanly (partial progress is preserved by
//   idempotency) instead of hammering a throttled provider. Emits a heartbeat + summary to
//   public.logs (via persistLog) and returns the canonical errorResponse/jsonResponse envelope.
//
//   IDEMPOTENCY: host-then-mark-done is NOT atomic, so a re-run after a partial failure (manifest
//   upsert landed, mark-done did not) must not bump a generation twice. Before re-hosting a still-
//   pending regen row, the drain checks the manifest entry's hosted_at against the row's enqueued_at
//   (pure isAlreadyFulfilled): if the clip was already re-hosted AFTER this enqueue, the row is
//   treated as already fulfilled — no synth/host/bump, just complete the mark-done. New clips are
//   skipped when already present in the manifest. A re-run is therefore safe (no double-bump).
//
//   ALL warm DECISIONS live in the PURE, unit-tested ./_core.ts (linesForSituationCore mirror,
//   planWarmWork, shouldStopForRateLimit, mergeTiersCore). This file is glue only and is covered by
//   an agentic code review (EN-34 step w2), NOT a Deno test harness. NO hardcoded fallback URLs/keys.
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, errorResponse, jsonResponse, newRequestId, parseTraceparent } from "../_shared/http.ts";
import { persistLog } from "../_shared/persistLog.ts";
import { buildKey, keyToServerPath } from "../_shared/audioKey.ts";
import { uploadTtsClip } from "../_shared/audioStore.ts";
import { routeTts } from "../_shared/tts/router.ts";
import { TtsUnavailableError } from "../_shared/tts/types.ts";
import {
  type HostedEntry,
  isAlreadyFulfilled,
  linesForSituationCore,
  mergeTiersCore,
  type NewCandidate,
  planWarmWork,
  type RegenItem,
  type SituationShape,
  shouldStopForRateLimit,
} from "./_core.ts";

// Hosted-manifest table + tier label (EN-34 migration 00016).
const HOSTED_TABLE = "tts_audio_hosted";
const REGEN_TABLE = "tts_audio_regen_queue";
const BUCKET_TIER = "bucket";

// Default clips to attempt per tick (regen + new share this budget). Bounded so one run never
// synthesizes an unbounded number of paid-provider calls; the cron re-invokes to make progress.
const DEFAULT_MAX = 15;
const MAX_CEILING = 100;

// ---------------------------------------------------------------------------
// ONBOARDING_CORPUS — MIRROR of src/content/onboardingCorpus.ts (the Deno fn cannot import the
// browser module, same lockstep rationale as _shared/audioKey.ts). Alignment Refinement B: the
// panel, the pregen CLI, and this warm fn must all enumerate onboarding from ONE definition. This
// duplicate is intentionally the ONE place the Deno side reads; extend it in lockstep with the
// browser corpus when owner-confirmed onboarding phrases are added. The seed clip is the first-win
// greeting at the default 'teacher' voice (the only clip onboarding speaks today).
// KEEP IN LOCKSTEP with src/content/onboardingCorpus.ts ONBOARDING_CORPUS.
// ---------------------------------------------------------------------------
const ONBOARDING_CORPUS: { text: string; voiceType: string }[] = [
  { text: "Bom dia!", voiceType: "teacher" },
];

// resolveVoice mirror (src/lib/voiceType.ts): an explicit voice_type wins; otherwise the app-default
// tutor voice 'teacher' (no tutor context on the warm path). Kept trivial + local.
const resolveVoiceCore = (voiceType?: string): string => voiceType || "teacher";

interface RegenRow {
  id: string;
  build_key: string;
  voice: string;
  text: string;
  enqueued_at: string;
}

interface SituationRow {
  payload: SituationShape | null;
  level: number | null;
}

// Rate-limit / provider-unavailable classification. TtsUnavailableError is the router's explicit
// no-provider signal; a message carrying a 429/503/"rate"/"quota" marker is treated the same so a
// throttled provider triggers the clean stop rather than a hard-fail loop.
const isRateLimitLike = (e: unknown): boolean => {
  if (e instanceof TtsUnavailableError) return true;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /\b429\b|\b503\b|rate.?limit|quota|too many requests|unavailable/.test(msg);
};

Deno.serve(async (req) => {
  const requestId = newRequestId();
  const trace = parseTraceparent(req.headers.get("traceparent"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Use POST.", 405, requestId);
  }

  // --- Config (fail loud; NO hardcoded fallback) ---
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return errorResponse(
      "EDGE_MISCONFIGURED",
      "Audio-warm is not configured (missing service credentials).",
      500,
      requestId,
      { traceId: trace?.traceId },
    );
  }

  // --- Access control ---------------------------------------------------------------------------
  // This is a service/cron endpoint, NOT a user endpoint. It must present either the service-role
  // key, or a dedicated AUDIO_WARM_SECRET, in the Authorization header ("Bearer <secret>"). Prefer
  // the dedicated secret when configured (least-privilege: the scheduler need not hold the full
  // service-role key); otherwise accept the service-role key. Anything else is 401. No user JWT path.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const warmSecret = Deno.env.get("AUDIO_WARM_SECRET");
  const authorized = warmSecret
    ? (bearer === warmSecret || bearer === serviceKey)
    : bearer === serviceKey;
  if (!authorized) {
    await persistLog({
      level: "WARN",
      category: "SECURITY",
      eventType: "audio_warm_unauthorized",
      message: "audio-warm rejected a request with a missing/invalid service credential.",
      requestId,
      correlationId: requestId,
      traceId: trace?.traceId,
    });
    return errorResponse("UNAUTHORIZED", "Not authorized.", 401, requestId, { traceId: trace?.traceId });
  }

  // --- Parse max (query or body), clamp to a sane ceiling ---
  const url = new URL(req.url);
  let bodyMax: unknown;
  try {
    const body = req.headers.get("content-type")?.includes("application/json")
      ? await req.json()
      : {};
    bodyMax = (body as Record<string, unknown>)?.max;
  } catch {
    bodyMax = undefined;
  }
  const rawMax = url.searchParams.get("max") ?? bodyMax;
  const parsedMax = Number(rawMax);
  const maxPerRun = Number.isFinite(parsedMax) && parsedMax > 0
    ? Math.min(Math.floor(parsedMax), MAX_CEILING)
    : DEFAULT_MAX;

  const admin = createClient(supabaseUrl, serviceKey);
  const logCtx = { requestId, correlationId: requestId, traceId: trace?.traceId, userId: null as string | null };

  // Running summary (also the response body + heartbeat details).
  const summary = {
    attempted: 0,
    synthesized: 0,
    uploaded: 0,
    skipped: 0,
    regen_drained: 0,
    errors: 0,
    stop_reason: "complete" as string,
    max: maxPerRun,
  };

  // Helper: persist a WARN + count an error, never leaking a raw db message to the response.
  const noteError = async (eventType: string, message: string, details?: Record<string, unknown>) => {
    summary.errors++;
    await persistLog({
      level: "WARN",
      category: "DATA_PROCESSING",
      eventType,
      message,
      ...logCtx,
      details,
    });
  };

  try {
    // --- 1. Read pending regen rows (budget-limited) ---
    const { data: regenData, error: regenErr } = await admin
      .from(REGEN_TABLE)
      .select("id, build_key, voice, text, enqueued_at")
      .eq("status", "pending")
      .order("enqueued_at", { ascending: true })
      .limit(maxPerRun);
    if (regenErr) {
      await noteError("audio_warm_regen_read_failed", `could not read regen queue: ${regenErr.message}`);
      return errorResponse("REGEN_READ_FAILED", "Could not read the regeneration queue.", 500, requestId, { traceId: trace?.traceId });
    }
    const pendingRegen: RegenItem[] = (regenData as RegenRow[] | null ?? []).map((r) => ({
      id: r.id,
      buildKey: r.build_key,
      voice: r.voice,
      text: r.text,
      enqueuedAt: r.enqueued_at,
    }));

    // --- 2. Read the hosted manifest into a build_key -> {generation, tiers} map ---
    const { data: hostedData, error: hostedErr } = await admin
      .from(HOSTED_TABLE)
      .select("build_key, generation, tiers, hosted_at");
    if (hostedErr) {
      await noteError("audio_warm_manifest_read_failed", `could not read hosted manifest: ${hostedErr.message}`);
      return errorResponse("MANIFEST_READ_FAILED", "Could not read the hosted-audio manifest.", 500, requestId, { traceId: trace?.traceId });
    }
    const hostedByKey = new Map<string, HostedEntry>();
    for (const row of (hostedData as { build_key: string; generation: number; tiers: string[] | null; hosted_at: string | null }[] | null ?? [])) {
      hostedByKey.set(row.build_key, { generation: row.generation, tiers: row.tiers ?? [], hostedAt: row.hosted_at });
    }

    // --- 3. Enumerate NEW candidates in priority order: onboarding, then level asc ---
    const newCandidates: NewCandidate[] = [];
    const seenNames = new Set<string>();
    const pushCandidate = (text: string, voiceType?: string) => {
      const voice = resolveVoiceCore(voiceType);
      const key = buildKey("default", voice, text);
      const objectName = keyToServerPath(key); // generation 1 identity
      if (seenNames.has(objectName)) return;
      seenNames.add(objectName);
      newCandidates.push({ buildKey: key, voice, text, objectName });
    };
    // Onboarding first (highest priority).
    for (const clip of ONBOARDING_CORPUS) pushCandidate(clip.text, clip.voiceType);
    // Then DB content, level ascending.
    const { data: sitData, error: sitErr } = await admin
      .from("situations")
      .select("payload, level")
      .order("level", { ascending: true });
    if (sitErr) {
      // Non-fatal: onboarding + regen can still make progress. Log + continue.
      await noteError("audio_warm_situations_read_failed", `could not read situations for new-clip warm: ${sitErr.message}`);
    } else {
      for (const row of (sitData as SituationRow[] | null ?? [])) {
        if (!row.payload) continue;
        for (const line of linesForSituationCore(row.payload)) {
          pushCandidate(line.text, line.voiceType);
        }
      }
    }

    // --- 4. Plan the work (regen-first, budget-bounded, hosted-deduped) — PURE core ---
    const { regenWork, newWork } = planWarmWork({ pendingRegen, hostedByKey, newCandidates, maxPerRun });

    // --- 5a. Drain regen FIRST: re-synthesize -> host at generation+1 -> upsert manifest -> mark done ---
    let consecutiveRateLimited = 0;
    for (const item of regenWork) {
      // IDEMPOTENCY GUARD (EN-34 double-bump fix). Host-then-mark-done is NOT atomic: if a prior
      // run's manifest upsert landed (bumping the generation + setting hosted_at=now) but its
      // "mark row done" UPDATE then failed, the row is still 'pending' and we would re-read it here.
      // Re-synthesizing + bumping again would burn a SECOND generation for ONE enqueue. The manifest
      // entry's hosted_at proves the state: if it is NEWER than this row's enqueued_at, the clip was
      // already re-hosted to satisfy THIS enqueue, so treat the row as already fulfilled — skip the
      // synth/host/bump and only complete the mark-done. hosted_at <= enqueued_at (or no manifest
      // entry) means this enqueue still needs a fresh bump, so we fall through to the normal path.
      const existing = hostedByKey.get(item.buildKey);
      if (isAlreadyFulfilled(existing?.hostedAt, item.enqueuedAt)) {
        const { error: doneErr } = await admin
          .from(REGEN_TABLE)
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("id", item.id);
        if (doneErr) {
          await noteError("audio_warm_regen_mark_done_failed", `could not mark already-hosted regen row done: ${doneErr.message}`, { id: item.id });
        } else {
          summary.regen_drained++;
        }
        continue;
      }
      summary.attempted++;
      try {
        const result = await routeTts({
          text: item.text,
          voiceType: item.voice,
          provider: "default",
          requestId,
          userId: null,
        });
        consecutiveRateLimited = 0;
        summary.synthesized++;
        const current = hostedByKey.get(item.buildKey);
        const newGen = (current?.generation ?? 1) + 1; // bump from current gen; guarded above against re-bump
        const objectName = keyToServerPath(item.buildKey, newGen);
        await uploadTtsClip(objectName, result.audioBase64, logCtx);
        summary.uploaded++;
        const tiers = mergeTiersCore(current?.tiers, BUCKET_TIER);
        const hostedAt = new Date().toISOString();
        const { error: upErr } = await admin
          .from(HOSTED_TABLE)
          .upsert({ build_key: item.buildKey, generation: newGen, object_name: objectName, hosted_at: hostedAt, tiers }, { onConflict: "build_key" });
        if (upErr) {
          await noteError("audio_warm_manifest_upsert_failed", `regen manifest upsert failed: ${upErr.message}`, { build_key: item.buildKey });
          continue; // leave the queue row pending so a later run retries; no double-bump risk (manifest unchanged)
        }
        // Reflect the bump locally so a duplicate key later in this run is treated as hosted, and so
        // the idempotency guard sees hosted_at > enqueued_at if this same row is revisited this run.
        hostedByKey.set(item.buildKey, { generation: newGen, tiers, hostedAt });
        const { error: doneErr } = await admin
          .from(REGEN_TABLE)
          .update({ status: "done", completed_at: new Date().toISOString() })
          .eq("id", item.id);
        if (doneErr) {
          await noteError("audio_warm_regen_mark_done_failed", `could not mark regen row done: ${doneErr.message}`, { id: item.id });
        } else {
          summary.regen_drained++;
        }
      } catch (e) {
        if (isRateLimitLike(e)) {
          consecutiveRateLimited++;
          if (shouldStopForRateLimit(consecutiveRateLimited)) {
            summary.stop_reason = "rate_limited";
            await noteError("audio_warm_rate_limited_stop", "audio-warm stopped early after consecutive rate-limited/unavailable synths (regen phase).", { phase: "regen" });
            return await finish();
          }
          continue;
        }
        await noteError("audio_warm_regen_synth_failed", `regen synth failed: ${e instanceof Error ? e.message : String(e)}`, { build_key: item.buildKey });
      }
    }

    // --- 5b. Warm NEW clips: generation 1, skip if already hosted, host at legacy name, upsert manifest ---
    for (const cand of newWork) {
      if (hostedByKey.has(cand.buildKey)) {
        summary.skipped++;
        continue;
      }
      summary.attempted++;
      try {
        const result = await routeTts({
          text: cand.text,
          voiceType: cand.voice,
          provider: "default",
          requestId,
          userId: null,
        });
        consecutiveRateLimited = 0;
        summary.synthesized++;
        await uploadTtsClip(cand.objectName, result.audioBase64, logCtx);
        summary.uploaded++;
        const tiers = mergeTiersCore([], BUCKET_TIER);
        const { error: upErr } = await admin
          .from(HOSTED_TABLE)
          .upsert({ build_key: cand.buildKey, generation: 1, object_name: cand.objectName, hosted_at: new Date().toISOString(), tiers }, { onConflict: "build_key" });
        if (upErr) {
          await noteError("audio_warm_manifest_upsert_failed", `new-clip manifest upsert failed: ${upErr.message}`, { build_key: cand.buildKey });
          continue;
        }
        hostedByKey.set(cand.buildKey, { generation: 1, tiers });
      } catch (e) {
        if (isRateLimitLike(e)) {
          consecutiveRateLimited++;
          if (shouldStopForRateLimit(consecutiveRateLimited)) {
            summary.stop_reason = "rate_limited";
            await noteError("audio_warm_rate_limited_stop", "audio-warm stopped early after consecutive rate-limited/unavailable synths (new-clip phase).", { phase: "new" });
            return await finish();
          }
          continue;
        }
        await noteError("audio_warm_new_synth_failed", `new-clip synth failed: ${e instanceof Error ? e.message : String(e)}`, { build_key: cand.buildKey });
      }
    }

    return await finish();
  } catch (e) {
    // Unexpected fault: persist + canonical envelope (never a raw string/500 body).
    await persistLog({
      level: "ERROR",
      category: "SYSTEM_HEALTH",
      eventType: "audio_warm_run",
      message: `audio-warm run failed: ${e instanceof Error ? e.message : String(e)}`,
      ...logCtx,
      details: { ...summary, stop_reason: "error" },
    });
    return errorResponse("AUDIO_WARM_FAILED", "The audio warm run failed.", 500, requestId, { traceId: trace?.traceId });
  }

  // Heartbeat + summary. persistLog's EdgeLogLevel is CRITICAL|ERROR|WARN (no INFO) — so a run with
  // errors or an early stop logs WARN; a fully-clean run (the common case) still needs a heartbeat, so
  // it also uses WARN (the lowest level persistLog supports) with a healthy summary. This matches the
  // codebase: persistLog is the only public.logs writer and INFO is not in its union.
  async function finish(): Promise<Response> {
    const healthy = summary.errors === 0 && summary.stop_reason === "complete";
    await persistLog({
      level: "WARN",
      category: healthy ? "DATA_PROCESSING" : "SYSTEM_HEALTH",
      eventType: "audio_warm_run",
      message: healthy
        ? `audio-warm complete: ${summary.regen_drained} regen drained, ${summary.synthesized} synthesized, ${summary.uploaded} uploaded.`
        : `audio-warm finished with issues (stop_reason=${summary.stop_reason}, errors=${summary.errors}).`,
      ...logCtx,
      details: { ...summary },
    });
    return jsonResponse({ ok: true, requestId, ...summary });
  }
});
