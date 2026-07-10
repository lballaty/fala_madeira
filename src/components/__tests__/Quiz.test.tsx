// File: /Users/liborballaty/.../src/components/__tests__/Quiz.test.tsx
// Description: Component test for the settled leaf Quiz (src/components/Quiz.tsx) — a
//   self-contained lesson quiz. Verifies header/progress render, a correct multiple-choice
//   answer increments the score, and onClose fires. Math.random is stubbed to 0 for a
//   deterministic question order/option shuffle. Depends only on motion/lucide/utils/types
//   (no App/HomeView, no supabase/gemini), so no boundary mocks are needed.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Quiz } from '../Quiz';
import type { Lesson } from '../../types';

const lesson: Lesson = {
  id: 'd1',
  title: 'Greetings',
  description: 'Basic greetings',
  level: 1,
  day: 1,
  category: 'daily',
  patterns: [],
  vocabulary: [
    { word: 'olá', translation: 'hello' },
    { word: 'adeus', translation: 'goodbye' },
    { word: 'obrigado', translation: 'thank you' },
    { word: 'sim', translation: 'yes' },
  ],
  is_static: true,
};

beforeEach(() => {
  // Deterministic shuffle/order: sort callbacks and slices become stable.
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Quiz', () => {
  it('renders the quiz header with the lesson title and initial score', () => {
    render(<Quiz lesson={lesson} onComplete={() => {}} onClose={() => {}} playSpeech={() => {}} />);
    expect(screen.getByRole('heading', { name: /Quiz: Greetings/ })).toBeInTheDocument();
    // Score starts at 0 / N.
    expect(screen.getByText(/^0\//)).toBeInTheDocument();
  });

  it('scores a correct multiple-choice answer', async () => {
    render(<Quiz lesson={lesson} onComplete={() => {}} onClose={() => {}} playSpeech={() => {}} />);
    // The first question asks for the translation of some word; the correct answer is one of
    // the option buttons. Read the prompt, derive the expected translation, click it.
    const heading = screen.getByRole('heading', { level: 3 }).textContent ?? '';
    const match = heading.match(/translation for "(.+?)"/);
    expect(match).not.toBeNull();
    const word = match![1];
    const correct = lesson.vocabulary.find((v) => v.word === word)!.translation;

    await userEvent.click(screen.getByRole('button', { name: correct }));
    // Score chip updates to 1/N after a correct answer.
    expect(screen.getByText(/^1\//)).toBeInTheDocument();
  });

  it('invokes onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<Quiz lesson={lesson} onComplete={() => {}} onClose={onClose} playSpeech={() => {}} />);
    // The close button is the first button (XCircle icon) in the header.
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
