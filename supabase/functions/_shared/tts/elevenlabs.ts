// File: supabase/functions/_shared/tts/elevenlabs.ts
// Description: ElevenLabs TTS connector (REST). Uses the multilingual v2 model with
//   output_format=pcm_24000 (raw PCM 16-bit mono 24kHz — note: PCM output requires a
//   paid ElevenLabs tier) so the payload matches the client's playback path directly.
//   Activates automatically once ELEVENLABS_API_KEY exists as an edge-function secret.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import {
  bytesToBase64,
  type TtsAudio,
  type TtsProvider,
  type TtsSynthesisOptions,
} from "./types.ts";

const BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const MODEL_ID = "eleven_multilingual_v2"; // supports European Portuguese
const OUTPUT_FORMAT = "pcm_24000";
const SAMPLE_RATE_HZ = 24000;

export const elevenLabsProvider: TtsProvider = {
  id: "elevenlabs",

  isAvailable(): boolean {
    return Boolean(Deno.env.get("ELEVENLABS_API_KEY"));
  },

  async synthesize(
    text: string,
    voice: string,
    _opts: TtsSynthesisOptions,
  ): Promise<TtsAudio> {
    const key = Deno.env.get("ELEVENLABS_API_KEY");
    if (!key) throw new Error("ElevenLabs not configured (ELEVENLABS_API_KEY missing)");

    const res = await fetch(
      `${BASE}/${voice}?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          // pt-PT hint; multilingual v2 auto-detects, this pins European Portuguese.
          language_code: "pt",
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        `ElevenLabs TTS API ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("ElevenLabs TTS returned an empty audio body");
    }

    return {
      audioBase64: bytesToBase64(bytes),
      mimeType: `audio/pcm;rate=${SAMPLE_RATE_HZ}`,
      sampleRateHz: SAMPLE_RATE_HZ,
      voice,
    };
  },
};
