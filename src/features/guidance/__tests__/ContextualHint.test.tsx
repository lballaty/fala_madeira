// File: src/features/guidance/__tests__/ContextualHint.test.tsx
// Description: Component tests for the EN-18 proactive ContextualHint: renders (with the CTA) only
//   when `when` is true and the capability has a navigable target; renders nothing when gated off
//   or when the capability id is unknown; the CTA switches to the target tab.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContextualHint } from '../ContextualHint';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ContextualHint', () => {
  it('renders nothing when gated off', () => {
    const { container } = render(
      <ContextualHint capabilityId="learning-roadmap" when={false} setActiveTab={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for an unknown capability id', () => {
    const { container } = render(
      <ContextualHint capabilityId="does-not-exist" when setActiveTab={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the hint + CTA and navigates to the target tab on tap', () => {
    const setActiveTab = vi.fn();
    render(
      <ContextualHint capabilityId="learning-roadmap" when setActiveTab={setActiveTab} />,
    );
    expect(screen.getByTestId('contextual-hint-learning-roadmap')).toBeTruthy();
    fireEvent.click(screen.getByTestId('hint-take-me-there-learning-roadmap'));
    expect(setActiveTab).toHaveBeenCalledWith('learning');
  });

  it('uses an override message when provided', () => {
    render(
      <ContextualHint
        capabilityId="learning-roadmap"
        when
        setActiveTab={vi.fn()}
        message="Custom nudge copy"
      />,
    );
    expect(screen.getByText('Custom nudge copy')).toBeTruthy();
  });
});
