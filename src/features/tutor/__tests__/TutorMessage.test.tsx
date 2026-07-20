// File: src/features/tutor/__tests__/TutorMessage.test.tsx
// Description: TB-14 — renderer tests for TutorMessage. Asserts the core acceptance criteria: a
//   labeled-block turn renders a phrase whose play button calls playSpeech with the PORTUGUESE ONLY
//   (never the English or phonetic), the English is present in the DOM (revealable) but never passed
//   to playSpeech, and a no-Portuguese turn falls back to a single whole-message render + one
//   whole-message play. framer-motion is mocked so TranslatableText's reveal animation is hermetic.
// Author: TB-14 (with assistant)
// Created: 2026-07-20

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    AnimatePresence: ({ children }: { children?: unknown }) => children,
    motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
      const { children, ...rest } = props as { children?: unknown };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.createElement('span', rest as any, children as any);
    } }),
  };
});

import { TutorMessage } from '../TutorMessage';

afterEach(cleanup);

describe('TutorMessage (TB-14)', () => {
  it('a labeled-block turn plays the PORTUGUESE ONLY and shows English without speaking it', () => {
    const playSpeech = vi.fn();
    const text = ['**Português:** Bom dia', '**Pronunciation:** bohn DEE-ah', '**English:** Good morning'].join('\n');
    render(<TutorMessage text={text} playSpeech={playSpeech} />);

    // The play button speaks only the PT.
    const playBtn = screen.getByRole('button', { name: 'Play phrase' });
    fireEvent.click(playBtn);
    expect(playSpeech).toHaveBeenCalledTimes(1);
    expect(playSpeech).toHaveBeenCalledWith('Bom dia');
    // Never the English or phonetic.
    expect(playSpeech).not.toHaveBeenCalledWith(expect.stringContaining('Good morning'));
    expect(playSpeech).not.toHaveBeenCalledWith(expect.stringContaining('bohn DEE-ah'));

    // English is available to reveal (tap-to-reveal); phonetic subtext is shown but not spoken.
    fireEvent.click(screen.getByRole('button', { name: /Show English translation/i }));
    expect(screen.getByText('Good morning')).toBeInTheDocument();
    expect(screen.getByText('bohn DEE-ah')).toBeInTheDocument();
  });

  it('a no-Portuguese turn falls back to a whole-message render + one whole-message play', () => {
    const playSpeech = vi.fn();
    const text = 'Just some plain English guidance with no Portuguese at all.';
    render(<TutorMessage text={text} playSpeech={playSpeech} />);

    // No per-phrase button; one whole-message button that plays the entire text.
    expect(screen.queryByRole('button', { name: 'Play phrase' })).toBeNull();
    const wholeBtn = screen.getByRole('button', { name: 'Play message' });
    fireEvent.click(wholeBtn);
    expect(playSpeech).toHaveBeenCalledWith(text);
  });
});
