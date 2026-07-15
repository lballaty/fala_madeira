// File: src/features/guidance/__tests__/navigateToCapability.test.ts
// Description: Unit tests for the EN-18 reactive navigation service. Covers areaToTab mapping,
//   getCapability resolution, and navigateToCapability end-to-end against a jsdom DOM: it switches
//   the correct tab, focuses + highlights the target control when present, is a graceful no-op for
//   an unknown id, and lands on the area (focused:false) for a target-less capability.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  areaToTab,
  getCapability,
  navigateToCapability,
} from '../navigateToCapability';
import { APP_CAPABILITIES } from '../../../content';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('areaToTab', () => {
  it('maps registry areas to concrete tabs', () => {
    expect(areaToTab('home')).toBe('home');
    expect(areaToTab('learning')).toBe('learning');
    expect(areaToTab('practice')).toBe('practice');
    expect(areaToTab('tutor')).toBe('chat');
    expect(areaToTab('profile')).toBe('settings');
    expect(areaToTab('account')).toBe('settings');
  });
});

describe('getCapability', () => {
  it('resolves a known id and returns undefined for an unknown one', () => {
    expect(getCapability('tutor-chat')?.id).toBe('tutor-chat');
    expect(getCapability('does-not-exist')).toBeUndefined();
  });
});

describe('navigateToCapability', () => {
  it('returns ok:false for an unknown id and does not switch tab', async () => {
    const setActiveTab = vi.fn();
    const res = await navigateToCapability('nope', { setActiveTab });
    expect(res.ok).toBe(false);
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('switches to the target tab and focuses the control when it is mounted', async () => {
    // tutor-chat targets area 'tutor' (=> tab 'chat') control 'tab-chat'.
    const el = document.createElement('button');
    el.setAttribute('data-testid', 'tab-chat');
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const setActiveTab = vi.fn();
    const res = await navigateToCapability('tutor-chat', { setActiveTab });

    expect(setActiveTab).toHaveBeenCalledWith('chat');
    expect(res.ok).toBe(true);
    expect(res.tab).toBe('chat');
    expect(res.focused).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it('still switches tab but reports focused:false when the control never mounts', async () => {
    const setActiveTab = vi.fn();
    // 'goal-track' targets 'path-switcher' — not present in this bare DOM.
    const res = await navigateToCapability('goal-track', { setActiveTab });
    expect(setActiveTab).toHaveBeenCalledWith('settings');
    expect(res.ok).toBe(true);
    expect(res.focused).toBe(false);
  });

  it('every capability with a target resolves to a valid tab', async () => {
    for (const cap of APP_CAPABILITIES) {
      if (!cap.target) continue;
      const tab = areaToTab(cap.target.area);
      expect(['home', 'learning', 'practice', 'chat', 'settings']).toContain(tab);
    }
  });
});
