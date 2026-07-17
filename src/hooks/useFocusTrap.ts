// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useFocusTrap.ts
// Description: Reusable modal/overlay accessibility hook (WCAG 2.2 AA — ENGINEERING-STANDARDS §6).
//   Given a ref to the dialog container and an `active` flag, it: (1) moves focus into the
//   dialog on open, (2) traps Tab/Shift+Tab within the dialog, (3) closes on Escape via the
//   supplied onClose, and (4) restores focus to the trigger on close.
//   STACK-AWARE (LT1/LT2/LT5 fix): nested dialogs (e.g. Correction/SuggestVideo/VocabLookup
//   opened from inside LessonDetailModal) each register on a module-level trap stack and only
//   the TOPMOST trap enforces Tab/Escape — a parent trap never fights its child for focus.
//   STABLE (LT1/LT2/LT5 fix): onClose is read through a ref so an inline arrow prop does NOT
//   re-run the effect each render — previously every keystroke in a child form re-rendered the
//   parent, re-ran its trap effect, and stole focus back mid-typing (the "can't type or paste"
//   bug found in live testing 2026-07-11).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Module-level stack of active trap containers; only the top entry enforces.
const trapStack: HTMLElement[] = [];

/**
 * Trap focus within `containerRef` while `active`, close on Escape, and restore focus to the
 * previously focused element on deactivation. `onClose` is called for Escape only; the caller
 * still owns backdrop-click / button close paths. Safe to pass an inline arrow for `onClose`.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose?: () => void,
): void {
  // Read the latest onClose through a ref so its identity never re-runs the trap effect.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;

    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    trapStack.push(container);
    const isTop = () => trapStack[trapStack.length - 1] === container;

    const getFocusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus into the dialog on open.
    const focusables = getFocusable();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // A trap lower in the stack stays mounted but inert while a child dialog is open.
      if (!isTop()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
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
      const idx = trapStack.lastIndexOf(container);
      if (idx !== -1) trapStack.splice(idx, 1);
      // Restore focus to the trigger, if it's still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // onClose is intentionally NOT a dep (read via ref) — see header.
  }, [active, containerRef]);
}
