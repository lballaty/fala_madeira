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
import { PlatformError } from '../../platform/types';
import type { ShowToast } from '../useToast';
import { useSpeechPlayback, __resetAudioFailureNotified, __resetAudioDegradedNotified } from '../useSpeechPlayback';

let showToast: ReturnType<typeof vi.fn>;
let nowVal: number;

beforeEach(() => {
  __resetAudioFailureNotified();
  __resetAudioDegradedNotified();
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
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('req-test'),
      'error',
      expect.objectContaining({ actions: expect.arrayContaining([expect.objectContaining({ label: 'Retry' })]) }),
    );
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

  // EN-31 WP-C — stable copy + Retry action
  it('uses stable copy (not the raw error string) for a generic failure', async () => {
    vi.mocked(geminiService.playSpeech).mockRejectedValue(new Error('kaboom-internal-detail'));
    const { result } = render();
    await act(async () => { await result.current.playSpeech('a'); });
    const [message] = showToast.mock.calls[0];
    expect(message).toContain("Couldn't play the audio");
    expect(message).not.toContain('kaboom-internal-detail'); // internal detail stays in the log, not the toast
  });

  it('uses the "device can\'t play" copy when speech synthesis is unsupported', async () => {
    vi.mocked(geminiService.playSpeech).mockRejectedValue(
      new PlatformError('audio', 'unavailable', 'Speech synthesis is not supported in this browser.'),
    );
    const { result } = render();
    await act(async () => { await result.current.playSpeech('a'); });
    expect(showToast.mock.calls[0][0]).toContain("This device can't play spoken audio");
  });

  it('offers a Retry that re-invokes the same play', async () => {
    vi.mocked(geminiService.playSpeech).mockRejectedValue(new Error('boom'));
    const { result } = render();
    await act(async () => { await result.current.playSpeech('phrase-x'); });
    const retry = showToast.mock.calls[0][2].actions.find((a: { label: string }) => a.label === 'Retry');
    expect(retry).toBeDefined();
    advancePastDebounce(); // user clicks Retry seconds later, past the 300ms debounce
    await act(async () => { await retry.onClick(); });
    expect(geminiService.playSpeech).toHaveBeenCalledTimes(2);
    expect(vi.mocked(geminiService.playSpeech).mock.calls[1][0]).toBe('phrase-x');
  });

  // EN-31 WP-D — server→device degradation notice (GAP 2)
  it('shows a single, non-error "device voice" notice when server TTS degrades', async () => {
    vi.mocked(geminiService.playSpeech).mockImplementation(async (_t, _tu, _s, _onEnd, opts) => { opts?.onDegraded?.(); });
    const { result } = render();
    await act(async () => { await result.current.playSpeech('a'); });
    advancePastDebounce();
    await act(async () => { await result.current.playSpeech('b'); }); // degrades again same session
    expect(showToast).toHaveBeenCalledTimes(1);                       // once per session
    expect(showToast.mock.calls[0][1]).toBe('info');                 // calm info, never 'error'
    expect(showToast.mock.calls[0][0]).toContain("device's voice");
  });

  it('keeps degradation and total-failure notices independent', async () => {
    const { result } = render();
    vi.mocked(geminiService.playSpeech).mockImplementationOnce(async (_t, _tu, _s, _onEnd, opts) => { opts?.onDegraded?.(); });
    await act(async () => { await result.current.playSpeech('a'); }); // degrade → info toast
    advancePastDebounce();
    vi.mocked(geminiService.playSpeech).mockRejectedValueOnce(new Error('boom'));
    await act(async () => { await result.current.playSpeech('b'); }); // real failure → error toast
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast.mock.calls[0][1]).toBe('info');
    expect(showToast.mock.calls[1][1]).toBe('error');
  });
});
