// File: supabase/functions/_shared/tts/polly.ts
// Description: Amazon Polly TTS connector. Uses aws4fetch (esm.sh) for SigV4 request
//   signing against the Polly REST endpoint. Polly's PCM output tops out at 16kHz, so
//   this connector reports sampleRateHz=16000 in its metadata — the client must honor
//   the reported rate rather than assuming 24kHz (metadata is included for that reason).
//   pt-PT voices: Ines (neural + standard), Cristiano (standard only). Activates once
//   AWS_POLLY_ACCESS_KEY_ID + AWS_POLLY_SECRET_ACCESS_KEY + AWS_POLLY_REGION exist as
//   edge-function secrets.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import {
  bytesToBase64,
  type TtsAudio,
  type TtsProvider,
  type TtsSynthesisOptions,
} from "./types.ts";

const SAMPLE_RATE_HZ = 16000; // Polly PCM maximum.

// Only Ines has a neural variant among the pt-PT voices.
function engineFor(voice: string): "neural" | "standard" {
  return voice === "Ines" ? "neural" : "standard";
}

export const pollyProvider: TtsProvider = {
  id: "polly",

  // All three settings are required; any missing value means unavailable — never
  // substitute a hardcoded region or credentials.
  isAvailable(): boolean {
    return Boolean(
      Deno.env.get("AWS_POLLY_ACCESS_KEY_ID") &&
        Deno.env.get("AWS_POLLY_SECRET_ACCESS_KEY") &&
        Deno.env.get("AWS_POLLY_REGION"),
    );
  },

  async synthesize(
    text: string,
    voice: string,
    _opts: TtsSynthesisOptions,
  ): Promise<TtsAudio> {
    const accessKeyId = Deno.env.get("AWS_POLLY_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("AWS_POLLY_SECRET_ACCESS_KEY");
    const region = Deno.env.get("AWS_POLLY_REGION");
    if (!accessKeyId || !secretAccessKey || !region) {
      throw new Error(
        "Polly not configured (AWS_POLLY_ACCESS_KEY_ID / AWS_POLLY_SECRET_ACCESS_KEY / AWS_POLLY_REGION missing)",
      );
    }

    const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "polly" });
    const res = await aws.fetch(
      `https://polly.${region}.amazonaws.com/v1/speech`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          OutputFormat: "pcm",
          SampleRate: String(SAMPLE_RATE_HZ),
          Text: text,
          TextType: "text",
          VoiceId: voice,
          Engine: engineFor(voice),
          LanguageCode: "pt-PT",
        }),
      },
    );

    if (!res.ok) {
      throw new Error(
        `Polly TTS API ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("Polly TTS returned an empty audio body");
    }

    return {
      audioBase64: bytesToBase64(bytes),
      mimeType: `audio/pcm;rate=${SAMPLE_RATE_HZ}`,
      sampleRateHz: SAMPLE_RATE_HZ,
      voice,
    };
  },
};
