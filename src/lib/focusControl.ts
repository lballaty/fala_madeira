// File: src/lib/focusControl.ts
// Description: Reusable "focus a control by its data-testid" primitive (EN-18). Generalizes the
//   scroll-into-view + brief highlight mechanism so both reactive guidance (help chat "Take me
//   there") and proactive guidance (contextual hints) share ONE implementation. Given a controlId
//   it finds [data-testid=controlId], scrolls it into view, moves focus to it when focusable, and
//   applies a short-lived highlight ring. Tab switches re-render asynchronously, so it polls a few
//   animation frames for the element to mount before giving up (safe no-op if never found).
// Author: Lane A (with assistant)
// Created: 2026-07-15

const HIGHLIGHT_CLASSES = ['ring-2', 'ring-ios-blue', 'ring-offset-2', 'ring-offset-card', 'rounded-2xl'];
const HIGHLIGHT_MS = 2200;
const MAX_FRAMES = 30; // ~0.5s at 60fps — long enough for a lazy tab chunk to mount.

function highlight(el: HTMLElement): void {
  el.classList.add(...HIGHLIGHT_CLASSES);
  window.setTimeout(() => {
    el.classList.remove(...HIGHLIGHT_CLASSES);
  }, HIGHLIGHT_MS);
}

/**
 * Scroll to + briefly highlight the control tagged `data-testid={controlId}`. Retries across a few
 * animation frames so it works right after a tab switch (the target may not be mounted yet). Returns
 * a Promise that resolves true when the control was found and acted on, false if it never appeared.
 */
export function focusControl(controlId: string): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let frames = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(controlId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Move keyboard focus to it when it can take focus (buttons, inputs, tabindex).
        if (typeof el.focus === 'function') {
          try {
            el.focus({ preventScroll: true });
          } catch {
            // focus can throw on detached nodes; the highlight below is the meaningful signal.
          }
        }
        highlight(el);
        resolve(true);
        return;
      }
      if (frames++ >= MAX_FRAMES) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
