// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/session-cleanup.test.ts
// Description: SEC-2 regression. clearDeviceUserState() runs on logout so the next user on a shared
//   device inherits no device-global client state. Proves it removes the write-only per-month
//   lesson cache (localStorage active_lessons_month_*), leaves unrelated keys intact, and deletes
//   the anonymous device-local missions list + the legacy non-namespaced path-selection mirror
//   from platform.storage. The TTS audio-blob cache is intentionally NOT cleared here (EN-8 WP4).
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../platform', () => ({
  platform: { storage: { delete: vi.fn(async () => {}) } },
}));

import { platform } from '../../platform';
import { config } from '../../config';
import { MISSIONS_LOCAL_KEY } from '../../features/practice/missions/missionsStore';
import { clearDeviceUserState } from '../session-cleanup';

describe('clearDeviceUserState (SEC-2 logout cleanup)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('removes every active_lessons_month_* key but leaves unrelated localStorage intact', async () => {
    localStorage.setItem('active_lessons_month_1', '[{"id":"a"}]');
    localStorage.setItem('active_lessons_month_2', '[{"id":"b"}]');
    localStorage.setItem('fm_theme', 'dark'); // unrelated device pref — must survive

    await clearDeviceUserState();

    expect(localStorage.getItem('active_lessons_month_1')).toBeNull();
    expect(localStorage.getItem('active_lessons_month_2')).toBeNull();
    expect(localStorage.getItem('fm_theme')).toBe('dark');
  });

  it('deletes the anonymous missions list and the legacy path-selection mirror from KV', async () => {
    await clearDeviceUserState();
    const deleted = (platform.storage.delete as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(deleted).toContain(MISSIONS_LOCAL_KEY);
    expect(deleted).toContain(config.paths.selectionStorageKey);
  });

  it('does NOT clear the TTS audio-blob cache (deferred to EN-8, WP4)', async () => {
    await clearDeviceUserState();
    const deleted = (platform.storage.delete as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(deleted.some((k) => k.startsWith('tts:'))).toBe(false);
  });
});
