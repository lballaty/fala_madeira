// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/global-setup.ts
// Description: Playwright global-setup for the regression suite. It mints TWO live sessions
//   against Supabase: (1) the real admin account, and (2) a throwaway fake-email user created
//   at runtime. Both are serialized into Playwright storageState files so later specs can mount
//   either role deterministically without touching the AuthScreen.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FullConfig } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  makeTestUserCreds,
  readAdminCreds,
  assertEnv,
  ADMIN_STORAGE_STATE_PATH,
  ADMIN_SESSION_INFO_PATH,
  TEST_USER_STORAGE_STATE_PATH,
  TEST_USER_SESSION_INFO_PATH,
  type SessionInfo,
} from './support/env';

function persistSession(origin: string, path: string, authStorageKey: string, session: Session) {
  const persisted = {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  };

  const storageState = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [{ name: authStorageKey, value: JSON.stringify(persisted) }],
      },
    ],
  };

  writeFileSync(path, JSON.stringify(storageState, null, 2));
}

function persistSessionInfo(path: string, info: SessionInfo) {
  writeFileSync(path, JSON.stringify(info, null, 2));
}

async function signInAdmin(origin: string): Promise<void> {
  const { email, password } = readAdminCreds();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(
      `global-setup: admin signInWithPassword failed for ${email}: ${error?.message ?? 'no session returned'}.`,
    );
  }

  persistSession(origin, ADMIN_STORAGE_STATE_PATH, SUPABASE_AUTH_STORAGE_KEY, data.session);
  persistSessionInfo(ADMIN_SESSION_INFO_PATH, {
    userId: data.user.id,
    email: data.user.email ?? email,
    password,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  // eslint-disable-next-line no-console -- setup progress, not an app error path
  console.log(`[global-setup] admin session minted for ${email} (uid ${data.user.id.slice(0, 8)}…)`);
}

async function signUpTestUser(origin: string): Promise<void> {
  const { email, password } = makeTestUserCreds();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: origin,
      data: {
        has_accepted_terms: true,
        has_accepted_ai_usage: true,
      },
    },
  });
  if (error || !data.session || !data.user) {
    throw new Error(
      `global-setup: throwaway user signUp failed for ${email}: ${error?.message ?? 'no session returned'}. ` +
        `The e2e suite requires Supabase email confirmation to be disabled for test users.`,
    );
  }

  persistSession(origin, TEST_USER_STORAGE_STATE_PATH, SUPABASE_AUTH_STORAGE_KEY, data.session);
  persistSessionInfo(TEST_USER_SESSION_INFO_PATH, {
    userId: data.user.id,
    email: data.user.email ?? email,
    password,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  // eslint-disable-next-line no-console -- setup progress, not an app error path
  console.log(`[global-setup] throwaway test user created for ${email} (uid ${data.user.id.slice(0, 8)}…)`);
}

async function globalSetup(config: FullConfig): Promise<void> {
  assertEnv();
  const baseURL = config.projects[0]?.use?.baseURL || process.env.BASE_URL || 'http://localhost:4173';
  const origin = new URL(baseURL as string).origin;

  mkdirSync(dirname(TEST_USER_STORAGE_STATE_PATH), { recursive: true });
  await signInAdmin(origin);
  await signUpTestUser(origin);
}

export default globalSetup;
