// File: supabase/functions/_shared/tts/openai.ts
// Description: OpenAI TTS connector (REST, /v1/audio/speech). Uses response_format=pcm,
//   which is raw 24kHz 16-bit mono little-endian PCM — a direct match for the client's
//   playback path. Voices are language-agnostic; pt-PT pronunciation comes from the text.
//   Activates automatically once OPENAI_API_KEY exists as an edge-function secret.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import {
  bytesToBase64,
  type TtsAudio,
  type TtsProvider,
  type TtsSynthesisOptions,
} from "./types.ts";

const ENDPOINT = "https://api.openai.com/v1/audio/speech";
const MODEL = "gpt-4o-mini-tts";
const SAMPLE_RATE_HZ = 24000; // response_format=pcm is fixed at 24kHz s16le mono.

export const openAiProvider: TtsProvider = {
  id: "openai",

  isAvailable(): boolean {
    return Boolean(Deno.env.get("OPENAI_API_KEY"));
  },

  async synthesize(
    text: string,
    voice: string,
    _opts: TtsSynthesisOptions,
  ): Promise<TtsAudio> {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("OpenAI TTS not configured (OPENAI_API_KEY missing)");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: text,
        voice,
        response_format: "pcm",
      }),
    });

    if (!res.ok) {
      throw new Error(
        `OpenAI TTS API ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("OpenAI TTS returned an empty audio body");
    }

    return {
      audioBase64: bytesToBase64(bytes),
      mimeType: `audio/pcm;rate=${SAMPLE_RATE_HZ}`,
      sampleRateHz: SAMPLE_RATE_HZ,
      voice,
    };
  },
};
