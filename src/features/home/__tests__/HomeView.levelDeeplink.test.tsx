// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/home/__tests__/HomeView.levelDeeplink.test.tsx
// Description: NAV-1b unit test — the Home proficiency level label is a tappable deep-link into the
//   Settings "Your level" card. Before NAV-1b the level rendered as a static <p>, so a learner who
//   saw the wrong level on Home had no obvious path to change it (owner report, staging .19.1). The
//   fix makes the label a button (data-testid="home-level-deeplink") that fires onOpenProficiency —
//   App wires that to setFocusProficiencyCard(true) + setActiveTab('settings'). This test asserts the
//   control renders with the level text and that clicking it invokes the navigation callback exactly
//   once (guide-and-offer: HomeView never changes the level itself).
//
//   useHome is mocked to a stable snapshot (same seam as HomeView.empty-lessons.test) so the
//   presenter is exercised in isolation; FocusCard is stubbed to avoid the coach/supabase data seam.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-19

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import type { Lesson, UserProfile } from '../../../types';
import type { NextAction, PathContext, PathSelection, LearningPath } from '../../../paths';

vi.mock('../useHome', () => ({
  useHome: () => ({
    progress: { percent: 0, completed: 0, total: 0, title: 'Your progress', subtitle: '' },
    competencePhrases: [],
    reviewDueCount: 0,
    freeze: { displayStreak: 0, freezes: 0, graceApplied: false, spentNow: 0 },
    proficiencyName: 'Intermediate',
  }),
}));

vi.mock('../../coach/FocusCard', () => ({
  FocusCard: () => <div data-testid="focus-card-stub" />,
}));

const user = { id: 'u1', email: 'learner@example.test' } as unknown as User;

const profile: UserProfile = {
  id: 'u1',
  email: 'learner@example.test',
  streak: 0,
  xp: 0,
  unlocked_level: 1,
  completed_lessons: [],
  last_active: new Date().toISOString(),
  subscription_tier: 'free',
  role: 'user',
  proficiency_level: 3,
};

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

const pathNextAction: NextAction = { kind: 'free', label: 'Free browse', situationId: null, engineId: null };

const makeProps = (onOpenProficiency: () => void) => ({
  user,
  profile,
  lessons: [] as Lesson[],
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
  onOpenProficiency,
});

// Import AFTER the vi.mock calls so the mocked module graph is in place.
import { HomeView } from '../HomeView';

describe('HomeView — NAV-1b tappable level deep-link', () => {
  it('renders the level as a control showing the proficiency name', () => {
    render(<HomeView {...makeProps(vi.fn())} />);
    const control = screen.getByTestId('home-level-deeplink');
    expect(control).toBeInTheDocument();
    expect(control).toHaveTextContent('Intermediate');
  });

  it('fires onOpenProficiency exactly once when the level is tapped', () => {
    const onOpenProficiency = vi.fn();
    render(<HomeView {...makeProps(onOpenProficiency)} />);
    fireEvent.click(screen.getByTestId('home-level-deeplink'));
    expect(onOpenProficiency).toHaveBeenCalledTimes(1);
  });
});
