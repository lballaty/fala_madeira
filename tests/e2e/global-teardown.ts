// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/global-teardown.ts
// Description: Playwright global-teardown for the regression suite. Deletes the throwaway
//   fake-email user that global-setup created for this run, so test accounts don't accumulate
//   in the live Supabase project. Deletion goes through the `delete-account` edge function using
//   the throwaway user's OWN session (the edge derives the uid from the JWT and deletes with its
//   server-side service-role key) — no client service-role key required. Best-effort: a cleanup
//   failure is logged loudly but never fails the suite (the run's assertions already completed).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEST_USER_SESSION_INFO_PATH,
  type SessionInfo,
} from './support/env';

async function globalTeardown(): Promise<void> {
  let info: SessionInfo;
  try {
    info = JSON.parse(readFileSync(TEST_USER_SESSION_INFO_PATH, 'utf8')) as SessionInfo;
  } catch {
    // No throwaway session on record (setup may have failed before minting one) — nothing to clean.
    // eslint-disable-next-line no-console -- teardown progress, not an app error path
    console.log('[global-teardown] no throwaway test-user session found — skipping cleanup.');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { error: sessionErr } = await supabase.auth.setSession({
      access_token: info.access_token,
      refresh_token: info.refresh_token,
    });
    if (sessionErr) throw sessionErr;

    const { error: invokeErr } = await supabase.functions.invoke('delete-account');
    if (invokeErr) throw invokeErr;

    // eslint-disable-next-line no-console -- teardown progress, not an app error path
    console.log(`[global-teardown] deleted throwaway test user ${info.email} (uid ${info.userId.slice(0, 8)}…).`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Loud but non-fatal: the run's results stand; an orphaned test user is a cleanup miss, not a
    // test failure. Surfaced so the account can be reaped manually if this recurs.
    // eslint-disable-next-line no-console -- teardown warning, not an app error path
    console.warn(`[global-teardown] ⚠ could not delete throwaway test user ${info.email}: ${detail}. ` +
      `The account may need manual removal.`);
  }
}

export default globalTeardown;
