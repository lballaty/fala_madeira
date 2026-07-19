// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useToast.ts
// Description: Cross-cutting toast state hook extracted from App.tsx. Owns the single toast
//   slot and the auto-dismiss timer (config.ui.toastDismissMs); rendering is done by
//   src/components/Toast.tsx.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useRef, useState } from 'react';
import { ToastState, ToastAction } from '../components/Toast';
import { logger } from '../lib/logger';
import { config } from '../config';

export interface ToastOptions {
  /** Inline action buttons (EN-31 WP-C, e.g. Retry). An actionable toast stays up longer so the
   *  user has time to act, and taking any action dismisses it. */
  actions?: ToastAction[];
  /** Override the auto-dismiss window (ms). Defaults to the standard window, or the longer
   *  action window when actions are present. */
  durationMs?: number;
}

export type ShowToast = (message: string, type?: ToastState['type'], options?: ToastOptions) => void;

export const useToast = () => {
  const [toast, setToast] = useState<ToastState | null>(null);
  // Single toast slot → a prior toast's dismiss timer must be cleared, else it fires while a NEWER
  // toast is showing and dismisses it early (visible as actionable toasts vanishing mid-read).
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
    setToast(null);
  };

  const showToast: ShowToast = (message, type = 'success', options) => {
    logger.debug('toast_shown', message, { category: 'USER_ACTION', details: { type, actions: options?.actions?.length ?? 0 } });
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    // Wrap each action so taking it also closes the toast (in addition to its own handler).
    const actions = options?.actions?.map(a => ({ ...a, onClick: () => { a.onClick(); dismiss(); } }));
    setToast({ message, type, actions });
    const duration = options?.durationMs ?? (actions?.length ? config.ui.toastActionDismissMs : config.ui.toastDismissMs);
    dismissTimer.current = setTimeout(() => setToast(null), duration);
  };

  return { toast, showToast };
};
