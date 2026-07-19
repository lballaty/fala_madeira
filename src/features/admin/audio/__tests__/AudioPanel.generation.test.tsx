// File: src/features/admin/audio/__tests__/AudioPanel.generation.test.tsx
// Description: EN-34 c2 (W5, Refinement A) presentational coverage — the "gen N" indicator. AudioPanel
//   is a pure shell over the UseAudioReview contract, so it is rendered with a hand-built audio prop
//   (no hook, no DB): a clip whose resolved generation is ≥ 2 (re-recorded) MUST surface the
//   "gen N" badge next to the tier badges, and a generation-1 (or undefined) clip MUST NOT — gen 1 is
//   the un-regenerated default and stays unlabelled to avoid noise. This is the DURABLE gate for the
//   badge (the e2e manifest stub is served through the PWA service worker, which page.route cannot
//   intercept, so the browser-level assertion was removed in favour of this unit test).
// Author: claude-opus-runner (EN-34 c2)
// Created: 2026-07-19

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../../../../content/repository', () => ({
  contentRepository: { listTracks: vi.fn(async () => []) },
}));

import { AudioPanel } from '../AudioPanel';
import { AudioReviewItem } from '../types';
import { UseAudioReview } from '../useAudioReview';

const item = (over: Partial<AudioReviewItem>): AudioReviewItem => ({
  buildKey: over.buildKey ?? 'tts:default:default:abc123',
  text: over.text ?? 'Olá',
  voice: 'default',
  voiceType: undefined,
  situationId: 'sit-1',
  level: 0 as AudioReviewItem['level'],
  verdict: 'unreviewed',
  notes: null,
  deviceTier: 'missing',
  serverTier: 'present',
  signals: {},
  queued: false,
  ...over,
});

const makeAudio = (items: AudioReviewItem[]): UseAudioReview => ({
  scope: { level: 0 as AudioReviewItem['level'] },
  setScope: vi.fn(),
  items,
  loading: false,
  loadingMore: false,
  totalCount: items.length,
  hasMore: false,
  loadMore: vi.fn(async () => {}),
  serverTierAvailable: true, // so the server badge (and thus the gen badge alongside it) renders
  reload: vi.fn(),
  setVerdict: vi.fn(async () => {}),
  enqueue: vi.fn(async () => {}),
  getPlaybackUrl: vi.fn(async () => null),
});

const rowFor = (buildKey: string): HTMLElement => {
  const rows = screen.getAllByTestId('audio-clip-row');
  const row = rows.find((r) => r.getAttribute('data-build-key') === buildKey);
  if (!row) throw new Error(`no row for ${buildKey}`);
  return row;
};

describe('AudioPanel — generation indicator (EN-34 c2 / W5)', () => {
  it('renders "gen N" for a re-recorded clip (generation >= 2)', () => {
    render(<AudioPanel audio={makeAudio([item({ buildKey: 'k-regen', text: 'Bom dia', generation: 2 })])} />);
    const badge = within(rowFor('k-regen')).getByTestId('audio-generation');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/gen 2/i);
  });

  it('renders a higher generation verbatim (e.g. gen 5)', () => {
    render(<AudioPanel audio={makeAudio([item({ buildKey: 'k-gen5', generation: 5 })])} />);
    expect(within(rowFor('k-gen5')).getByTestId('audio-generation')).toHaveTextContent(/gen 5/i);
  });

  it('does NOT render the indicator for a generation-1 clip (un-regenerated default)', () => {
    render(<AudioPanel audio={makeAudio([item({ buildKey: 'k-gen1', generation: 1 })])} />);
    expect(within(rowFor('k-gen1')).queryByTestId('audio-generation')).toBeNull();
  });

  it('does NOT render the indicator when generation is undefined (absent → treat as 1)', () => {
    render(<AudioPanel audio={makeAudio([item({ buildKey: 'k-none', generation: undefined })])} />);
    expect(within(rowFor('k-none')).queryByTestId('audio-generation')).toBeNull();
  });
});
