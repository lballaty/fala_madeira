// File: src/features/guidance/navigateToCapability.ts
// Description: Reactive navigation service (EN-18, consumer 4c). Resolves a capability from the
//   App Capability Registry by id, switches to its target area's tab (reusing App's setActiveTab),
//   then focuses the target control via the shared focusControl primitive. This is the single
//   "take me there" entry reused by the help chat's affordance and by contextual hints — one
//   mechanism, guide-and-offer only (it navigates + highlights; it never performs an action for
//   the user). Pure of App internals beyond the injected setActiveTab, so it stays testable.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { APP_CAPABILITIES, type AppArea, type AppCapability } from '../../content';
import { focusControl } from '../../lib/focusControl';

/** The App's primary tab ids (mirrors App.tsx TabId). */
export type TabId = 'home' | 'learning' | 'practice' | 'chat' | 'settings';

/** Map a registry AppArea to the concrete tab it lives on. */
export function areaToTab(area: AppArea): TabId {
  switch (area) {
    case 'home':
      return 'home';
    case 'learning':
      return 'learning';
    case 'practice':
      return 'practice';
    case 'tutor':
      return 'chat';
    case 'profile':
    case 'account':
      return 'settings';
  }
}

const BY_ID = new Map<string, AppCapability>(APP_CAPABILITIES.map((c) => [c.id, c]));

/** Resolve a capability by id (undefined if unknown). */
export function getCapability(id: string): AppCapability | undefined {
  return BY_ID.get(id);
}

export interface NavigateDeps {
  /** App's tab setter — the one seam into the shell. */
  setActiveTab: (tab: TabId) => void;
}

export interface NavigateResult {
  ok: boolean;
  /** The tab we switched to (when the capability resolved). */
  tab?: TabId;
  /** Whether the target control was found + focused (false when target-less or not mounted). */
  focused?: boolean;
}

/**
 * Navigate to the capability's control: switch tab, then scroll to + highlight the control.
 * Resolves ok:false for an unknown id. When the capability has no `target`, it still switches to
 * the capability's own area (best-effort landing) and reports focused:false.
 */
export async function navigateToCapability(id: string, deps: NavigateDeps): Promise<NavigateResult> {
  const cap = BY_ID.get(id);
  if (!cap) return { ok: false };

  const area = cap.target?.area ?? cap.area;
  const tab = areaToTab(area);
  deps.setActiveTab(tab);

  const controlId = cap.target?.controlId;
  if (!controlId) return { ok: true, tab, focused: false };

  const focused = await focusControl(controlId);
  return { ok: true, tab, focused };
}
