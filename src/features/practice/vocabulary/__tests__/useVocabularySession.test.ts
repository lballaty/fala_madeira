// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/__tests__/useVocabularySession.test.ts
// Description: EN-18 (WP5/WP6) hook-logic coverage for the objective quiz. Renders
//   useVocabularySession with useDueItems, geminiService, supabase, and the production grader
//   mocked, then drives the state machine to prove: comprehension-only grading (no mic) routes the
//   right SM-2 grade to 'retrieve' with no 'say' write; the mic path scores SUCCESS/PARTIAL and
//   writes both dimensions; a mismatched spoken attempt can be accepted as a FAIL or the whole
//   speaking step skipped without penalty; and a comprehension FAIL re-enqueues the card once.
//   (The pure graders are covered in comprehension/scoring/production tests; this covers the wiring.)
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Situation } from '../../../../content/schema';

// --- boundary mocks --------------------------------------------------------
const applyGrade = vi.fn(() => Promise.resolve());
const refresh = vi.fn(() => Promise.resolve());
let masteryItems: unknown[] = [];
vi.mock('../../../../hooks/useDueItems', () => ({
  useDueItems: () => ({ items: masteryItems, applyGrade, refresh }),
}));
vi.mock('../../../../services/geminiService', () => ({
  geminiService: { stopSpeech: vi.fn(), playSpeech: vi.fn(() => Promise.resolve()) },
}));
vi.mock('../../../../lib/supabase', () => ({ getSupabase: () => null }));
vi.mock('../../../../lib/logger', () => ({
  logger: { error: () => ({ request_id: 'r' }), warn: vi.fn(), info: vi.fn() },
  errorMessage: (e: unknown) => String(e),
  userMessage: (_c: string, m: string) => m,
}));

// Production grader is controllable per test (mic availability + attempt outcome).
const isProductionAvailable = vi.fn(() => false);
const checkProduction = vi.fn();
vi.mock('../production', () => ({
  isProductionAvailable: () => isProductionAvailable(),
  checkProduction: () => checkProduction(),
}));

import { useVocabularySession } from '../useVocabularySession';
import { vocabItemKey } from '../itemKeys';

const SITUATION: Situation = {
  id: 'sit',
  title: 'Market',
  summary: '',
  tracks: [],
  level: 1,
  cefr: 'A2',
  phrase_patterns: [],
  vocabulary: [{ word: 'mercado', translation: 'market' }],
};
const KEY = vocabItemKey('sit', 'mercado');

afterEach(() => {
  vi.clearAllMocks();
  masteryItems = [];
  isProductionAvailable.mockReturnValue(false);
});

const mount = () =>
  renderHook(() => useVocabularySession({ user: { id: 'u1' } as never, situations: [SITUATION] }));

const activeReady = async (result: { current: { phase: string } }) =>
  waitFor(() => expect(result.current.phase).toBe('active'));

describe('useVocabularySession — comprehension-only (no mic)', () => {
  it('a correct answer grades retrieve PASS (4), no say write, outcome SUCCESS', async () => {
    const { result } = mount();
    await activeReady(result);

    act(() => result.current.submitComprehension('market'));

    await waitFor(() => expect(result.current.step).toBe('feedback'));
    expect(applyGrade).toHaveBeenCalledWith(KEY, 'retrieve', 4);
    expect(applyGrade).not.toHaveBeenCalledWith(KEY, 'say', expect.anything());
    expect(result.current.cardResult?.score.outcome).toBe('success');
    expect(result.current.summary.success).toBe(1);
  });

  it('a wrong answer grades retrieve FAIL (0), outcome FAILURE, and re-enqueues once', async () => {
    const { result } = mount();
    await activeReady(result);
    const totalBefore = result.current.total;

    act(() => result.current.submitComprehension('totally-wrong'));
    await waitFor(() => expect(result.current.step).toBe('feedback'));
    expect(applyGrade).toHaveBeenCalledWith(KEY, 'retrieve', 0);
    expect(result.current.cardResult?.score.outcome).toBe('failure');

    act(() => result.current.next());
    // The failed card is appended for an in-session repeat.
    expect(result.current.total).toBe(totalBefore + 1);
    expect(result.current.summary.failure).toBe(1);
  });
});

describe('useVocabularySession — with mic (production step)', () => {
  it('correct meaning + correct production → SUCCESS, both dimensions graded', async () => {
    isProductionAvailable.mockReturnValue(true);
    checkProduction.mockResolvedValue({ outcome: 'pass', transcript: 'mercado' });
    const { result } = mount();
    await activeReady(result);

    act(() => result.current.submitComprehension('market'));
    // Mic path pauses at reveal for the spoken step — not yet finalized.
    await waitFor(() => expect(result.current.step).toBe('reveal'));
    expect(applyGrade).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.sayIt();
    });
    await waitFor(() => expect(result.current.step).toBe('feedback'));
    expect(applyGrade).toHaveBeenCalledWith(KEY, 'retrieve', 4);
    expect(applyGrade).toHaveBeenCalledWith(KEY, 'say', 4);
    expect(result.current.cardResult?.score.outcome).toBe('success');
  });

  it('correct meaning + mismatched production → back to reveal (mismatch), accept → PARTIAL', async () => {
    isProductionAvailable.mockReturnValue(true);
    checkProduction.mockResolvedValue({ outcome: 'fail', reason: 'mismatch', transcript: 'adeus', message: 'x' });
    const { result } = mount();
    await activeReady(result);

    act(() => result.current.submitComprehension('market'));
    await waitFor(() => expect(result.current.step).toBe('reveal'));
    await act(async () => {
      await result.current.sayIt();
    });
    // A mismatch returns to reveal and offers "Move on".
    await waitFor(() => expect(result.current.productionFailKind).toBe('mismatch'));
    expect(result.current.step).toBe('reveal');

    act(() => result.current.acceptProductionFail());
    await waitFor(() => expect(result.current.step).toBe('feedback'));
    expect(applyGrade).toHaveBeenCalledWith(KEY, 'retrieve', 4);
    expect(applyGrade).toHaveBeenCalledWith(KEY, 'say', 0);
    expect(result.current.cardResult?.score.outcome).toBe('partial');
  });

  it('skipping the spoken step grades comprehension-only (no say penalty)', async () => {
    isProductionAvailable.mockReturnValue(true);
    const { result } = mount();
    await activeReady(result);

    act(() => result.current.submitComprehension('market'));
    await waitFor(() => expect(result.current.step).toBe('reveal'));

    act(() => result.current.skipProduction());
    await waitFor(() => expect(result.current.step).toBe('feedback'));
    expect(applyGrade).toHaveBeenCalledWith(KEY, 'retrieve', 4);
    expect(applyGrade).not.toHaveBeenCalledWith(KEY, 'say', expect.anything());
    expect(checkProduction).not.toHaveBeenCalled();
    expect(result.current.cardResult?.score.outcome).toBe('success');
  });
});
