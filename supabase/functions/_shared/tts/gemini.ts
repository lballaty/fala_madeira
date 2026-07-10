// File: supabase/functions/_shared/tts/gemini.ts
// Description: Gemini TTS connector for the provider adapter layer. This is the EXISTING
//   hardened Gemini TTS implementation MOVED (not rewritten) from _shared/gemini.ts —
//   including the validation + retry loop for the documented intermittent
//   finishReason="OTHER" empty-audio defect. Serves as the fallback in the default chain
//   (azure -> gemini) and is the effective default until the Azure key is configured.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import {
  type TtsAudio,
  type TtsProvider,
  type TtsSynthesisOptions,
  type TutorLike,
} from "./types.ts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const SAMPLE_RATE_HZ = 24000; // Gemini TTS returns base64 PCM 24kHz mono s16le.

// Legacy tutor→voice mapping preserved from the pre-adapter implementation so clients
// that send only a tutor (no explicit voiceType) keep the exact same voices.
export function voiceForTutor(tutor?: TutorLike): string {
  if (!tutor) return "Kore";
  if (tutor.gender === "female") return (tutor.age ?? 0) > 40 ? "Zephyr" : "Kore";
  return (tutor.age ?? 0) > 40 ? "Charon" : "Fenrir";
}

// Number of attempts for the documented intermittent-empty-audio defect (see below).
const TTS_MAX_ATTEMPTS = 4;

// Generate TTS audio, returns base64 PCM (24kHz mono s16le) as the app expects.
//
// KNOWN UPSTREAM DEFECT: Gemini TTS preview models (2.5-flash, 2.5-pro, 3.1-flash)
// intermittently return HTTP 200 with finishReason="OTHER" and NO inlineData audio,
// even though usageMetadata bills audio tokens. Documented at
// https://github.com/google-gemini/cookbook/issues/1231 and the Google AI dev forum.
// Measured behaviour (2026-07-09): the failure rate is strongly RATE-correlated — it acts
// like a soft rate-limit surfaced as 200+OTHER rather than 429. At ~2.5s spacing all three
// TTS models return audio 6/6; under rapid bursts (~1s) the same request fails ~75-100%.
// Real usage (spaced clicks, sequential playback, IndexedDB cache) rarely hits it.
// Google's recommended handling: don't trust HTTP 200 — require finishReason STOP + present
// audio and retry. Backoff is deliberately long (approaching the ~2s that measures 100%) so
// retries clear the soft-throttle rather than re-triggering it. Input is plain text.
async function generateTtsHardened(text: string, voiceName: string): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured in edge-function secrets");

  let lastReason = "unknown";
  for (let attempt = 1; attempt <= TTS_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/${TTS_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      }),
    });

    // Genuine transport/quota errors are not the empty-audio defect — surface immediately.
    if (!res.ok) {
      throw new Error(`Gemini TTS API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const audio = candidate?.content?.parts?.[0]?.inlineData?.data;
    lastReason = candidate?.finishReason ?? "noFinishReason";

    // Valid only when the model stopped normally AND actually returned audio.
    if (lastReason === "STOP" && audio) return audio;

    // Intermittent empty result — back off briefly and retry the identical request.
    if (attempt < TTS_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw new Error(`Gemini TTS returned no audio after ${TTS_MAX_ATTEMPTS} attempts (last finishReason=${lastReason})`);
}

export const geminiProvider: TtsProvider = {
  id: "gemini",

  isAvailable(): boolean {
    return Boolean(Deno.env.get("GEMINI_API_KEY"));
  },

  async synthesize(
    text: string,
    voice: string,
    _opts: TtsSynthesisOptions,
  ): Promise<TtsAudio> {
    const audioBase64 = await generateTtsHardened(text, voice);
    return {
      audioBase64,
      mimeType: `audio/pcm;rate=${SAMPLE_RATE_HZ}`,
      sampleRateHz: SAMPLE_RATE_HZ,
      voice,
    };
  },
};
