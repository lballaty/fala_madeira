// File: supabase/functions/ai-gateway/index.ts
// Description: Authenticated server-side AI proxy (chat, generate-lesson, translate,
//   scenario-generator, error-analyst, tts). Renamed from `gemini` (2026-07-16) — the name was a
//   historical artifact; this is the app's general AI/voice edge, not Gemini-specific (TTS routes
//   through a provider chain: azure/google/polly/gemini).
//   Verifies the caller's Supabase JWT and enforces daily voice limits server-side. Provider
//   API keys never leave the server. Actions are selected via the `action` field in the JSON
//   body. The tts action routes through the provider adapter layer (_shared/tts/router.ts,
//   default chain azure -> gemini); when no provider is available it returns a structured
//   TTS_UNAVAILABLE error so the client can fall back to browser Web Speech.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-08

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, errorResponse, jsonResponse, newRequestId, parseTraceparent } from "../_shared/http.ts";
import { persistLog } from "../_shared/persistLog.ts";
import {
  analyzeErrors,
  generateScenario,
  generateText,
  getSystemInstruction,
  type LearnerContext,
  type TutorLike,
} from "../_shared/gemini.ts";
import { routeTts } from "../_shared/tts/router.ts";
import { TtsUnavailableError } from "../_shared/tts/types.ts";

interface ChatMessage { role: "user" | "model"; text: string }

Deno.serve(async (req) => {
  const requestId = newRequestId();
  // W3C trace context from the client (OBSERVABILITY-CONTRACT §8); null when absent.
  const trace = parseTraceparent(req.headers.get("traceparent"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Use POST.", 405, requestId);
  }

  // --- Auth: verify the caller's Supabase JWT ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return errorResponse("UNAUTHENTICATED", "You must be signed in.", 401, requestId);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON body.", 400, requestId);
  }

  const action = String(body.action ?? "");
  const tutor = body.tutor as TutorLike | undefined;

  // Learner context for level-locking + vocab reuse (see _shared/gemini.ts).
  // Accept `unlocked_level` (practical L0-L5) or `level`; known vocab and situation optional.
  const rawLevel = body.unlocked_level ?? body.level;
  const learner: LearnerContext = {
    level: typeof rawLevel === "number" ? rawLevel : undefined,
    knownVocab: Array.isArray(body.knownVocab)
      ? (body.knownVocab as unknown[]).map(String)
      : undefined,
    situationContext: body.situationContext ? String(body.situationContext) : undefined,
  };

  try {
    switch (action) {
      case "chat": {
        const history = (body.history as ChatMessage[]) ?? [];
        const contents = history.map((m) => ({
          role: m.role === "model" ? "model" : "user",
          parts: [{ text: m.text }],
        }));
        const text = await generateText({
          contents,
          systemInstruction: getSystemInstruction(tutor, Boolean(body.isHelpMode), learner),
        });
        return jsonResponse({ text, requestId });
      }

      case "scenario-generator": {
        const need = String(body.need ?? "").trim();
        if (!need) return errorResponse("BAD_REQUEST", "Missing 'need' (the real-life need in English).", 400, requestId);
        const result = await generateScenario({ need, tutor, learner });
        return jsonResponse({ result, requestId });
      }

      case "error-analyst": {
        const utterances = Array.isArray(body.utterances)
          ? (body.utterances as unknown[]).map(String).filter((s) => s.trim().length > 0)
          : [];
        if (utterances.length === 0) {
          return errorResponse("BAD_REQUEST", "Missing 'utterances' (array of recent learner utterances/mistakes).", 400, requestId);
        }
        const result = await analyzeErrors({ utterances, tutor, learner });
        return jsonResponse({ result, requestId });
      }

      case "generate-lesson": {
        const topic = String(body.topic ?? "");
        const text = await generateText({
          contents: [{
            role: "user",
            parts: [{
              text:
                `Generate a language lesson for the topic: ${topic}. Include: a catchy title; ` +
                `3 key conversational patterns with pronunciation guides; 5 essential vocabulary ` +
                `words with translations and pronunciation guides; a short practice dialogue. Format as JSON.`,
            }],
          }],
          systemInstruction: getSystemInstruction(tutor, false, learner),
          json: true,
        });
        return jsonResponse({ result: JSON.parse(text), requestId });
      }

      case "translate": {
        const word = String(body.word ?? "");
        const text = await generateText({
          contents: [{
            role: "user",
            parts: [{
              text:
                `Translate and explain the Portuguese word or phrase: "${word}". Provide: English ` +
                `translation; contextual usage in Madeira; a short example sentence in Portuguese with ` +
                `English translation. Format as JSON with keys: translation, explanation, example_pt, example_en.`,
            }],
          }],
          systemInstruction: getSystemInstruction(tutor, false, learner),
          json: true,
        });
        return jsonResponse({ result: JSON.parse(text), requestId });
      }

      case "tts": {
        const text = String(body.text ?? "");
        if (!text) return errorResponse("BAD_REQUEST", "Missing text.", 400, requestId);

        // --- Server-side voice-limit enforcement ---
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: profile, error: profileErr } = await admin
          .from("profiles")
          .select(
            "subscription_tier, voice_limit, voice_usage_today, last_voice_usage_date, " +
              "tts_provider, tts_byo_key_ref",
          )
          .eq("id", user.id)
          .single();

        // EN-27 P1.8: this read gates entitlement (tier, limit, provider). A silent failure here
        // used to drop the user to free-tier/limit-5 defaults with no trace. Fail loudly instead.
        if (profileErr) {
          await persistLog({
            level: "ERROR",
            category: "DATA_PROCESSING",
            eventType: "profile_query_failed",
            message: `could not load profile for voice-limit enforcement: ${profileErr.message}`,
            requestId,
            correlationId: requestId,
            traceId: trace?.traceId,
            userId: user.id,
            details: { action },
          });
          return errorResponse(
            "PROFILE_QUERY_FAILED",
            "Could not load your settings. Please try again.",
            500,
            requestId,
            { traceId: trace?.traceId },
          );
        }

        const today = new Date().toISOString().slice(0, 10);
        const tier = profile?.subscription_tier ?? "free";
        const unlimited = tier === "premium" || tier === "unlimited";

        if (!unlimited) {
          let usage = profile?.voice_usage_today ?? 0;
          if (profile?.last_voice_usage_date !== today) usage = 0;
          // TB-8/EN-11: limit precedence = per-user override (profiles.voice_limit)
          // -> GLOBAL default (global_settings.voice_limit, the admin-set source of truth)
          // -> hard floor 5. Previously hardcoded `?? 5`, which ignored the global 20 and
          // silently capped every user at 5 (forbidden hardcoded-fallback).
          const { data: globalRow, error: globalErr } = await admin
            .from("global_settings")
            .select("value")
            .eq("key", "voice_limit")
            .maybeSingle();
          // EN-27 P1.8: a query error here silently floors the limit to 5 (degradation is
          // acceptable — TTS should still work — but log it so the drift is visible).
          if (globalErr) {
            await persistLog({
              level: "WARN",
              category: "DATA_PROCESSING",
              eventType: "global_settings_query_failed",
              message: `could not read global voice_limit; falling back to floor: ${globalErr.message}`,
              requestId,
              correlationId: requestId,
              traceId: trace?.traceId,
              userId: user.id,
            });
          }
          const globalDefault = Number.parseInt(globalRow?.value ?? "", 10);
          const limit = profile?.voice_limit ??
            (Number.isFinite(globalDefault) ? globalDefault : 5);
          if (usage >= limit) {
            return errorResponse(
              "VOICE_LIMIT_REACHED",
              `Daily voice limit of ${limit} reached. Upgrade for unlimited practice.`,
              429,
              requestId,
              { limit, usage },
            );
          }
          const { error: usageErr } = await admin
            .from("profiles")
            .update({ voice_usage_today: usage + 1, last_voice_usage_date: today })
            .eq("id", user.id);
          // EN-27 P1.8: don't fail the request on a usage-tracking write error (the user should
          // still get audio), but log it — a silent failure here lets the daily limit drift.
          if (usageErr) {
            await persistLog({
              level: "WARN",
              category: "DATA_PROCESSING",
              eventType: "voice_usage_update_failed",
              message: `voice_usage_today increment failed; limit enforcement may drift: ${usageErr.message}`,
              requestId,
              correlationId: requestId,
              traceId: trace?.traceId,
              userId: user.id,
              details: { usage: usage + 1 },
            });
          }
        }

        // Route through the provider adapter layer (default chain: azure -> gemini).
        // The caller's stored preference (profiles.tts_provider) is prepended to the chain
        // when its platform secret is present OR its bring-your-own key ref resolves; the
        // default chain always stays as fallback and a stale ref never fails TTS (router
        // logs WARN and continues). Response stays backward-compatible with playSpeech
        // (`audio` = base64 PCM); provider+voice metadata is included so the client can
        // build its audio cache key from provider+voice (never speed) in a later step.
        const result = await routeTts({
          text,
          voiceType: body.voiceType,
          tutor,
          provider: body.provider,
          preferredProvider: profile?.tts_provider ?? undefined,
          byoKeyRef: profile?.tts_byo_key_ref ?? undefined,
          requestId,
          userId: user.id,
        });
        return jsonResponse({
          audio: result.audioBase64,
          provider: result.provider,
          voice: result.voice,
          voiceType: result.voiceType,
          mimeType: result.mimeType,
          sampleRateHz: result.sampleRateHz,
          requestId,
        });
      }

      default:
        return errorResponse("UNKNOWN_ACTION", `Unknown action: ${action}`, 400, requestId);
    }
  } catch (e) {
    if (e instanceof TtsUnavailableError) {
      // Expected degradation, not a system fault: persist as WARN and signal the client to fall
      // back to browser Web Speech.
      await persistLog({
        level: "WARN",
        category: "AI_DECISION",
        eventType: "tts_unavailable",
        message: "Server TTS unavailable; client will fall back to device speech.",
        requestId,
        correlationId: requestId,
        traceId: trace?.traceId,
        userId: user.id,
        details: { action, attempted: e.attempted },
      });
      return errorResponse(
        "TTS_UNAVAILABLE",
        "Server text-to-speech is unavailable. Falling back to device speech.",
        503,
        requestId,
        { attempted: e.attempted, traceId: trace?.traceId },
      );
    }
    // Every ERROR/CRITICAL edge event persists to public.logs (OBSERVABILITY-CONTRACT §5).
    await persistLog({
      level: "ERROR",
      category: "AI_DECISION",
      eventType: "gemini_error",
      message: String(e),
      requestId,
      correlationId: requestId,
      traceId: trace?.traceId,
      userId: user.id,
      details: { action },
    });
    return errorResponse("GEMINI_ERROR", "The AI service failed. Please try again.", 502, requestId, {
      traceId: trace?.traceId,
    });
  }
});
