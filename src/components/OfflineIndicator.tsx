// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/OfflineIndicator.tsx
// Description: Fixed-position banner that appears when the browser reports offline
//   (navigator.onLine === false). Pairs with the PWA runtime-caching config in
//   vite.config.ts (CONTENT-ARCHITECTURE §10): cached packs/audio + Supabase reads keep
//   working offline, but online-only features (roleplay, pronunciation scoring, scenario
//   generation) should be clearly labeled as unavailable — this banner is that signal.
//   Self-contained, no props, no external state. Renders nothing while online.
//
//   MOUNT SEAM (one line, for a later step that owns src/App.tsx):
//     import OfflineIndicator from './components/OfflineIndicator';
//     ...then render <OfflineIndicator /> once inside the top-level app container,
//     e.g. just inside the <ErrorBoundary> wrapper in App.tsx's authenticated return.
//   Left unmounted here because App.tsx is being edited by another agent (admin nav);
//   mounting it would risk a merge conflict. See plan step offline-pwa-caching.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Renders a small "You're offline" banner while the browser is offline.
 * Returns null when online so it has zero visual footprint in the normal case.
 */
export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-white shadow-md safe-area-top"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      <span>You're offline — cached lessons work; online-only features are paused.</span>
    </div>
  );
}
