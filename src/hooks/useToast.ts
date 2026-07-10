// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useToast.ts
// Description: Cross-cutting toast state hook extracted from App.tsx. Owns the single toast
//   slot and the auto-dismiss timer (config.ui.toastDismissMs); rendering is done by
//   src/components/Toast.tsx.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useState } from 'react';
import { ToastState } from '../components/Toast';
import { logger } from '../lib/logger';
import { config } from '../config';

export type ShowToast = (message: string, type?: 'success' | 'error') => void;

export const useToast = () => {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast: ShowToast = (message, type = 'success') => {
    logger.debug('toast_shown', message, { category: 'USER_ACTION', details: { type } });
    setToast({ message, type });
    setTimeout(() => setToast(null), config.ui.toastDismissMs);
  };

  return { toast, showToast };
};
