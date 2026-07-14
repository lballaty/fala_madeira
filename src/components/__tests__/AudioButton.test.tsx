// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/__tests__/AudioButton.test.tsx
// Description: Regression for the shared AudioButton click feedback (EN-1). Audio was fire-and-forget
//   with no state, so users tapped repeatedly during the TTS delay. These tests prove the button
//   goes busy + disabled while onPlay is pending (feedback + double-tap guard) and returns to idle
//   when it resolves, and that a second tap while pending does NOT re-invoke onPlay.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioButton } from '../AudioButton';

describe('AudioButton — click feedback (EN-1)', () => {
  it('goes busy + disabled while playback is starting, then back to idle', async () => {
    const user = userEvent.setup();
    let resolvePlay: () => void = () => {};
    const onPlay = vi.fn(() => new Promise<void>((r) => { resolvePlay = r; }));

    render(<AudioButton onPlay={onPlay} label="Play the word" />);
    const btn = screen.getByRole('button', { name: 'Play the word' });
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(btn).toBeEnabled();

    await user.click(btn);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled(); // feedback + blocks double-taps while pending
    expect(btn).toHaveAttribute('aria-busy', 'true');

    resolvePlay();
    await waitFor(() => expect(btn).toBeEnabled());
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('ignores a second tap while playback is still pending', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn(() => new Promise<void>(() => {})); // never resolves → stays pending
    render(<AudioButton onPlay={onPlay} label="Play" />);
    const btn = screen.getByRole('button', { name: 'Play' });

    await user.click(btn);
    await user.click(btn); // disabled + busy guard → no second invocation
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
