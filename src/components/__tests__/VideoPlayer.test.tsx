// File: src/components/__tests__/VideoPlayer.test.tsx
// Description: Guards TB-16 — a dead/unparseable video URL used to render NOTHING (return null), so
//   the video section silently vanished ("the videos are gone"). Asserts a valid YouTube URL embeds
//   an iframe, and an invalid/empty URL now shows the explicit "video unavailable" state instead of
//   a blank.
// Author: TB-16 fix (with assistant)
// Created: 2026-07-17

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VideoPlayer } from '../VideoPlayer';

afterEach(cleanup);

describe('VideoPlayer (TB-16 — no silent blank)', () => {
  it('embeds an iframe for a valid YouTube watch URL', () => {
    const { container } = render(<VideoPlayer url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toContain('/embed/dQw4w9WgXcQ');
    expect(screen.queryByTestId('video-unavailable')).toBeNull();
  });

  it('embeds an iframe for a youtu.be short URL', () => {
    const { container } = render(<VideoPlayer url="https://youtu.be/dQw4w9WgXcQ" />);
    expect(container.querySelector('iframe')?.getAttribute('src')).toContain('/embed/dQw4w9WgXcQ');
  });

  it('shows an explicit "video unavailable" state for an unparseable URL (not a blank)', () => {
    render(<VideoPlayer url="https://example.com/not-a-video" />);
    expect(screen.getByTestId('video-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/video unavailable/i)).toBeInTheDocument();
  });

  it('shows the unavailable state for an empty URL rather than rendering nothing', () => {
    const { container } = render(<VideoPlayer url="" />);
    expect(screen.getByTestId('video-unavailable')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
