// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/__tests__/FirstWinStep.test.tsx
// Description: Regression guard for TB-6 — the onboarding "Say it back" must genuinely listen.
//   Before the fix, handleSayItBack DISCARDED the transcript and showed "Nice!" on success OR any
//   error, so it looked like it never listened. These tests mock platform.speech.recognize and
//   assert: (1) success echoes the actual transcript ("Nice — I heard you!" + the words), (2) a
//   no-speech miss offers a retry (NOT a fake success), (3) an unavailable mic offers an honest
//   self-confirm (NOT a fake success). The speech + logger boundaries are mocked so it is hermetic.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const isAvailable = vi.fn();
const recognize = vi.fn();

vi.mock('../../../platform', () => ({
  platform: {
    speech: {
      isAvailable: () => isAvailable(),
      recognize: (opts: unknown) => recognize(opts),
    },
    storage: { get: vi.fn(), set: vi.fn() },
  },
}));
vi.mock('../../../lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { FirstWinStep } from '../OnboardingFlow';

afterEach(() => {
  vi.clearAllMocks();
});

/** Render the step, tap "Hear" so the say-it-back control appears, then tap it. */
async function reachSayItBack() {
  const user = userEvent.setup();
  const playSpeech = vi.fn().mockResolvedValue(undefined);
  render(<FirstWinStep stepIndex={4} totalSteps={5} playSpeech={playSpeech} onContinue={() => {}} />);

  await user.click(screen.getByRole('button', { name: /Hear Bom dia/i }));
  const sayBtn = await screen.findByRole('button', { name: /Say it back/i });
  await user.click(sayBtn);
  return user;
}

describe('onboarding Say it back — genuinely listens (TB-6)', () => {
  it('echoes the transcript it heard on success (proves it listened)', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockResolvedValue('bom dia amigo');

    await reachSayItBack();

    expect(await screen.findByText(/I heard you/i)).toBeInTheDocument();
    // The distinctive transcript is echoed back — not the card's "Bom dia!" phrase.
    expect(await screen.findByText(/bom dia amigo/i)).toBeInTheDocument();
  });

  it('offers a retry (not a fake success) when nothing was heard', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockRejectedValue(Object.assign(new Error('no speech'), { code: 'no-speech' }));

    await reachSayItBack();

    expect(await screen.findByText(/Didn.t catch that/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Try again/i })).toBeInTheDocument();
    // Crucially: it does NOT fake the old unconditional success.
    expect(screen.queryByText(/I heard you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/You just said your first Madeiran words/i)).not.toBeInTheDocument();
  });

  it('offers an honest self-confirm (not a fake success) when the mic is unavailable', async () => {
    isAvailable.mockReturnValue(true);
    recognize.mockRejectedValue(Object.assign(new Error('blocked'), { code: 'unavailable' }));

    const user = await reachSayItBack();

    expect(await screen.findByText(/Couldn.t reach the microphone/i)).toBeInTheDocument();
    const iSaidIt = await screen.findByRole('button', { name: /I said it/i });
    expect(screen.queryByText(/I heard you/i)).not.toBeInTheDocument();

    // Tapping the self-confirm resolves the win honestly (user asserts they said it).
    await user.click(iSaidIt);
    await waitFor(() =>
      expect(screen.getByText(/You just said your first Madeiran words/i)).toBeInTheDocument(),
    );
  });
});
