// File: src/features/tutor/__tests__/TutorPracticeModal.muteIcon.test.tsx
// Description: Guards TB-23 — the practice modal's mute toggle used a bare X icon when muted, which
//   sat next to the close X and read like a second dismiss. Asserts the muted state renders a
//   muted-speaker glyph (lucide VolumeX -> class "lucide-volume-x"), NOT the plain close X, and that
//   the enabled state renders the speaker (Volume2). framer-motion + SafeMarkdown are mocked so the
//   render is hermetic.
// Author: TB-23 fix (with assistant)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    AnimatePresence: ({ children }: { children?: unknown }) => children,
    motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
      // Render motion.<tag> as a plain <div> passing through children/refs/aria.
      const { children, ...rest } = props as { children?: unknown };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.createElement('div', rest as any, children as any);
    } }),
  };
});
vi.mock('../../../components/SafeMarkdown', () => ({ SafeMarkdown: () => null }));

import { TutorPracticeModal } from '../TutorPracticeModal';
import type { UserProfile } from '../../../types';

const baseProps = {
  isAIPracticeOpen: true,
  profile: { selected_tutor_id: 't1' } as unknown as UserProfile,
  selectedMonth: 1,
  isHelpMode: false,
  toggleHelpMode: () => {},
  setIsSoundEnabled: () => {},
  closeAIPractice: () => {},
  chatHistory: [],
  isAiLoading: false,
  currentlySpeakingIndex: null,
  playMessageInChunks: async () => {},
  handleAIPractice: async () => {},
  aiMessage: '',
  setAiMessage: () => {},
  isRecording: false,
  toggleRecording: () => {},
};

afterEach(cleanup);

describe('TutorPracticeModal mute icon (TB-23)', () => {
  it('renders a muted-speaker icon (not a bare X) when sound is disabled', () => {
    render(<TutorPracticeModal {...baseProps} isSoundEnabled={false} />);
    const muteBtn = screen.getByRole('button', { name: 'Unmute tutor audio' });
    const svg = muteBtn.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').toContain('volume-x');
    // It must NOT be the plain close glyph (lucide-x, no "volume").
    expect(svg?.getAttribute('class') ?? '').not.toMatch(/lucide-x(\s|$)/);
  });

  it('renders the speaker icon when sound is enabled', () => {
    render(<TutorPracticeModal {...baseProps} isSoundEnabled={true} />);
    const muteBtn = screen.getByRole('button', { name: 'Mute tutor audio' });
    expect(muteBtn.querySelector('svg')?.getAttribute('class') ?? '').toContain('volume-2');
  });

  it('keeps the close button as its own distinct control', () => {
    render(<TutorPracticeModal {...baseProps} isSoundEnabled={false} />);
    // Close is a separate, differently-labelled button — the confusion TB-23 fixes.
    expect(screen.getByRole('button', { name: 'Close practice session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmute tutor audio' })).toBeInTheDocument();
  });
});
