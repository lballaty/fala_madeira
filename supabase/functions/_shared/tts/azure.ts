// File: supabase/functions/_shared/tts/azure.ts
// Description: Azure Speech (Cognitive Services) TTS connector — the decided DEFAULT
//   provider for FalaMadeira (AGENTS.md §5: Azure pt-PT + browser Web Speech fallback).
//   Uses the REST synthesis endpoint with SSML, pt-PT neural voices, and the
//   raw-24khz-16bit-mono-pcm output format so the payload matches the client's existing
//   PCM 24kHz mono s16le playback path exactly. Voice variety beyond the three pt-PT
//   neural voices is realized with SSML prosody per voice_type. Activates automatically
//   once AZURE_SPEECH_KEY + AZURE_SPEECH_REGION exist as edge-function secrets.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import {
  bytesToBase64,
  type TtsAudio,
  type TtsProvider,
  type TtsSynthesisOptions,
  type VoiceType,
} from "./types.ts";

// Raw PCM matching the client decoder (no container to strip).
const OUTPUT_FORMAT = "raw-24khz-16bit-mono-pcm";
const SAMPLE_RATE_HZ = 24000;

// Prosody shaping per voice_type. Azure ships only three pt-PT neural voices
// (Raquel/Duarte/Fernanda), so age/register variety is approximated with rate/pitch.
// "phone"/"noisy" use a plain base voice — acoustic degradation is client-side (later step).
const PROSODY: Record<VoiceType, { rate?: string; pitch?: string }> = {
  teacher: { rate: "-10%" }, // slower, clearest articulation
  local: {}, // natural default delivery
  older: { rate: "-15%", pitch: "-8%" },
  younger: { rate: "+8%", pitch: "+10%" },
  service_worker: { rate: "+12%" }, // brisk counter-service delivery
  phone: {},
  noisy: {},
};

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSsml(text: string, voice: string, voiceType: VoiceType): string {
  const p = PROSODY[voiceType] ?? {};
  const attrs = [
    p.rate ? `rate="${p.rate}"` : "",
    p.pitch ? `pitch="${p.pitch}"` : "",
  ].filter(Boolean).join(" ");
  const inner = attrs
    ? `<prosody ${attrs}>${escapeXml(text)}</prosody>`
    : escapeXml(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-PT">` +
    `<voice name="${voice}">${inner}</voice></speak>`;
}

export const azureProvider: TtsProvider = {
  id: "azure",

  // Both the key and the region must be configured; a missing value means unavailable —
  // never substitute a hardcoded region/endpoint (centralized error-handling standard).
  isAvailable(): boolean {
    return Boolean(
      Deno.env.get("AZURE_SPEECH_KEY") && Deno.env.get("AZURE_SPEECH_REGION"),
    );
  },

  async synthesize(
    text: string,
    voice: string,
    opts: TtsSynthesisOptions,
  ): Promise<TtsAudio> {
    const key = Deno.env.get("AZURE_SPEECH_KEY");
    const region = Deno.env.get("AZURE_SPEECH_REGION");
    if (!key || !region) {
      throw new Error("Azure Speech not configured (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION missing)");
    }

    const res = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
          "User-Agent": "FalaMadeira-EdgeFunction",
        },
        body: buildSsml(text, voice, opts.voiceType),
      },
    );

    if (!res.ok) {
      throw new Error(
        `Azure TTS API ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("Azure TTS returned an empty audio body");
    }

    return {
      audioBase64: bytesToBase64(bytes),
      mimeType: `audio/pcm;rate=${SAMPLE_RATE_HZ}`,
      sampleRateHz: SAMPLE_RATE_HZ,
      voice,
    };
  },
};
