// File: src/features/learning/__tests__/useLessonModals.suggestVideo.test.ts
// Description: Guards EN-27 P1.10 (the TB-15 "silent no-op" class) at the handler level. The
//   Suggest-Video submit used to begin `if (!selectedLesson || !supabase || !user) return;` — a
//   user tapping the button with no session got NOTHING: no toast, no log. That guard branch is
//   unreachable through the live UI when signed in (which is exactly why it went unnoticed), so the
//   correct regression guard is a unit test on the handler, not a contrived e2e. Asserts: with no
//   user/client the submit surfaces a toast AND logs (never a silent return), and does not attempt
//   the DB insert.
// Author: EN-27 error-hardening plan (WP-C c-test)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { SupabaseClient, User } from '@supabase/supabase-js';

vi.mock('../../../lib/logger', () => ({
  logger: { warn: vi.fn(() => ({ request_id: 'req-test' })), error: vi.fn(() => ({ request_id: 'req-test' })), info: vi.fn() },
  userMessage: (_code: string, msg: string) => msg,
}));

import { useLessonModals } from '../useLessonModals';
import { logger } from '../../../lib/logger';
import type { Lesson, UserProfile } from '../../../types';

const lesson = { id: 'L1', title: 'Ordering coffee' } as unknown as Lesson;

const makeDeps = (over: Partial<Parameters<typeof useLessonModals>[0]> = {}) => ({
  supabase: null as SupabaseClient | null,
  user: null as User | null,
  profile: null as UserProfile | null,
  showToast: vi.fn(),
  handleSupabaseError: vi.fn(),
  selectedLesson: lesson,
  videoSuggestions: [],
  setVideoSuggestions: vi.fn(),
  ...over,
});

afterEach(() => vi.clearAllMocks());

describe('useLessonModals.handleSuggestVideo — no silent no-op (EN-27 P1.10)', () => {
  it('with no session: surfaces a toast AND logs, and never inserts', async () => {
    const deps = makeDeps({ supabase: null, user: null });
    const { result } = renderHook(() => useLessonModals(deps));

    await act(async () => {
      await result.current.handleSuggestVideo();
    });

    // The user gets feedback (not a silent return)...
    expect(deps.showToast).toHaveBeenCalledTimes(1);
    expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    // ...and ops gets a trace.
    expect(logger.warn).toHaveBeenCalledWith(
      'SUGGEST_VIDEO_NO_SESSION',
      expect.any(String),
      expect.objectContaining({ category: 'USER_ACTION' }),
    );
    // No DB attempt was made.
    expect(deps.handleSupabaseError).not.toHaveBeenCalled();
  });

  it('with a session but no selected lesson: logs the programmer-guard (no silent return)', async () => {
    const deps = makeDeps({
      supabase: {} as SupabaseClient,
      user: { id: 'u1' } as User,
      selectedLesson: null,
    });
    const { result } = renderHook(() => useLessonModals(deps));

    await act(async () => {
      await result.current.handleSuggestVideo();
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'SUGGEST_VIDEO_NO_LESSON',
      expect.any(String),
      expect.objectContaining({ category: 'USER_ACTION' }),
    );
  });
});
