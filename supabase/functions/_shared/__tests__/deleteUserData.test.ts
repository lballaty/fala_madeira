// File: supabase/functions/_shared/__tests__/deleteUserData.test.ts
// Description: Guards EN-27 P0.1 — the account-deletion privacy bug where supabase-js returns
//   PostgREST failures in `{ error }` (it does NOT throw), so the old inline delete loop could fail
//   a table and still report `{ deleted: true }`, leaving a partially-deleted account. deleteUserData
//   is the runtime-agnostic orchestrator that fixed it; these tests drive it with a fake executor
//   and prove: (1) all-succeed -> ok; (2) a mid-sequence error -> ok:false at that exact table,
//   later tables are NOT attempted, and ok is NEVER true on a failure.
// Author: EN-27 error-hardening plan (WP-A a-test)
// Created: 2026-07-17

import { describe, it, expect } from 'vitest';
import { deleteUserData, type DeleteExecutor } from '../deleteUserData';

const UID = '11111111-1111-1111-1111-111111111111';
const UID_TEXT = UID;

describe('deleteUserData (EN-27 P0.1 partial-failure guard)', () => {
  it('returns ok:true and completes every table when all deletes succeed', async () => {
    const attempted: string[] = [];
    const exec: DeleteExecutor = (table) => {
      attempted.push(table);
      return Promise.resolve({ error: null });
    };

    const result = await deleteUserData(exec, UID, UID_TEXT);

    expect(result.ok).toBe(true);
    expect(result.failedTable).toBeUndefined();
    // All seven owned-row tables were attempted, in order.
    expect(attempted).toEqual([
      'lessons',
      'lesson_requests',
      'tickets',
      'logs',
      'video_suggestions',
      'lesson_corrections',
      'profiles',
    ]);
    expect(result.stepsCompleted).toBe(7);
  });

  it('stops at the first {error}, reports the failing table, and NEVER returns ok:true', async () => {
    const attempted: string[] = [];
    // Fail on the 4th delete ("logs") — a mid-sequence failure.
    const exec: DeleteExecutor = (table) => {
      attempted.push(table);
      if (table === 'logs') return Promise.resolve({ error: { message: 'permission denied' } });
      return Promise.resolve({ error: null });
    };

    const result = await deleteUserData(exec, UID, UID_TEXT);

    expect(result.ok).toBe(false);
    expect(result.failedTable).toBe('logs');
    expect(result.stepsCompleted).toBe(3); // lessons, lesson_requests, tickets succeeded
    // CRITICAL: later tables were NOT attempted — no silent continue-past-failure.
    expect(attempted).toEqual(['lessons', 'lesson_requests', 'tickets', 'logs']);
    expect(attempted).not.toContain('profiles');
  });

  it('reports failure on the very first table without attempting any other', async () => {
    const attempted: string[] = [];
    const exec: DeleteExecutor = (table) => {
      attempted.push(table);
      return Promise.resolve({ error: { message: 'db down' } });
    };

    const result = await deleteUserData(exec, UID, UID_TEXT);

    expect(result.ok).toBe(false);
    expect(result.failedTable).toBe('lessons');
    expect(result.stepsCompleted).toBe(0);
    expect(attempted).toEqual(['lessons']);
  });
});
