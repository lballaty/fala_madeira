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
import { resolveVoice } from "../lib/voiceType";
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
 * Error thrown by invokeEdgeFunction. Carries the machine-readable server `code` (e.g.
 * 'TTS_UNAVAILABLE') and the support `ref` alongside the user-facing message, so callers can
 * branch on the code (e.g. degrade TTS to device speech) while still surfacing `.message`
 * (already the userMessage("…", ref) string) to the UI.
 */
export class EdgeFunctionError extends Error {
  readonly code: string;
  readonly ref?: string;
  constructor(code: string, message: string, ref?: string) {
    super(userMessage(code, message, ref));
    this.name = 'EdgeFunctionError';
    this.code = code;
    this.ref = ref;
  }
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

// Edge error codes that are EXPECTED conditions, not system faults: a business-rule limit the
// user hit (VOICE_LIMIT_REACHED — the free-tier daily voice cap) or a planned degradation the
// client handles gracefully (TTS_UNAVAILABLE → device speech fallback). These log at WARN so the
// ERROR tier stays a clean signal of real failures; everything else stays ERROR. See
// OBSERVABILITY-CONTRACT §4 and the EF-36 triage (free-tier 429 is a product cap, not a bug).
const EXPECTED_EDGE_CODES = new Set(['VOICE_LIMIT_REACHED', 'TTS_UNAVAILABLE']);

// Generate a W3C `traceparent` for one request-level flow (OBSERVABILITY-CONTRACT §8):
// `00-<32hex trace-id>-<16hex span-id>-01`. Sent as a header on the edge call so the edge
// function threads the same trace_id into its logs + error envelope, letting a single flow be
// reconstructed across client, edge, and DB beyond correlation_id.
const randomHex = (bytes: number): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let out = '';
  for (let i = 0; i < bytes * 2; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
};
const newTraceparent = (): { traceparent: string; traceId: string } => {
  const traceId = randomHex(16); // 16 bytes = 32 hex chars
  return { traceparent: `00-${traceId}-${randomHex(8)}-01`, traceId };
};

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
    throw new EdgeFunctionError('EDGE_FN_UNCONFIGURED', 'Connection is not configured. Please reload the app and try again.', event.request_id);
  }

  // Transport-level retry (ENGINEERING-STANDARDS §5): re-attempt on transient failures
  // (network drop, 5xx) with bounded backoff, but NOT on 4xx (bad input / auth / rate-limit) —
  // those are deterministic and retrying only delays the user's error. The envelope is unwrapped
  // once, after the retry budget resolves, so error logging/Ref surfacing is unchanged.
  const httpStatus = (err: unknown): number | undefined => {
    const ctx = (err as { context?: { status?: number } })?.context;
    return typeof ctx?.status === 'number' ? ctx.status : undefined;
  };
  // One trace per logical flow — shared across retry attempts so the whole flow joins on it.
  const { traceparent, traceId } = newTraceparent();
  const { data, error } = await withRetry(
    async () => {
      // Per-attempt timeout: functions.invoke has no default, so without this a stalled fetch
      // hangs forever and the caller's spinner never clears. AbortSignal.timeout aborts the
      // attempt; the resulting FunctionsFetchError flows through res.error/reject like any other.
      const res = await supabase.functions.invoke(name, {
        body,
        headers: { traceparent },
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
    // Single edge-function error choke point: log with the server requestId as the correlation ID
    // so client and edge-function records join on the same flow. Expected business/degradation
    // conditions log at WARN (not ERROR) to keep the error tier a clean failure signal.
    const isExpected = EXPECTED_EDGE_CODES.has(serverCode);
    const logAtLevel = isExpected ? logger.warn : logger.error;
    const event = logAtLevel(
      'edge_fn_failed',
      `Edge function ${name} ${isExpected ? 'returned an expected condition' : 'failed'} (${serverCode})`,
      {
        category: 'AI_DECISION',
        error,
        correlationId: serverRequestId,
        details: { function: name, action: body?.action, code: serverCode, serverRequestId, traceId, expected: isExpected },
      },
    );
    throw new EdgeFunctionError(serverCode, serverMessage, serverRequestId ?? event.request_id);
  }

  return data as T;
};

// Server TTS returns raw PCM at 24kHz mono s16le; playback goes through the
// platform audio adapter (shared AudioContext on web, native shell later).
const TTS_SAMPLE_RATE = config.audio.ttsSampleRateHz;

/** Playback-time options threaded from the caller through playSpeech into synthesizeCached. */
export interface PlaySpeechOptions {
  /**
   * EN-8: does the caller's text qualify to be SERVER-HOSTED for reuse? true ONLY for curated,
   * enumerable content (lesson/phrase/vocab/dialogue/scripted-roleplay/pre-gen). Free-form or
   * user/AI text (tutor free-chat, simulator free-mode) MUST be false/omitted — the edge
   * write-back never hosts it (COORD-2 BLOCKING-1). Omitted defaults to not-hostable (safe).
   */
  hostable?: boolean;
  /** Explicit voice_type override (dialogue per-speaker lines); else derived from the tutor. */
  voiceType?: string;
}

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

  async playSpeech(text: string, tutor?: Tutor, speed: number = 1.0, onEnd?: () => void, opts: PlaySpeechOptions = {}) {
    this.stopSpeech();

    try {
      // Cache key = provider:voiceType:hash(text), NO speed (speed is a playback param applied by
      // the audio adapter's playbackRate, so one synthesized clip is reused at any speed). EN-8:
      // the voice slot is the RESOLVED archetype (voiceTypeForTutor), NOT the raw tutor id, so live
      // playback, offline downloads, and server-hosted clips share one key. `hostable` marks curated
      // text the server may host (forwarded to the tts action; consumed by the edge write-back).
      const arrayBuffer = await synthesizeCached(text, { tutor, voiceType: opts.voiceType, hostable: opts.hostable });

      // Resolves once playback has started; onEnd fires when the clip finishes
      // (or is stopped) — same contract as the pre-adapter implementation.
      await platform.audio.playPcm16(arrayBuffer, TTS_SAMPLE_RATE, { rate: speed, onEnded: onEnd });
    } catch (err) {
      // Graceful degradation (OBSERVABILITY-CONTRACT §10 / TTS design): when SERVER TTS is
      // unavailable (edge returns 503 TTS_UNAVAILABLE), fall back to the platform's built-in
      // speech synthesis instead of surfacing an error. Logged as WARN, not ERROR — this is an
      // expected degradation, not a fault.
      if (err instanceof EdgeFunctionError && err.code === 'TTS_UNAVAILABLE') {
        logger.warn('tts_fallback_web_speech', 'Server TTS unavailable; using device speech synthesis', {
          category: 'AI_DECISION',
          correlationId: err.ref,
          details: { textLength: text.length, tutorId: tutor?.id },
        });
        await platform.audio.speak(text, { lang: 'pt-PT', rate: speed, onEnded: onEnd });
        return;
      }
      throw err;
    }
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
  /** Tutor whose RESOLVED voice archetype (voiceTypeForTutor) keys the clip + picks the server voice. */
  tutor?: Tutor;
  /** Explicit voice_type override (dialogue lines carry per-speaker archetypes); else derived from the tutor. */
  voiceType?: string;
  /** Provider fingerprint for the cache key; 'default' lets the server pick (default chain). */
  provider?: string;
  /**
   * EN-8: curated/enumerable text the server MAY host for reuse. Forwarded to the tts action and
   * consumed by the edge write-back (which is additionally env-flag gated). Omitted = not-hostable.
   */
  hostable?: boolean;
  /**
   * EN-8: when true, a freshly-synthesized clip is written to the PINNED device store (offline
   * downloads, never LRU-evicted) instead of the bounded LRU cache. Set by the offline downloader.
   */
  pinned?: boolean;
}

/**
 * Fetch (or reuse from the bounded LRU cache) the PCM audio for `text`. Shared by
 * playSpeech and the offline-download pre-generation (src/lib/audio-download.ts) so both
 * key the cache identically. Throws a userMessage-wrapped Error on empty audio (the edge
 * choke point in invokeEdgeFunction already logs transport failures with correlation IDs).
 */
export const synthesizeCached = async (text: string, options: SynthesizeOptions = {}): Promise<ArrayBuffer> => {
  // EN-8: key by the RESOLVED voice archetype (explicit voiceType, else voiceTypeForTutor(tutor)),
  // never the raw tutor id — so every call path that means the same voice hits the same clip.
  const voice = resolveVoice(options);
  const cacheKey = audioCache.buildKey(options.provider || 'default', voice, text);

  const cached = await audioCache.get(cacheKey);
  if (cached) return cached;

  // EN-8 lookup order: bounded LRU cache (above) → PINNED offline store → [server tiers land in
  // Phase 4] → configured provider (below). Pinned holds user-downloaded clips eviction never removes.
  const pinned = await audioCache.getPinned(cacheKey);
  if (pinned) return pinned;

  // Server picks the voice from the tutor/voiceType and enforces the daily voice limit; the
  // response carries base64 PCM (24kHz mono s16le) plus resolved provider/voice metadata.
  // `hostable` tells the edge whether this is curated text it may host for reuse (EN-8 write-back).
  const data = await invokeEdgeFunction<TtsResponse>('gemini', {
    action: 'tts',
    text,
    tutor: options.tutor,
    voiceType: options.voiceType,
    provider: options.provider,
    hostable: options.hostable,
  });
  const base64Audio = data?.audio;
  if (!base64Audio) {
    const event = logger.error('tts_empty_audio', 'TTS edge function returned no audio payload', {
      category: 'AI_DECISION',
      correlationId: data?.requestId,
      details: { textLength: text.length, voiceType: voice },
    });
    throw new Error(userMessage('TTS_EMPTY_AUDIO', 'The voice service returned no audio. Please try again.', event.request_id));
  }
  const arrayBuffer = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;
  if (options.pinned) {
    // Offline download: persist to the pinned store (never LRU-evicted) so it survives cache
    // pressure — the EN-7 "downloads get evicted" fix. Pinned writes are unbounded here; the
    // downloader bounds the run against the user's offline budget via pinnedUsage().
    await audioCache.setPinned(cacheKey, arrayBuffer);
  } else {
    const evicted = await audioCache.set(cacheKey, arrayBuffer);
    if (evicted > 0) {
      logger.debug('tts_cache_evicted', `bounded audio cache evicted ${evicted} least-recently-used clip(s)`, {
        category: 'SYSTEM_HEALTH',
        correlationId: data?.requestId,
        details: { evicted, resolvedProvider: data?.provider, resolvedVoice: data?.voice },
      });
    }
  }
  return arrayBuffer;
};
