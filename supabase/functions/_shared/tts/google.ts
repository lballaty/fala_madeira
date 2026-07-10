// File: supabase/functions/_shared/tts/google.ts
// Description: Google Cloud Text-to-Speech connector (REST, API-key auth). Requests
//   LINEAR16 at 24kHz mono; the response is a WAV container, so the 44-byte RIFF header
//   is stripped to yield the raw PCM s16le payload the client's playback path expects.
//   Activates automatically once GOOGLE_TTS_API_KEY exists as an edge-function secret.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import {
  bytesToBase64,
  type TtsAudio,
  type TtsProvider,
  type TtsSynthesisOptions,
} from "./types.ts";

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const SAMPLE_RATE_HZ = 24000;
// Standard RIFF/WAVE header emitted by Cloud TTS for LINEAR16 (PCM fmt chunk, no extras).
const WAV_HEADER_BYTES = 44;

export const googleProvider: TtsProvider = {
  id: "google",

  isAvailable(): boolean {
    return Boolean(Deno.env.get("GOOGLE_TTS_API_KEY"));
  },

  async synthesize(
    text: string,
    voice: string,
    _opts: TtsSynthesisOptions,
  ): Promise<TtsAudio> {
    const key = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!key) throw new Error("Google TTS not configured (GOOGLE_TTS_API_KEY missing)");

    const res = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "pt-PT", name: voice },
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: SAMPLE_RATE_HZ,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Google TTS API ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }

    const data = await res.json();
    const b64: string | undefined = data?.audioContent;
    if (!b64) throw new Error("Google TTS returned no audioContent");

    // Decode, strip the WAV header, re-encode as raw PCM for the client.
    const wav = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (wav.length <= WAV_HEADER_BYTES) {
      throw new Error("Google TTS returned an implausibly small audio payload");
    }
    const pcm = wav.subarray(WAV_HEADER_BYTES);

    return {
      audioBase64: bytesToBase64(pcm),
      mimeType: `audio/pcm;rate=${SAMPLE_RATE_HZ}`,
      sampleRateHz: SAMPLE_RATE_HZ,
      voice,
    };
  },
};
