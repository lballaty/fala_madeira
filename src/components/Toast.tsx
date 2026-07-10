// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/Toast.tsx
// Description: Shared toast pill primitive extracted from App.tsx. Presentational only;
//   toast state is owned by src/hooks/useToast.ts. Position varies by surface (auth screen
//   uses bottom-8, main app uses bottom-24), so the caller passes positionClassName.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

export interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export const Toast = ({ toast, positionClassName }: { toast: ToastState, positionClassName: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 50 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className={cn(
      "fixed left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-xl z-50",
      positionClassName,
      toast.type === 'success' ? "bg-green-500" : "bg-red-500"
    )}
  >
    {toast.message}
  </motion.div>
);
