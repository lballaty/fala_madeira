// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/hooks/useOnlineStatus.ts
// Description: Shared browser-connectivity subscription (navigator.onLine + online/offline events).
//   The single source online-only features consume to render the calm §10 "online only" surface
//   (Situation Simulator, pronunciation scoring, scenario/error-analysis generation) and that the
//   offline write queue's UI badges can read. Dedupe note: SimulatorView.tsx has an inline
//   `useIsOnline` with byte-identical logic; it should import this shared hook instead. That view
//   lives under the recently-built simulator tree (owned elsewhere), so the swap is left as a
//   one-line follow-up rather than done here. SSR-safe: assumes online when navigator/window absent.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useEffect, useState } from 'react';

/**
 * True while the browser reports connectivity. Re-renders on the `online`/`offline`
 * window events. Note navigator.onLine only guarantees "no network" when false; a
 * true value means "has a link", not "the server is reachable" — online-only
 * features still surface typed errors when a call fails despite a link.
 */
export const useOnlineStatus = (): boolean => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
};
