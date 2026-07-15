// File: src/features/settings/UserManualModal.tsx
// Description: User manual sheet — now rendered from the single App Capability Registry
//   (src/content/appCapabilities.ts) grouped by app area (EN-17a, consumer 4a). Replaces the
//   hand-written JSON-in-JSX so the manual and the chat-help prompt never drift again, and
//   fixes the literal-** render bug (the registry's `long` is plain prose, no markdown asterisks).
//   The dialog/focus-trap shell is unchanged.
// Author: Lane A (with assistant)
// Created: 2026-07-09
// Last Updated: 2026-07-15
// Last Updated By: Lane A (with assistant) — EN-17a registry-driven render

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { APP_CAPABILITIES, APP_AREA_LABELS, type AppArea, type AppCapability } from '../../content';

interface UserManualModalProps {
  isUserManualOpen: boolean;
  setIsUserManualOpen: (open: boolean) => void;
}

/** Section order = the order areas first appear in the registry (stable, single source). */
function groupByArea(caps: AppCapability[]): { area: AppArea; items: AppCapability[] }[] {
  const order: AppArea[] = [];
  const buckets = new Map<AppArea, AppCapability[]>();
  for (const c of caps) {
    if (!buckets.has(c.area)) {
      buckets.set(c.area, []);
      order.push(c.area);
    }
    buckets.get(c.area)!.push(c);
  }
  return order.map((area) => ({ area, items: buckets.get(area)! }));
}

export const UserManualModal = ({ isUserManualOpen, setIsUserManualOpen }: UserManualModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleClose = () => setIsUserManualOpen(false);
  useFocusTrap(dialogRef, isUserManualOpen, handleClose);
  const sections = groupByArea(APP_CAPABILITIES);
  return (
  <AnimatePresence>
    {isUserManualOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card w-full max-w-md h-[80vh] rounded-[32px] overflow-hidden flex flex-col ios-shadow"
        >
          <div className="p-6 border-b border-ios-bg flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">User Manual</h2>
            <button onClick={handleClose} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar" data-testid="user-manual-body">
            {sections.map(({ area, items }) => (
              <section key={area} className="space-y-4" data-testid={`manual-area-${area}`}>
                <h3 className="text-ios-blue font-bold text-lg">{APP_AREA_LABELS[area]}</h3>
                {items.map((cap) => (
                  <div key={cap.id} className="space-y-1" data-testid={`manual-cap-${cap.id}`}>
                    <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">{cap.title}</h4>
                    <p className="text-sm text-ios-gray leading-relaxed">{cap.long}</p>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
