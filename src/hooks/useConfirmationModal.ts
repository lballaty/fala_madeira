// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useConfirmationModal.ts
// Description: Cross-cutting confirmation-dialog state hook extracted from App.tsx. Owns the
//   confirmModal slot consumed by src/components/ConfirmationModal.tsx; callers open it via
//   requestConfirmation(...) (e.g. account deletion, diagnostic log collection).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useState } from 'react';

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  isDestructive?: boolean;
}

export const useConfirmationModal = () => {
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const requestConfirmation = (options: Omit<ConfirmModalState, 'isOpen'>) => {
    setConfirmModal({ ...options, isOpen: true });
  };

  const closeConfirmation = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  return { confirmModal, requestConfirmation, closeConfirmation };
};
