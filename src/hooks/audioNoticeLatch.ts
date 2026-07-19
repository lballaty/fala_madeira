// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/audioNoticeLatch.ts
// Description: EN-31 GAP 2/3 — session-scoped, app-wide dedupe latches for the two audio toasts
//   (the "audio couldn't play" error toast and the calm "using device voice" degradation notice).
//   Kept in this dedicated module, behind FUNCTION accessors, on purpose: the latch state is
//   module-scoped so it dedupes across every audio surface (a session-long outage would otherwise
//   pop one toast per play), but it must NOT be mutated as a bare variable inside the useSpeechPlayback
//   hook body — the react-compiler lint rule forbids mutating render-reachable module state there and
//   mis-scopes the whole hook when it sees such a mutation. Exposing get/set as opaque function calls
//   keeps the mutation out of the hook's render scope, so the hook compiles cleanly. EVERY failure is
//   still logged by the caller — only the user-facing toast is deduped here, never the log.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-20

// GAP 3: once-per-OUTAGE dedupe of the "audio couldn't play" toast. A SUCCESSFUL play re-arms it via
// rearmFailure(), so recovery-then-new-outage notifies again (a strict once-per-whole-session would
// hide later failures, defeating EN-31's purpose).
let failureNotified = false;

// GAP 2 (WP-D): once-per-SESSION latch for the calm "using device voice" degradation notice.
// Degradation (server TTS down → device fallback) is EXPECTED graceful behavior, not an error, so it
// earns at most one non-alarming info toast per session — never the red error toast, never per play.
// It does NOT re-arm on recovery: explain the quality drop once, not nag.
let degradedNotified = false;

export const audioNoticeLatch = {
  isFailureNotified: (): boolean => failureNotified,
  markFailureNotified: (): void => { failureNotified = true; },
  /** A successful play re-arms the failure notice so the next outage is surfaced again. */
  rearmFailure: (): void => { failureNotified = false; },
  isDegradedNotified: (): boolean => degradedNotified,
  markDegradedNotified: (): void => { degradedNotified = true; },
};

/** Test-only: reset the once-per-outage failure-toast latch between cases. */
export const __resetAudioFailureNotified = (): void => { failureNotified = false; };
/** Test-only: reset the once-per-session degradation-notice latch between cases. */
export const __resetAudioDegradedNotified = (): void => { degradedNotified = false; };
