// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/ConfirmationModal.tsx
// Description: Shared confirm/cancel modal primitive extracted verbatim from App.tsx.
//   Presentational only; state is owned by the caller (see src/hooks/useConfirmationModal.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useId, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../hooks/useFocusTrap';

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false
}: {
  isOpen: boolean,
  onClose: () => void,
  onConfirm: () => void,
  title: string,
  message: string,
  confirmText?: string,
  cancelText?: string,
  isDestructive?: boolean
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card text-text w-full max-w-sm rounded-[32px] p-6 shadow-2xl"
      >
        <h3 id={titleId} className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-ios-gray mb-6">{message}</p>
        <div className="flex flex-col space-y-3">
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={cn(
              "w-full py-4 rounded-2xl font-bold text-white shadow-lg",
              isDestructive ? "bg-red-500 shadow-red-500/20" : "bg-ios-blue shadow-ios-blue/20"
            )}
          >
            {confirmText}
          </button>
          <button
            onClick={onClose}
            className="w-full py-4 bg-ios-bg text-ios-black rounded-2xl font-bold"
          >
            {cancelText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
