// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/__tests__/audioNoticeLatch.test.ts
// Description: EN-31 GAP 2/3 — unit tests for the session-scoped audio-toast dedupe latches. Verifies
//   the once-per-outage failure latch (with re-arm on recovery) and the once-per-session degradation
//   latch (no re-arm), plus the test-only reset helpers. These latches back useSpeechPlayback's toast
//   dedupe; this covers the module directly (the hook test covers the wiring).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-20

import { describe, it, expect, beforeEach } from 'vitest';
import {
  audioNoticeLatch,
  __resetAudioFailureNotified,
  __resetAudioDegradedNotified,
} from '../audioNoticeLatch';

describe('audioNoticeLatch', () => {
  beforeEach(() => {
    __resetAudioFailureNotified();
    __resetAudioDegradedNotified();
  });

  describe('failure latch (GAP 3 — once per outage, re-arms on recovery)', () => {
    it('starts un-notified', () => {
      expect(audioNoticeLatch.isFailureNotified()).toBe(false);
    });

    it('latches after markFailureNotified so a session-long outage does not re-notify', () => {
      audioNoticeLatch.markFailureNotified();
      expect(audioNoticeLatch.isFailureNotified()).toBe(true);
    });

    it('re-arms on a successful play so a NEW outage notifies again', () => {
      audioNoticeLatch.markFailureNotified();
      expect(audioNoticeLatch.isFailureNotified()).toBe(true);
      audioNoticeLatch.rearmFailure(); // recovery
      expect(audioNoticeLatch.isFailureNotified()).toBe(false);
    });
  });

  describe('degradation latch (GAP 2 — once per session, does NOT re-arm)', () => {
    it('starts un-notified', () => {
      expect(audioNoticeLatch.isDegradedNotified()).toBe(false);
    });

    it('latches after markDegradedNotified and has no re-arm path (explain once, never nag)', () => {
      audioNoticeLatch.markDegradedNotified();
      expect(audioNoticeLatch.isDegradedNotified()).toBe(true);
      // No rearmDegraded() accessor exists by design; only a test-only reset clears it.
      expect('rearmDegraded' in audioNoticeLatch).toBe(false);
    });
  });

  it('the two latches are independent', () => {
    audioNoticeLatch.markFailureNotified();
    expect(audioNoticeLatch.isFailureNotified()).toBe(true);
    expect(audioNoticeLatch.isDegradedNotified()).toBe(false);
  });

  it('test-only resets clear each latch', () => {
    audioNoticeLatch.markFailureNotified();
    audioNoticeLatch.markDegradedNotified();
    __resetAudioFailureNotified();
    __resetAudioDegradedNotified();
    expect(audioNoticeLatch.isFailureNotified()).toBe(false);
    expect(audioNoticeLatch.isDegradedNotified()).toBe(false);
  });
});
