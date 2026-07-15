// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/sync-queue.guard.test.ts
// Description: SEC-2 regression. The offline write queue (sync:queue) is device-global; on a shared
//   device it must never replay one user's queued write under a different signed-in user (RLS is
//   the server backstop, this is client-side defense in depth + keeps the queue clean). Proves the
//   pure guard isForeignQueueEntry: foreign entries are flagged (retained/skipped by flush), the
//   signed-in user's own entries and non-user-table entries are not, and signed-out never blocks.
// Author: Lane B (with assistant)
// Created: 2026-07-15

import { describe, it, expect } from 'vitest';
import { isForeignQueueEntry } from '../sync-queue';

const entry = (payload: unknown) => ({ payload } as Parameters<typeof isForeignQueueEntry>[0]);

describe('isForeignQueueEntry (SEC-2 cross-user drain guard)', () => {
  it('flags an entry owned by a different user than the signed-in one', () => {
    expect(isForeignQueueEntry(entry({ user_id: 'userA', situation_id: 's1' }), 'userB')).toBe(true);
  });

  it('does NOT flag the signed-in user\'s own entry', () => {
    expect(isForeignQueueEntry(entry({ user_id: 'userB', situation_id: 's1' }), 'userB')).toBe(false);
  });

  it('does NOT flag an entry with no user_id (non-user table)', () => {
    expect(isForeignQueueEntry(entry({ pack_id: 'p1' }), 'userB')).toBe(false);
    expect(isForeignQueueEntry(entry(null), 'userB')).toBe(false);
  });

  it('never flags when signed out (null session user) — RLS is the backstop', () => {
    expect(isForeignQueueEntry(entry({ user_id: 'userA' }), null)).toBe(false);
  });

  it('ignores a non-string user_id defensively', () => {
    expect(isForeignQueueEntry(entry({ user_id: 12345 }), 'userB')).toBe(false);
  });
});
