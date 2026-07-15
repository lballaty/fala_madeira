// File: src/features/guidance/ContextualHint.tsx
// Description: Proactive contextual hint (EN-18, consumer 4d). A small, condition-gated banner that
//   references a capability by id and offers a one-tap "Take me there" via the shared navigate
//   service — the app surfacing the right control at the right moment WITHOUT being asked. Renders
//   nothing when `when` is false (so callers can inline it) and nothing when the referenced
//   capability has no navigable target. Guide-and-offer only: it never performs an action for the
//   user. This is the single proactive-surfacing pattern (empty states, first-use nudges, deep
//   links) rather than a bespoke component per site.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { MapPin, Sparkles, X } from 'lucide-react';
import { getCapability, navigateToCapability, type TabId } from './navigateToCapability';

interface ContextualHintProps {
  /** The capability this hint points at (its title/target drive the CTA + navigation). */
  capabilityId: string;
  /** Gate: render only when true. Lets callers inline the hint at a friction point. */
  when: boolean;
  /** App's tab setter — threaded so navigation reuses the one shell seam. */
  setActiveTab: (tab: TabId) => void;
  /** Optional override copy; defaults to the capability's `short`. */
  message?: string;
  /** Optional dismiss handler — renders a close button when provided. */
  onDismiss?: () => void;
}

export const ContextualHint = ({
  capabilityId,
  when,
  setActiveTab,
  message,
  onDismiss,
}: ContextualHintProps) => {
  const cap = getCapability(capabilityId);
  if (!when || !cap || !cap.target?.controlId) return null;

  return (
    <div
      data-testid={`contextual-hint-${cap.id}`}
      className="flex items-start gap-3 p-3 rounded-2xl bg-ios-blue/5 border border-ios-blue/10"
    >
      <div className="w-8 h-8 rounded-full bg-ios-blue/10 text-ios-blue flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-[13px] text-text leading-snug">{message ?? cap.short}</p>
        <button
          type="button"
          data-testid={`hint-take-me-there-${cap.id}`}
          onClick={() => {
            void navigateToCapability(cap.id, { setActiveTab });
          }}
          className="inline-flex items-center space-x-1 text-xs font-semibold text-ios-blue bg-ios-blue/10 hover:bg-ios-blue/20 px-3 py-1.5 rounded-full transition-colors min-h-[36px]"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Take me to {cap.title}</span>
        </button>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss hint"
          onClick={onDismiss}
          className="p-1.5 text-ios-gray hover:text-text rounded-full min-w-[32px] min-h-[32px] flex items-center justify-center flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
