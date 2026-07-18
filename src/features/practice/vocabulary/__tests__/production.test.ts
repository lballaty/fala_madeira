// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/__tests__/production.test.ts
// Description: EN-18 (WP3) unit tests — the spoken-production grader. The pure matcher tolerates
//   accents, a surrounding phrase, and recognition wobble; the async checkProduction maps mic
//   availability + typed PlatformError codes to PASS / FAIL(retryable) / SKIPPED. The live mic is
//   manual-verified (hard to e2e); here platform.speech is mocked so the mapping is deterministic.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the platform singleton so recognition is deterministic (no real mic).
const isAvailable = vi.fn<() => boolean>();
const recognize = vi.fn<() => Promise<string>>();
vi.mock('../../../../platform', () => ({
  platform: { speech: { isAvailable: () => isAvailable(), recognize: () => recognize() } },
  PlatformError: class extends Error {
    capability: string;
    code: string;
    constructor(capability: string, code: string, message: string) {
      super(message);
      this.capability = capability;
      this.code = code;
    }
  },
}));

// Re-import through the mocked module boundary.
import { matchesSpokenWord, checkProduction, isProductionAvailable } from '../production';
// The mocked PlatformError constructor used to build rejections in the tests.
import { PlatformError as MockPlatformError } from '../../../../platform';

describe('matchesSpokenWord (EN-18 spoken production)', () => {
  it('passes exact + accent-folded + cased matches', () => {
    expect(matchesSpokenWord('mercado', 'mercado')).toBe(true);
    expect(matchesSpokenWord('Mercado', 'mercado')).toBe(true);
    expect(matchesSpokenWord('cafe', 'café')).toBe(true);
  });

  it('passes when the target word appears inside a recognized phrase', () => {
    expect(matchesSpokenWord('o mercado', 'mercado')).toBe(true);
    expect(matchesSpokenWord('é bom dia hoje', 'bom dia')).toBe(true);
  });

  it('tolerates recognition wobble within the length budget', () => {
    // "obrigado" (8) → budget 2; drop one char → still PASS.
    expect(matchesSpokenWord('obrigad', 'obrigado')).toBe(true);
  });

  it('fails empty transcript, empty word, and a clear mismatch', () => {
    expect(matchesSpokenWord('', 'mercado')).toBe(false);
    expect(matchesSpokenWord('mercado', '')).toBe(false);
    expect(matchesSpokenWord('adeus', 'mercado')).toBe(false);
  });

  it('does not fuzzy-pass a short near-miss (budget 0 for ≤3 chars)', () => {
    expect(matchesSpokenWord('cha', 'chá')).toBe(true); // accent only → exact after fold
    expect(matchesSpokenWord('cho', 'chá')).toBe(false); // real 1-char diff, budget 0 → FAIL
  });
});

describe('checkProduction (EN-18 objective outcome mapping)', () => {
  beforeEach(() => {
    isAvailable.mockReset();
    recognize.mockReset();
  });

  it('SKIPPED(unavailable) when recognition is not present', async () => {
    isAvailable.mockReturnValue(false);
    const result = await checkProduction('mercado');
    expect(result).toMatchObject({ outcome: 'skipped', reason: 'unavailable' });
    expect(recognize).not.toHaveBeenCalled();
  });

  it('PASS when the transcript matches', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockResolvedValue('mercado');
    const result = await checkProduction('mercado');
    expect(result).toMatchObject({ outcome: 'pass', transcript: 'mercado' });
  });

  it('FAIL(mismatch) with the transcript when it does not match', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockResolvedValue('adeus');
    const result = await checkProduction('mercado');
    expect(result).toMatchObject({ outcome: 'fail', reason: 'mismatch', transcript: 'adeus' });
  });

  it('SKIPPED(permission-denied) when the mic is refused', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockRejectedValue(new MockPlatformError('speech', 'permission-denied', 'no mic'));
    const result = await checkProduction('mercado');
    expect(result).toMatchObject({ outcome: 'skipped', reason: 'permission-denied' });
  });

  it('retryable FAIL on no-speech and timeout', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockRejectedValueOnce(new MockPlatformError('speech', 'no-speech', 'heard nothing'));
    expect(await checkProduction('mercado')).toMatchObject({ outcome: 'fail', reason: 'no-speech' });
    recognize.mockRejectedValueOnce(new MockPlatformError('speech', 'timeout', 'too slow'));
    expect(await checkProduction('mercado')).toMatchObject({ outcome: 'fail', reason: 'timeout' });
  });

  it('FAIL(error) on any other PlatformError', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockRejectedValue(new MockPlatformError('speech', 'network', 'offline'));
    const result = await checkProduction('mercado');
    expect(result).toMatchObject({ outcome: 'fail', reason: 'error' });
  });

  it('isProductionAvailable reflects the adapter', () => {
    isAvailable.mockReturnValue(true);
    expect(isProductionAvailable()).toBe(true);
    isAvailable.mockReturnValue(false);
    expect(isProductionAvailable()).toBe(false);
  });
});
