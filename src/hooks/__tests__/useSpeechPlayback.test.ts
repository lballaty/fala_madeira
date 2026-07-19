// File: src/hooks/__tests__/useSpeechPlayback.test.ts
// Description: EN-31 tests for useSpeechPlayback's audio-failure notification. Locks: a total
//   playback failure fires ONE error toast (carrying the support ref); repeated failures during an
//   outage are deduped to a single toast while EVERY failure is still logged; a successful play
//   re-arms the notification so a later outage notifies again; the happy path shows no toast.
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/geminiService', () => ({ geminiService: { playSpeech: vi.fn() } }));
vi.mock('../../lib/logger', () => ({
  logger: { error: vi.fn(() => ({ request_id: 'req-test' })) },
  userMessage: (_code: string, msg: string, ref?: string) => `${msg} [${ref ?? ''}]`,
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { geminiService } from '../../services/geminiService';
import { logger } from '../../lib/logger';
import type { ShowToast } from '../useToast';
import { useSpeechPlayback, __resetAudioFailureNotified } from '../useSpeechPlayback';

let showToast: ReturnType<typeof vi.fn>;
let nowVal: number;

beforeEach(() => {
  __resetAudioFailureNotified();
  nowVal = 100_000;
  vi.spyOn(Date, 'now').mockImplementation(() => nowVal);
  vi.mocked(geminiService.playSpeech).mockReset();
  vi.mocked(logger.error).mockClear();
  showToast = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

const render = () => renderHook(() => useSpeechPlayback({ profile: null, playbackSpeed: 1, showToast: showToast as unknown as ShowToast }));
const advancePastDebounce = () => { nowVal += 400; }; // 300ms debounce window

describe('useSpeechPlayback — audio-failure notification (EN-31)', () => {
  it('fires ONE error toast (with the support ref) when playback fails', async () => {
    vi.mocked(geminiService.playSpeech).mockRejectedValue(new Error('boom'));
    const { result } = render();
    await act(async () => { await result.current.playSpeech('a'); });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('req-test'), 'error');
  });

  it('dedupes repeated failures during one outage to a SINGLE toast — but logs every failure', async () => {
    vi.mocked(geminiService.playSpeech).mockRejectedValue(new Error('boom'));
    const { result } = render();
    await act(async () => { await result.current.playSpeech('a'); });
    advancePastDebounce();
    await act(async () => { await result.current.playSpeech('b'); });
    advancePastDebounce();
    await act(async () => { await result.current.playSpeech('c'); });
    expect(showToast).toHaveBeenCalledTimes(1);       // deduped
    expect(logger.error).toHaveBeenCalledTimes(3);    // every failure still observable
  });

  it('re-arms after a successful play so a later outage notifies again', async () => {
    const { result } = render();
    vi.mocked(geminiService.playSpeech).mockRejectedValueOnce(new Error('boom1'));
    await act(async () => { await result.current.playSpeech('a'); });
    advancePastDebounce();
    vi.mocked(geminiService.playSpeech).mockResolvedValueOnce(undefined); // recovery
    await act(async () => { await result.current.playSpeech('b'); });
    advancePastDebounce();
    vi.mocked(geminiService.playSpeech).mockRejectedValueOnce(new Error('boom2')); // new outage
    await act(async () => { await result.current.playSpeech('c'); });
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('shows no toast on the happy path', async () => {
    vi.mocked(geminiService.playSpeech).mockResolvedValue(undefined);
    const { result } = render();
    await act(async () => { await result.current.playSpeech('a'); });
    expect(showToast).not.toHaveBeenCalled();
  });
});
