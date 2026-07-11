// File: src/services/geminiService.ts
// Description: Thin client for all AI features. Every call goes through the authenticated
//   Supabase `gemini` edge function (actions: chat, generate-lesson, translate, tts) using
//   the user's session JWT — the Gemini API key never reaches the client bundle. Account
//   deletion routes through the `delete-account` edge function. Chat is stateless on the
//   server: this module keeps the turn history locally and sends it with each message.
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-09

import { Lesson, Tutor, VocabResult } from "../types";
import { audioCache } from "../lib/audioCache";
import { getSupabase } from "../lib/supabase";
import { logger, userMessage } from "../lib/logger";
import { platform } from "../platform";
import { config } from "../config";
import { withRetry } from "../lib/retry";

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * Client-side mirror of the edge function's ErrorAnalystResult
 * (supabase/functions/_shared/gemini.ts). The server type lives in Deno and cannot be imported
 * into the browser bundle, so this shape is duplicated here — keep the two in sync. Consumed by
 * the Coach's online narrative-enhancement layer (src/features/coach).
 */
export interface ErrorAnalystFinding {
  category: 'tense' | 'gender' | 'word-order' | 'register' | 'vocabulary' | 'other';
  /** Plain-English description of the recurring issue. */
  pattern: string;
  /** Verbatim learner phrases illustrating it. */
  examples: string[];
  /** The pt-PT correct form / recast. */
  correct_form: string;
  /** One calm, actionable next step for the coach. */
  focus_suggestion: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ErrorAnalystResult {
  findings: ErrorAnalystFinding[];
  /** One calm, competence-framed sentence for the learner (never scolding). */
  summary: string;
}

export interface ChatSession {
  sendMessage(input: { message: string }): Promise<{ text: string }>;
}

// Invoke a Supabase edge function and unwrap the shared error envelope
// ({ error: { code, message, requestId, details } }) into a thrown Error whose
// message includes the server's human-readable text and a support Ref.
const invokeEdgeFunction = async <T = unknown>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> => {
  const supabase = getSupabase();
  if (!supabase) {
    const event = logger.critical('edge_fn_unconfigured', 'Supabase client missing when invoking edge function', {
      category: 'SYSTEM_HEALTH',
      details: { function: name },
    });
    throw new Error(
      userMessage('EDGE_FN_UNCONFIGURED', 'Connection is not configured. Please reload the app and try again.', event.request_id)
    );
  }

  // Transport-level retry (ENGINEERING-STANDARDS §5): re-attempt on transient failures
  // (network drop, 5xx) with bounded backoff, but NOT on 4xx (bad input / auth / rate-limit) —
  // those are deterministic and retrying only delays the user's error. The envelope is unwrapped
  // once, after the retry budget resolves, so error logging/Ref surfacing is unchanged.
  const httpStatus = (err: unknown): number | undefined => {
    const ctx = (err as { context?: { status?: number } })?.context;
    return typeof ctx?.status === 'number' ? ctx.status : undefined;
  };
  const { data, error } = await withRetry(
    async () => {
      // Per-attempt timeout: functions.invoke has no default, so without this a stalled fetch
      // hangs forever and the caller's spinner never clears. AbortSignal.timeout aborts the
      // attempt; the resulting FunctionsFetchError flows through res.error/reject like any other.
      const res = await supabase.functions.invoke(name, {
        body,
        signal: AbortSignal.timeout(config.net.requestTimeoutMs),
      });
      if (res.error) throw res.error; // throw so withRetry can decide to retry/give up
      return res;
    },
    {
      label: `edge:${name}${body?.action ? `:${body.action}` : ''}`,
      shouldRetry: (err) => {
        const status = httpStatus(err);
        // No status = transport/network error (retry). 5xx = server transient (retry).
        // 4xx = client-side/deterministic (do not retry).
        return status === undefined || status >= 500;
      },
    },
  ).then(
    (res) => ({ data: res.data as unknown, error: null as unknown }),
    (err) => ({ data: null as unknown, error: err }),
  );

  if (error) {
    const errMessage = (error as { message?: string }).message;
    let serverMessage = errMessage || "The AI service failed. Please try again.";
    let serverCode = 'EDGE_FN_ERROR';
    let serverRequestId: string | undefined;
    // FunctionsHttpError exposes the raw Response as error.context; read the
    // structured envelope ({ error: { code, message, requestId, details } }) when available.
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
        // Body was not JSON — keep the default message and log it below.
      }
    }
    // Single edge-function error choke point: log with the server requestId as the
    // correlation ID so client and edge-function records join on the same flow.
    const event = logger.error('edge_fn_failed', `Edge function ${name} failed`, {
      category: 'AI_DECISION',
      error,
      correlationId: serverRequestId,
      details: { function: name, action: body?.action, code: serverCode, serverRequestId },
    });
    throw new Error(userMessage(serverCode, serverMessage, serverRequestId ?? event.request_id));
  }

  return data as T;
};

// Server TTS returns raw PCM at 24kHz mono s16le; playback goes through the
// platform audio adapter (shared AudioContext on web, native shell later).
const TTS_SAMPLE_RATE = config.audio.ttsSampleRateHz;

export const geminiService = {
  async generateLesson(topic: string, tutor?: Tutor) {
    const data = await invokeEdgeFunction<{ result?: Partial<Lesson> }>('gemini', { action: 'generate-lesson', topic, tutor });
    return data.result;
  },

  // Returns a chat session that keeps the conversation history client-side and
  // replays it to the stateless `chat` edge-function action on every message.
  async startChat(tutor?: Tutor, isHelpMode: boolean = false): Promise<ChatSession> {
    const history: ChatTurn[] = [];
    return {
      async sendMessage({ message }: { message: string }) {
        const turns = [...history, { role: 'user' as const, text: message }];
        const data = await invokeEdgeFunction<{ text?: unknown }>('gemini', {
          action: 'chat',
          history: turns,
          tutor,
          isHelpMode,
        });
        const text = String(data?.text ?? '');
        history.push({ role: 'user', text: message }, { role: 'model', text });
        return { text };
      },
    };
  },

  async translateWord(word: string, tutor?: Tutor) {
    const data = await invokeEdgeFunction<{ result?: VocabResult }>('gemini', { action: 'translate', word, tutor });
    return data.result;
  },

  // AI role: Error Analyst (CONTENT-ARCHITECTURE §6b/§7). Given recent learner
  // utterances/mistakes, the server returns recurring-pattern findings + a calm summary
  // (ErrorAnalystResult). This is the ONLINE narrative-enhancement layer for the Coach:
  // callers (src/features/coach) enrich the deterministic templated suggestions with these
  // findings and MUST fall back to the offline output on any failure — never block, never empty.
  async analyzeErrors(utterances: string[], tutor?: Tutor): Promise<ErrorAnalystResult> {
    const data = await invokeEdgeFunction<{ result?: ErrorAnalystResult }>('gemini', {
      action: 'error-analyst',
      utterances,
      tutor,
    });
    return data.result ?? { findings: [], summary: '' };
  },

  // Deletes the signed-in user's account and data via the delete-account edge function.
  async deleteAccount(): Promise<void> {
    await invokeEdgeFunction('delete-account');
  },

  stopSpeech() {
    platform.audio.stop();
  },

  async playSpeech(text: string, tutor?: Tutor, speed: number = 1.0, onEnd?: () => void) {
    this.stopSpeech();

    // Cache key = provider:voice:hash(text), NO speed (speed is a playback param applied
    // by the audio adapter's playbackRate, so one synthesized clip is reused at any speed).
    // The client keys on the requested voice fingerprint (tutor id) with 'default' provider
    // — the server resolves the actual provider/voice and returns them in metadata (logged);
    // reads and writes for the same logical request agree because both use this key.
    const arrayBuffer = await synthesizeCached(text, { tutorId: tutor?.id, tutor });

    // Resolves once playback has started; onEnd fires when the clip finishes
    // (or is stopped) — same contract as the pre-adapter implementation.
    await platform.audio.playPcm16(arrayBuffer, TTS_SAMPLE_RATE, { rate: speed, onEnded: onEnd });
  }
};

// TTS response metadata (provider/voice resolved server-side; carried for cache-key
// guidance and observability — see supabase/functions/gemini/index.ts tts action).
interface TtsResponse {
  audio?: string;
  provider?: string;
  voice?: string;
  voiceType?: string;
  requestId?: string;
}

export interface SynthesizeOptions {
  /** Voice fingerprint for the cache key (tutor id or voice_type); 'default' when omitted. */
  tutorId?: string;
  /** Passed to the edge function so the server picks the right voice from the tutor. */
  tutor?: Tutor;
  /** voice_type override forwarded to the server (dialogue lines carry per-speaker types). */
  voiceType?: string;
  /** Provider fingerprint for the cache key; 'default' lets the server pick (default chain). */
  provider?: string;
}

/**
 * Fetch (or reuse from the bounded LRU cache) the PCM audio for `text`. Shared by
 * playSpeech and the offline-download pre-generation (src/lib/audio-download.ts) so both
 * key the cache identically. Throws a userMessage-wrapped Error on empty audio (the edge
 * choke point in invokeEdgeFunction already logs transport failures with correlation IDs).
 */
export const synthesizeCached = async (text: string, options: SynthesizeOptions = {}): Promise<ArrayBuffer> => {
  const voice = options.voiceType || options.tutorId || 'default';
  const cacheKey = audioCache.buildKey(options.provider || 'default', voice, text);

  const cached = await audioCache.get(cacheKey);
  if (cached) return cached;

  // Server picks the voice from the tutor/voiceType and enforces the daily voice limit;
  // the response carries base64 PCM (24kHz mono s16le) plus resolved provider/voice metadata.
  const data = await invokeEdgeFunction<TtsResponse>('gemini', {
    action: 'tts',
    text,
    tutor: options.tutor,
    voiceType: options.voiceType,
    provider: options.provider,
  });
  const base64Audio = data?.audio;
  if (!base64Audio) {
    const event = logger.error('tts_empty_audio', 'TTS edge function returned no audio payload', {
      category: 'AI_DECISION',
      correlationId: data?.requestId,
      details: { textLength: text.length, tutorId: options.tutorId, voiceType: options.voiceType },
    });
    throw new Error(userMessage('TTS_EMPTY_AUDIO', 'The voice service returned no audio. Please try again.', event.request_id));
  }
  const arrayBuffer = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;
  const evicted = await audioCache.set(cacheKey, arrayBuffer);
  if (evicted > 0) {
    logger.debug('tts_cache_evicted', `bounded audio cache evicted ${evicted} least-recently-used clip(s)`, {
      category: 'SYSTEM_HEALTH',
      correlationId: data?.requestId,
      details: { evicted, resolvedProvider: data?.provider, resolvedVoice: data?.voice },
    });
  }
  return arrayBuffer;
};
