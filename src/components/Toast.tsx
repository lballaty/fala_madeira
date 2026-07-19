// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/Toast.tsx
// Description: Shared toast pill primitive extracted from App.tsx. Presentational only;
//   toast state is owned by src/hooks/useToast.ts. Position varies by surface (auth screen
//   uses bottom-8, main app uses bottom-24), so the caller passes positionClassName.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

// EN-31 WP-C: an optional inline action (e.g. Retry) rendered alongside the message. The dismiss
// wiring lives in useToast (taking an action also closes the toast); this stays presentational.
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  message: string;
  // 'info' (EN-31 WP-D) is the calm, non-alarming variant for expected degradation notices — it is
  // deliberately NOT the red 'error' style, so "using your device voice" never reads as a fault.
  type: 'success' | 'error' | 'info';
  actions?: ToastAction[];
}

const TOAST_BG: Record<ToastState['type'], string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-slate-700',
};

export const Toast = ({ toast, positionClassName }: { toast: ToastState, positionClassName: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 50 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    // A failure the user can't hear must still reach assistive tech; errors interrupt, the rest are polite.
    role={toast.type === 'error' ? 'alert' : 'status'}
    aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    className={cn(
      // z-[100] keeps the toast above every modal overlay (lesson-detail/correction/vocab are
      // z-50, suggest-video is z-[60]); at z-50 the toast rendered *behind* open modals, so
      // success/error feedback was invisible and submits looked like no-ops.
      "fixed left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-xl z-[100] flex items-center gap-3",
      positionClassName,
      TOAST_BG[toast.type]
    )}
  >
    <span>{toast.message}</span>
    {toast.actions?.map((action, i) => (
      <button
        key={i}
        type="button"
        onClick={action.onClick}
        className="shrink-0 px-2 py-1 -my-1 rounded-full underline underline-offset-2 font-bold hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        {action.label}
      </button>
    ))}
  </motion.div>
);
