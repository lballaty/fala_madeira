// File: src/features/admin/audio/__tests__/audioSignals.test.ts
// Description: EN-23 unit tests for the automated quality-signal math — the pure loudness/silence
//   scoring (computeLoudness), the raw-PCM decode (pcm16ToFloat32), and the suspicious-flag rollup
//   (isSuspicious). Pure functions, no Web Audio / no mocks required.
// Author: claude-en23
// Created: 2026-07-17

import { describe, expect, it } from 'vitest';
import { computeLoudness, isSuspicious, pcm16ToFloat32, SIGNAL_THRESHOLDS } from '../audioSignals';

const sine = (samples: number, sampleRate: number, freq: number, amp: number): Float32Array => {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
};

describe('computeLoudness', () => {
  const sr = 24000;

  it('flags an all-silence clip as silent with floor-level RMS', () => {
    const result = computeLoudness(new Float32Array(sr), sr);
    expect(result.silent).toBe(true);
    expect(result.silentRatio).toBeGreaterThanOrEqual(SIGNAL_THRESHOLDS.silentRatioThreshold);
    expect(result.rmsDbfs).toBeLessThan(SIGNAL_THRESHOLDS.silenceFloorDbfs);
  });

  it('does not flag a full-amplitude tone as silent', () => {
    const result = computeLoudness(sine(sr, sr, 440, 0.5), sr);
    expect(result.silent).toBe(false);
    expect(result.silentRatio).toBeLessThan(0.1);
    expect(result.rmsDbfs).toBeGreaterThan(-20);
    expect(result.peakDbfs).toBeGreaterThan(result.rmsDbfs);
  });

  it('measures leading + trailing dead air around a tone', () => {
    // 0.5s silence + 1s tone + 0.5s silence
    const head = new Float32Array(sr / 2);
    const body = sine(sr, sr, 440, 0.5);
    const tail = new Float32Array(sr / 2);
    const clip = new Float32Array(head.length + body.length + tail.length);
    clip.set(head, 0);
    clip.set(body, head.length);
    clip.set(tail, head.length + body.length);
    const result = computeLoudness(clip, sr);
    // ~1000ms of combined dead air (±one frame).
    expect(result.deadAirMs).toBeGreaterThan(800);
    expect(result.deadAirMs).toBeLessThan(1200);
    expect(result.silent).toBe(false);
  });

  it('handles an empty buffer without throwing', () => {
    const result = computeLoudness(new Float32Array(0), sr);
    expect(result.silent).toBe(true);
    expect(result.deadAirMs).toBe(0);
  });
});

describe('pcm16ToFloat32', () => {
  it('converts signed 16-bit little-endian PCM to [-1, 1) floats', () => {
    const buf = new ArrayBuffer(6);
    const view = new DataView(buf);
    view.setInt16(0, 0, true);
    view.setInt16(2, 32767, true);
    view.setInt16(4, -32768, true);
    const out = pcm16ToFloat32(buf);
    expect(out.length).toBe(3);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(1, 2);
    expect(out[2]).toBe(-1);
  });
});

describe('isSuspicious', () => {
  it('flags a too-small clip', () => {
    expect(isSuspicious({ bytes: 100 })).toBe(true);
  });
  it('flags a zero-duration clip', () => {
    expect(isSuspicious({ bytes: 5000, durationMs: 0 })).toBe(true);
  });
  it('flags a wrong content-type', () => {
    expect(isSuspicious({ bytes: 5000, contentType: 'text/html' })).toBe(true);
  });
  it('flags a silent clip', () => {
    expect(isSuspicious({ bytes: 5000, silent: true })).toBe(true);
  });
  it('flags excessive dead air', () => {
    expect(isSuspicious({ bytes: 5000, deadAirMs: SIGNAL_THRESHOLDS.deadAirSuspiciousMs + 1 })).toBe(true);
  });
  it('accepts a healthy clip (incl. octet-stream)', () => {
    expect(
      isSuspicious({ bytes: 48000, contentType: 'application/octet-stream', durationMs: 1000, silent: false, deadAirMs: 100 }),
    ).toBe(false);
  });
});
