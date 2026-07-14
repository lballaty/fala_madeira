// File: src/components/__tests__/TranslatableText.test.tsx
// Description: Component tests for the TranslatableText shared primitive. Verifies the
//   "immersion first, help on demand" contract: the English translation is hidden by default,
//   a tap reveals it, another tap hides it (via aria-expanded state), and when no translation
//   is supplied the component degrades to plain text with no affordance.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-14

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TranslatableText } from '../TranslatableText';

describe('TranslatableText', () => {
  it('shows the Portuguese text with the translation hidden by default', () => {
    render(<TranslatableText text="Bom dia" translation="Good morning" />);
    expect(screen.getByText('Bom dia')).toBeInTheDocument();
    expect(screen.queryByText('Good morning')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals the translation on tap and hides it on a second tap', () => {
    render(<TranslatableText text="Bom dia" translation="Good morning" />);
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);
    expect(screen.getByText('Good morning')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes an accessible, non-color-only affordance (label + role)', () => {
    render(<TranslatableText text="Olá" translation="Hello" />);
    expect(screen.getByRole('button', { name: /show english translation/i })).toBeInTheDocument();
  });

  it('degrades to plain text with no affordance when no translation is supplied', () => {
    render(<TranslatableText text="Só português" />);
    expect(screen.getByText('Só português')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
