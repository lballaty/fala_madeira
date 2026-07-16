// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/listening/listeningAudio.ts
// Description: TTS playback for the Listening Engine. Unlike geminiService.playSpeech (which
//   picks a voice from the tutor), dialogue lines carry a voice_type archetype (schema §8) —
//   this module passes voiceType to the `gemini` edge function's tts action, where the
//   archetype → provider voice mapping lives server-side. Audio (raw PCM 24kHz mono s16le)
//   is cached per text+voiceType — NEVER per speed; slow/normal/natural apply at playback
//   time via the platform audio adapter's rate option. Error paths follow the shared edge
//   envelope ({ error: { code, message, requestId } }) and route through src/lib/logger with
//   the server requestId as the correlation id (ENGINEERING-STANDARDS §3).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { getSupabase } from '../../../lib/supabase';
import { logger, userMessage } from '../../../lib/logger';
import { audioCache } from '../../../lib/audioCache';
import { platform } from '../../../platform';
import { config } from '../../../config';
import type { VoiceType } from '../../../content';

// Response shape of the gemini edge function's `tts` action (provider/voice metadata is
// advisory here; the payload PCM + sampleRateHz drive playback).
interface TtsPayload {
  audio?: string;
  provider?: string;
  voice?: string;
  voiceType?: string;
  mimeType?: string;
  sampleRateHz?: number;
  requestId?: string;
}

// Invoke the tts action with an explicit voice archetype and unwrap the shared error
// envelope into a thrown Error carrying the server message + a support Ref (same
// contract as geminiService.invokeEdgeFunction, scoped to this engine's voiceType need).
const invokeTts = async (text: string, voiceType: VoiceType): Promise<TtsPayload> => {
  const supabase = getSupabase();
  if (!supabase) {
    const event = logger.critical('listening_tts_unconfigured', 'Supabase client missing when requesting listening TTS', {
      category: 'SYSTEM_HEALTH',
      details: { voiceType, textLength: text.length },
    });
    throw new Error(
      userMessage('EDGE_FN_UNCONFIGURED', 'Connection is not configured. Please reload the app and try again.', event.request_id)
    );
  }

  const { data, error } = await supabase.functions.invoke('ai-gateway', {
    body: { action: 'tts', text, voiceType },
  });

  if (error) {
    let serverMessage = error.message || 'The voice service failed. Please try again.';
    let serverCode = 'EDGE_FN_ERROR';
    let serverRequestId: string | undefined;
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.json()) as {
          error?: { message?: string; code?: string; requestId?: string };
        } | null;
        if (payload?.error?.message) {
          serverMessage = payload.error.message;
          if (payload.error.code) serverCode = payload.error.code;
          if (payload.error.requestId) serverRequestId = payload.error.requestId;
        }
      } catch {
        // Body was not JSON — keep the default message; the event below still records it.
      }
    }
    const event = logger.error('listening_tts_failed', 'Listening TTS edge call failed', {
      category: 'AI_DECISION',
      error,
      correlationId: serverRequestId,
      details: { voiceType, textLength: text.length, code: serverCode, serverRequestId },
    });
    throw new Error(userMessage(serverCode, serverMessage, serverRequestId ?? event.request_id));
  }

  return (data ?? {}) as TtsPayload;
};

/** Stop whatever the listening engine (or anything else) is playing. Safe when idle. */
export const stopListeningAudio = (): void => {
  platform.audio.stop();
};

/**
 * Play `text` in the given voice archetype at `rate` (speed pills). Cache key is
 * text+voiceType only — one cached clip serves all speeds. Resolves once playback
 * has started; `onEnd` fires when the clip finishes (or is stopped).
 */
export const playListeningText = async (
  text: string,
  voiceType: VoiceType,
  rate: number,
  onEnd?: () => void
): Promise<void> => {
  platform.audio.stop();

  const cacheKey = `listening_${voiceType}_${text}`;
  let buffer = await audioCache.get(cacheKey);
  let sampleRate: number = config.audio.ttsSampleRateHz;

  if (!buffer) {
    const payload = await invokeTts(text, voiceType);
    if (!payload.audio) {
      const event = logger.error('listening_tts_empty_audio', 'Listening TTS returned no audio payload', {
        category: 'AI_DECISION',
        correlationId: payload.requestId,
        details: { voiceType, textLength: text.length },
      });
      throw new Error(
        userMessage('TTS_EMPTY_AUDIO', 'The voice service returned no audio. Please try again.', payload.requestId ?? event.request_id)
      );
    }
    buffer = Uint8Array.from(atob(payload.audio), (c) => c.charCodeAt(0)).buffer;

    if (typeof payload.sampleRateHz === 'number' && payload.sampleRateHz > 0 && payload.sampleRateHz !== sampleRate) {
      // Non-default sample rate: play it correctly now but skip the cache — the blob
      // store holds raw PCM with no rate metadata, so a cached replay would assume
      // the default rate and come back pitch-shifted.
      sampleRate = payload.sampleRateHz;
      logger.debug('listening_tts_nondefault_rate', 'TTS clip at non-default sample rate — played uncached', {
        category: 'DATA_PROCESSING',
        details: { sampleRateHz: payload.sampleRateHz, provider: payload.provider, voice: payload.voice },
      });
    } else {
      await audioCache.set(cacheKey, buffer);
    }
  }

  await platform.audio.playPcm16(buffer, sampleRate, { rate, onEnded: onEnd });
};
