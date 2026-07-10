// File: /Users/liborballaty/.../src/features/legal/__tests__/LegalPage.test.tsx
// Description: Component test for the settled leaf LegalPage (features/legal/LegalPage.tsx) —
//   a controlled bottom-sheet that renders one of three typed legal documents. Verifies the
//   null-doc hidden state, title/version rendering, the draft banner, generic section rendering,
//   and the onClose handler. Does NOT import App/HomeView. framer-motion renders in jsdom; the
//   legal docs are static typed constants (no I/O), so no boundary mocks are needed.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LegalPage, LEGAL_DOCUMENTS } from '../LegalPage';

describe('LegalPage', () => {
  it('renders nothing when doc is null', () => {
    const { container } = render(<LegalPage doc={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the selected document title and version line', () => {
    render(<LegalPage doc="terms" onClose={() => {}} />);
    const terms = LEGAL_DOCUMENTS.terms;
    expect(screen.getByRole('heading', { name: terms.title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Version ${terms.version}`))).toBeInTheDocument();
  });

  it('shows the DRAFT banner for a draft document', () => {
    // Find any doc that is in draft; the seed legal docs ship as drafts pending review.
    const draftId = (Object.keys(LEGAL_DOCUMENTS) as Array<keyof typeof LEGAL_DOCUMENTS>).find(
      (id) => LEGAL_DOCUMENTS[id].status === 'draft',
    );
    if (!draftId) return; // no draft docs -> nothing to assert (published-only is also valid)
    render(<LegalPage doc={draftId} onClose={() => {}} />);
    expect(screen.getByText(/DRAFT — pending legal review/)).toBeInTheDocument();
  });

  it('renders each document section heading', () => {
    render(<LegalPage doc="privacy" onClose={() => {}} />);
    for (const section of LEGAL_DOCUMENTS.privacy.sections) {
      expect(screen.getByRole('heading', { name: section.heading })).toBeInTheDocument();
    }
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<LegalPage doc="ai-use" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
