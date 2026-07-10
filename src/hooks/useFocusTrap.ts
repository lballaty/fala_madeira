// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useFocusTrap.ts
// Description: Reusable modal/overlay accessibility hook (WCAG 2.2 AA — ENGINEERING-STANDARDS §6).
//   Given a ref to the dialog container and an `active` flag, it: (1) moves focus into the
//   dialog on open (first focusable element, else the container), (2) traps Tab/Shift+Tab so
//   focus cycles within the dialog and never escapes to the page behind, (3) closes on Escape
//   via the supplied onClose, and (4) restores focus to the element that had it before the
//   dialog opened (the trigger) on close. Behavior-preserving: pair with role="dialog" +
//   aria-modal="true" + aria-labelledby on the container element the ref points at.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Trap focus within `containerRef` while `active`, close on Escape, and restore focus to the
 * previously focused element on deactivation. `onClose` is called for Escape only; the caller
 * still owns backdrop-click / button close paths.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose?: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;

    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus into the dialog on open.
    const focusables = getFocusable();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      // No focusable child — make the container itself focusable so focus doesn't stay behind.
      if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !container.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Restore focus to the trigger, if it's still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, onClose]);
}
