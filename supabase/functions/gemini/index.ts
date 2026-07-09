// File: supabase/functions/gemini/index.ts
// Description: Authenticated server-side proxy for all Gemini access (chat, generate-lesson,
//   translate, tts). Verifies the caller's Supabase JWT and enforces daily voice limits
//   server-side. The GEMINI_API_KEY never leaves the server. Actions are selected via the
//   `action` field in the JSON body.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-08

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, errorResponse, jsonResponse, newRequestId } from "../_shared/http.ts";
import {
  generateText,
  generateTts,
  getSystemInstruction,
  type TutorLike,
} from "../_shared/gemini.ts";

interface ChatMessage { role: "user" | "model"; text: string }

Deno.serve(async (req) => {
  const requestId = newRequestId();

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
          systemInstruction: getSystemInstruction(tutor, Boolean(body.isHelpMode)),
        });
        return jsonResponse({ text, requestId });
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
          systemInstruction: getSystemInstruction(tutor),
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
          systemInstruction: getSystemInstruction(tutor),
          json: true,
        });
        return jsonResponse({ result: JSON.parse(text), requestId });
      }

      case "tts": {
        const text = String(body.text ?? "");
        if (!text) return errorResponse("BAD_REQUEST", "Missing text.", 400, requestId);

        // --- Server-side voice-limit enforcement ---
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: profile } = await admin
          .from("profiles")
          .select("subscription_tier, voice_limit, voice_usage_today, last_voice_usage_date")
          .eq("id", user.id)
          .single();

        const today = new Date().toISOString().slice(0, 10);
        const tier = profile?.subscription_tier ?? "free";
        const unlimited = tier === "premium" || tier === "unlimited";

        if (!unlimited) {
          let usage = profile?.voice_usage_today ?? 0;
          if (profile?.last_voice_usage_date !== today) usage = 0;
          const limit = profile?.voice_limit ?? 5;
          if (usage >= limit) {
            return errorResponse(
              "VOICE_LIMIT_REACHED",
              `Daily voice limit of ${limit} reached. Upgrade for unlimited practice.`,
              429,
              requestId,
              { limit, usage },
            );
          }
          await admin
            .from("profiles")
            .update({ voice_usage_today: usage + 1, last_voice_usage_date: today })
            .eq("id", user.id);
        }

        const audio = await generateTts(text, tutor);
        return jsonResponse({ audio, requestId });
      }

      default:
        return errorResponse("UNKNOWN_ACTION", `Unknown action: ${action}`, 400, requestId);
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "ERROR", requestId, userId: user.id, action, message: String(e) }));
    return errorResponse("GEMINI_ERROR", "The AI service failed. Please try again.", 502, requestId);
  }
});
