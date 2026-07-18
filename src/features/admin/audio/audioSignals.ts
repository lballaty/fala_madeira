// File: src/features/admin/audio/audioSignals.ts
// Description: EN-23 automated per-clip quality signals. Basic signals (bytes, content-type,
//   duration) plus Web-Audio silence/loudness scoring (RMS/peak dBFS, silent-ratio, whole-clip
//   silence + leading/trailing dead-air) pulled forward from §8 per owner 2026-07-17. The loudness
//   math is a pure function over Float32 samples (unit-testable without Web Audio); decoding tries
//   the browser decoder first and falls back to raw 16-bit PCM for EN-8's octet-stream clips. All
//   scoring is best-effort: a decode failure yields basic signals only, never a thrown error.
// Author: claude-en23
// Created: 2026-07-17

import { AudioSignals } from './types';

// Thresholds — deliberately coarse; this is triage, not a mastering-grade analyzer.
export const SIGNAL_THRESHOLDS = {
  /** Below this a clip is almost certainly truncated/empty (raw PCM header is tiny). */
  minBytes: 1024,
  /** A frame quieter than this counts as silence. */
  silenceFloorDbfs: -50,
  /** Whole-clip near-silence when this fraction of frames is below the floor. */
  silentRatioThreshold: 0.98,
  /** Leading+trailing dead air beyond this is suspicious (truncation / bad trim). */
  deadAirSuspiciousMs: 1500,
  /** Assumed sample rate for the raw-PCM fallback (Gemini TTS PCM is 24kHz mono s16le). */
  pcmFallbackSampleRate: 24000,
} as const;

const isAudioLikeContentType = (contentType?: string): boolean => {
  if (!contentType) return true; // unknown — don't flag on type alone
  return contentType.startsWith('audio/') || contentType === 'application/octet-stream';
};

/** Linear amplitude (0..1) → dBFS; floors at -Infinity-safe -120. */
const toDbfs = (amplitude: number): number => (amplitude <= 0 ? -120 : 20 * Math.log10(amplitude));

/** Convert interleaved/mono 16-bit little-endian PCM to Float32 [-1, 1]. Pure. */
export const pcm16ToFloat32 = (buffer: ArrayBuffer): Float32Array => {
  const view = new DataView(buffer);
  const n = Math.floor(buffer.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
};

export interface LoudnessResult {
  rmsDbfs: number;
  peakDbfs: number;
  silentRatio: number;
  silent: boolean;
  deadAirMs: number;
}

/**
 * Pure loudness/silence scoring over PCM samples. Windows the signal into ~20ms frames, marks
 * frames below the silence floor, and measures leading+trailing contiguous silence as dead air.
 */
export const computeLoudness = (
  samples: Float32Array,
  sampleRate: number,
  thresholds: typeof SIGNAL_THRESHOLDS = SIGNAL_THRESHOLDS,
): LoudnessResult => {
  if (samples.length === 0 || sampleRate <= 0) {
    return { rmsDbfs: -120, peakDbfs: -120, silentRatio: 1, silent: true, deadAirMs: 0 };
  }

  const frameSize = Math.max(1, Math.floor(sampleRate * 0.02)); // ~20ms frames
  const frameCount = Math.ceil(samples.length / frameSize);
  const frameSilent: boolean[] = new Array(frameCount);

  let sumSquares = 0;
  let peak = 0;
  let silentFrames = 0;

  for (let f = 0; f < frameCount; f += 1) {
    const start = f * frameSize;
    const end = Math.min(start + frameSize, samples.length);
    let frameSum = 0;
    let framePeak = 0;
    for (let i = start; i < end; i += 1) {
      const v = Math.abs(samples[i]);
      frameSum += samples[i] * samples[i];
      if (v > framePeak) framePeak = v;
      if (v > peak) peak = v;
    }
    sumSquares += frameSum;
    const frameRms = Math.sqrt(frameSum / (end - start));
    const isSilent = toDbfs(frameRms) < thresholds.silenceFloorDbfs;
    frameSilent[f] = isSilent;
    if (isSilent) silentFrames += 1;
  }

  const rms = Math.sqrt(sumSquares / samples.length);
  const silentRatio = silentFrames / frameCount;

  // Leading + trailing contiguous silent frames → dead air.
  let leading = 0;
  while (leading < frameCount && frameSilent[leading]) leading += 1;
  let trailing = 0;
  while (trailing < frameCount - leading && frameSilent[frameCount - 1 - trailing]) trailing += 1;
  const frameMs = (frameSize / sampleRate) * 1000;
  const deadAirMs = Math.round((leading + trailing) * frameMs);

  return {
    rmsDbfs: Math.round(toDbfs(rms) * 10) / 10,
    peakDbfs: Math.round(toDbfs(peak) * 10) / 10,
    silentRatio: Math.round(silentRatio * 1000) / 1000,
    silent: silentRatio >= thresholds.silentRatioThreshold,
    deadAirMs,
  };
};

/** Roll up the suspicious triage flag from whatever signals are present. Pure. */
export const isSuspicious = (
  signals: AudioSignals,
  thresholds: typeof SIGNAL_THRESHOLDS = SIGNAL_THRESHOLDS,
): boolean => {
  if (signals.bytes !== undefined && signals.bytes < thresholds.minBytes) return true;
  if (signals.durationMs !== undefined && signals.durationMs <= 0) return true;
  if (!isAudioLikeContentType(signals.contentType)) return true;
  if (signals.silent) return true;
  if (signals.deadAirMs !== undefined && signals.deadAirMs > thresholds.deadAirSuspiciousMs) return true;
  return false;
};

/** Web-Audio decode → samples. Returns null if no decoder is available or decode fails. */
const decodeToSamples = async (
  buffer: ArrayBuffer,
): Promise<{ samples: Float32Array; sampleRate: number } | null> => {
  const Ctx =
    typeof globalThis !== 'undefined'
      ? (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctx) return null;
  let ctx: AudioContext | null = null;
  try {
    ctx = new Ctx();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    return { samples: audioBuffer.getChannelData(0), sampleRate: audioBuffer.sampleRate };
  } catch {
    return null;
  } finally {
    if (ctx && typeof ctx.close === 'function') void ctx.close();
  }
};

/** Basic signals straight from the blob — no decode. */
export const deriveBasicSignals = (blob: Blob): Pick<AudioSignals, 'bytes' | 'contentType'> => ({
  bytes: blob.size,
  contentType: blob.type || undefined,
});

/**
 * Full best-effort scoring of a clip blob. Tries the browser audio decoder; if that fails (e.g.
 * raw headerless PCM from EN-8's octet-stream tier), falls back to interpreting the bytes as
 * 16-bit mono PCM at the assumed sample rate. Never throws.
 */
export const scoreClip = async (
  blob: Blob,
  opts: { scoredAt: string; pcmSampleRate?: number } = { scoredAt: '' },
): Promise<AudioSignals> => {
  const basic = deriveBasicSignals(blob);
  const signals: AudioSignals = { ...basic, scoredAt: opts.scoredAt || undefined };

  let buffer: ArrayBuffer | null = null;
  try {
    buffer = await blob.arrayBuffer();
  } catch {
    buffer = null;
  }

  if (buffer) {
    let decoded = await decodeToSamples(buffer);
    if (!decoded && (blob.type === 'application/octet-stream' || blob.type === '')) {
      // Raw-PCM fallback (EN-8 hosted clips serve application/octet-stream real PCM).
      decoded = {
        samples: pcm16ToFloat32(buffer),
        sampleRate: opts.pcmSampleRate ?? SIGNAL_THRESHOLDS.pcmFallbackSampleRate,
      };
    }
    if (decoded && decoded.samples.length > 0) {
      const loudness = computeLoudness(decoded.samples, decoded.sampleRate);
      signals.rmsDbfs = loudness.rmsDbfs;
      signals.peakDbfs = loudness.peakDbfs;
      signals.silentRatio = loudness.silentRatio;
      signals.silent = loudness.silent;
      signals.deadAirMs = loudness.deadAirMs;
      signals.durationMs = Math.round((decoded.samples.length / decoded.sampleRate) * 1000);
    }
  }

  signals.suspicious = isSuspicious(signals);
  return signals;
};
