// File: src/components/TranslatableText.tsx
// Description: Shared presentational primitive for the "immersion first, help on demand"
//   translation model (PRODUCT-DESIGN-TARGET). Renders a Portuguese line with a subtle
//   tap-to-reveal affordance (dotted underline + a Languages glyph — icon+text, never
//   color-only, per ENGINEERING-STANDARDS §Contrast); tapping expands the English translation
//   inline beneath it (framer-motion), tapping again hides it. Purely presentational: the
//   translation is passed in from content (src/content) — this component does NO data fetching
//   and holds NO feature logic, so it can be reused across feature slices (phrases, learning,
//   listening, simulator) per ENGINEERING-STANDARDS §1.2 (shared components are presentational
//   primitives only). When no translation is supplied it degrades to plain text (no affordance).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-14

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Languages } from 'lucide-react';
import { cn } from '../lib/utils';

interface TranslatableTextProps {
  /** The Portuguese text shown by default. */
  text: string;
  /** English translation revealed on tap. When omitted, renders plain text (no affordance). */
  translation?: string;
  /** Optional class applied to the Portuguese text. */
  className?: string;
}

export const TranslatableText = ({ text, translation, className }: TranslatableTextProps) => {
  const [revealed, setRevealed] = useState(false);

  // No translation available → plain text, no affordance (graceful degradation).
  if (!translation) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className="inline-block">
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-expanded={revealed}
        aria-label={revealed ? 'Hide English translation' : 'Show English translation'}
        className={cn(
          'inline-flex items-center gap-1 text-left underline decoration-dotted decoration-ios-gray/50 underline-offset-4',
          className,
        )}
      >
        <span>{text}</span>
        <Languages className="w-3.5 h-3.5 shrink-0 text-ios-gray/60" aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {revealed && (
          <motion.span
            key="translation"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="block overflow-hidden text-ios-gray text-sm mt-1"
          >
            {translation}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};
