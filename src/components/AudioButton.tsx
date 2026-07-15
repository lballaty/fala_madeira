// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/AudioButton.tsx
// Description: Shared audio "play" button with immediate click feedback (EN-1). Audio playback was
//   fire-and-forget with no DOM state, so when TTS took a moment users tapped repeatedly. This
//   button owns its own click→loading→idle lifecycle: it awaits the (possibly async) onPlay, shows
//   a spinner + disables itself while pending (blocking double-taps), then returns to idle. onPlay
//   should resolve when playback has started (geminiService.playSpeech does). Drop-in for any
//   speaker control; call sites migrate incrementally (EN-1 fast-follow for the remaining ones).
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { useCallback, useState } from 'react';
import type { MouseEvent } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface AudioButtonProps {
  /** Starts playback; may be async. The button shows a loading state until it resolves and ignores
   *  taps while pending, so it can't be spammed. */
  onPlay: () => Promise<void> | void;
  /** Accessible label (e.g. "Play the word", "Play pronunciation"). */
  label: string;
  className?: string;
  /** Stop click propagation (default true) so tapping the speaker inside a card doesn't flip it. */
  stopPropagation?: boolean;
}

export const AudioButton = ({ onPlay, label, className, stopPropagation = true }: AudioButtonProps) => {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(
    async (e: MouseEvent) => {
      if (stopPropagation) e.stopPropagation();
      if (busy) return; // guard double-taps while playback is starting
      setBusy(true);
      try {
        await onPlay();
      } finally {
        setBusy(false);
      }
    },
    [busy, onPlay, stopPropagation],
  );

  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onClick={handleClick}
      className={cn(
        'p-2 rounded-full bg-ios-bg text-ios-blue active:scale-95 transition-transform inline-flex min-w-[44px] min-h-[44px] items-center justify-center disabled:opacity-70',
        className,
      )}
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
    </button>
  );
};
