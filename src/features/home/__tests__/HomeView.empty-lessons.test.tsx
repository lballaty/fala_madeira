// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/home/__tests__/HomeView.empty-lessons.test.tsx
// Description: Regression test for the P0 first-run crash in HomeView (fixed in b6c975e). Before the
//   fix, the "Continue Learning" section rendered `lessons[0].title` unconditionally and the
//   "Start Today's Lesson" CTA called `startAIPractice(lessons[0])`. A brand-new user (or the brief
//   window before content loads) has `lessons === []`, so `lessons[0]` is undefined and Home threw
//   "Cannot read properties of undefined (reading 'title')" — crashing every first-time registrant.
//   The full e2e gate MISSED this because every test user is API-provisioned and PRE-SEEDED with a
//   completed onboarding + selected path (makeInitScript in tests/e2e/support/fixtures.ts), so no
//   test ever rendered the true empty-lessons Home.
//
//   This test renders HomeView with `lessons={[]}` and asserts it does NOT throw and shows the
//   "Start your first lesson" first-run card. A companion case renders a non-empty `lessons` array
//   and asserts the real lesson title renders, covering BOTH branches of the guard.
//
//   PROOF IT CATCHES THE BUG: reverting HomeView's `lessons.length > 0 ? … : …` guard back to the
//   unconditional `lessons[0].title` / `startAIPractice(lessons[0])` pre-fix code makes the
//   empty-lessons render throw "Cannot read properties of undefined (reading 'title')", which
//   surfaces as a thrown render in RTL and FAILS the first `expect(() => render(...)).not.toThrow()`
//   assertion below. Confirmed by reasoning against the pre-fix source and the current source in
//   HomeView.tsx (lines 316–360). Do NOT modify HomeView.tsx to make this pass.
//
//   useHome is mocked to a stable neutral snapshot so the presenter can be exercised in isolation;
//   FocusCard is stubbed because it pulls the coach/supabase/gemini data seam that is out of scope
//   here. MadeiraIsland is a pure dependency-free SVG and needs no mock.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-18

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { Lesson, UserProfile } from '../../../types';
import type { NextAction, PathContext, PathSelection, LearningPath } from '../../../paths';

// useHome pulls the SRS/due-items + freeze-balance seam (supabase, platform.storage). Mock it to a
// stable neutral snapshot so HomeView renders as a pure presenter with no network/DB boundary.
vi.mock('../useHome', () => ({
  useHome: () => ({
    progress: { percent: 0, completed: 0, total: 0, title: 'Your progress', subtitle: '' },
    competencePhrases: [],
    reviewDueCount: 0,
    freeze: { displayStreak: 0, freezes: 0, graceApplied: false, spentNow: 0 },
  }),
}));

// FocusCard pulls useCoach → geminiService/supabase/contentRepository (heavy data seam), which is
// out of scope for this crash regression. Stub it to a trivial marker so HomeView still mounts it.
vi.mock('../../coach/FocusCard', () => ({
  FocusCard: () => <div data-testid="focus-card-stub" />,
}));

// --- Minimal valid props/stubs -------------------------------------------------------------------

const user = { id: 'u-new', email: 'newuser@example.test' } as unknown as User;

// A brand-new registrant's profile: default unlocked_level 1, free tier, no completions.
const profile: UserProfile = {
  id: 'u-new',
  email: 'newuser@example.test',
  streak: 0,
  xp: 0,
  unlocked_level: 1,
  completed_lessons: [],
  last_active: new Date().toISOString(),
  subscription_tier: 'free',
  role: 'user',
};

// pathContext / pathSelection / activePath are threaded straight into the mocked useHome, so they
// only need to be structurally valid for the props. activePath.describe() is read by the real hook,
// but that hook is mocked here — a light stub is enough for the presenter.
const pathContext: PathContext = {
  situations: [],
  tracks: [],
  completedSituationIds: new Set<string>(),
  placementLevel: 1,
  mastery: [],
  dimensionSummary: {} as PathContext['dimensionSummary'],
  now: new Date(),
};

const pathSelection: PathSelection = {
  type: 'adaptive-guided',
  activeTrackId: null,
  structuredMonth: 1,
  structuredDay: 1,
};

const activePath = {
  type: 'adaptive-guided',
  describe: () => ({ type: 'adaptive-guided', title: 'Your progress', tagline: '', posture: 'tutor' }),
  order: () => [],
  next: () => ({ kind: 'free', label: '', situationId: null, engineId: null }) as NextAction,
  sessionPlan: () => null,
} as unknown as LearningPath;

// isPathReady=false forces the legacy AI-tutor CTA branch (the one that used to call
// startAIPractice(lessons[0])) so both crash surfaces — the CTA and the Continue-Learning card —
// are on screen for the empty-lessons render.
const pathNextAction: NextAction = { kind: 'free', label: 'Free browse', situationId: null, engineId: null };

const makeProps = (lessons: Lesson[]) => ({
  user,
  profile,
  lessons,
  supabase: null,
  setActiveTab: vi.fn(),
  setSelectedLesson: vi.fn(),
  startAIPractice: vi.fn().mockResolvedValue(undefined),
  unlockKey: '',
  setUnlockKey: vi.fn(),
  isUnlockModalOpen: false,
  setIsUnlockModalOpen: vi.fn(),
  handleUnlockLevel: vi.fn().mockResolvedValue(undefined),
  pathNextAction,
  isPathReady: false,
  onStartPathNext: vi.fn(),
  pathContext,
  pathSelection,
  activePath,
  openMode: vi.fn(),
});

// Import AFTER the vi.mock calls so the mocked module graph is in place.
import { HomeView } from '../HomeView';

describe('HomeView — empty-lessons first-run (P0 crash regression)', () => {
  it('does not throw and shows the "Start your first lesson" card when lessons is empty', () => {
    // The load-bearing assertion: pre-fix, this render threw
    // "Cannot read properties of undefined (reading 'title')" on lessons[0].title.
    expect(() => render(<HomeView {...makeProps([])} />)).not.toThrow();

    // First-run card copy (the guard's empty branch).
    expect(screen.getByText('Start your first lesson')).toBeInTheDocument();
    expect(screen.getByText('Head to Learning to begin your course.')).toBeInTheDocument();

    // The greeting still renders (Home mounted, no crash / no error boundary path).
    expect(screen.getByRole('heading', { name: /Olá,\s*newuser/i })).toBeInTheDocument();
  });

  it('renders the real lesson title when lessons is non-empty (guard populated branch)', () => {
    const lessons: Lesson[] = [
      {
        id: 'd1',
        title: 'Greetings',
        description: 'Basic greetings',
        level: 1,
        day: 1,
        category: 'daily',
        patterns: [],
        vocabulary: [],
        is_static: true,
      },
    ];

    expect(() => render(<HomeView {...makeProps(lessons)} />)).not.toThrow();

    // Populated branch: the real lesson title + its Month/category sub-label render, and the
    // first-run card is absent.
    expect(screen.getByRole('heading', { name: 'Greetings' })).toBeInTheDocument();
    expect(screen.getByText(/Month 1 • daily/)).toBeInTheDocument();
    expect(screen.queryByText('Start your first lesson')).not.toBeInTheDocument();
  });
});
