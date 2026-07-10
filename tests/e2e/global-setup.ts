// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/global-setup.ts
// Description: Playwright global-setup for the vertical-slice e2e suite. Mints a real admin
//   session against the LIVE Supabase project via supabase-js signInWithPassword (a magic
//   link is not automatable — programmatic sign-in is the robust path, docs/TEST-VERTICAL-
//   SLICES.md S1). The minted session is written into a Playwright storageState as the
//   supabase-js localStorage entry (`sb-<ref>-auth-token`) so the app's auth bootstrap
//   (supabase.auth.getUser()) restores it and every spec reuses the session without touching
//   the AuthScreen form. The admin userId is stashed in a sidecar file for the onboarding
//   IndexedDB seed (support/fixtures.ts). Never deletes the admin account.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  readAdminCreds,
  assertEnv,
  REPO_ROOT_DIR,
} from './support/env';

const AUTH_DIR = resolve(REPO_ROOT_DIR, 'tests/e2e/.auth');
const STORAGE_STATE_PATH = resolve(AUTH_DIR, 'admin.json');
const SESSION_INFO_PATH = resolve(AUTH_DIR, 'admin-session.json');

async function globalSetup(config: FullConfig): Promise<void> {
  assertEnv();
  const { email, password } = readAdminCreds();

  const baseURL = config.projects[0]?.use?.baseURL || process.env.BASE_URL || 'http://localhost:4173';
  const origin = new URL(baseURL as string).origin;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(
      `global-setup: admin signInWithPassword failed for ${email}: ${error?.message ?? 'no session returned'}. ` +
        `Verify .admin-temp-credentials.txt is current against project.`,
    );
  }

  const session = data.session;

  // supabase-js persists the whole session object under `sb-<ref>-auth-token` (JSON string).
  // Reconstruct that exact localStorage entry so the browser client restores the session.
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
        localStorage: [
          { name: SUPABASE_AUTH_STORAGE_KEY, value: JSON.stringify(persisted) },
        ],
      },
    ],
  };

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2));

  // Sidecar: the admin userId (for backend-evidence queries) + tokens (for the RLS-scoped
  // evidence client) + onboarding seed target. Not committed; git-ignored .auth/ dir.
  writeFileSync(
    SESSION_INFO_PATH,
    JSON.stringify(
      {
        userId: data.user.id,
        email: data.user.email,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
      null,
      2,
    ),
  );

  // Do NOT signOut() the Node client — with a shared refresh_token, signOut() revokes the token
  // server-side, which would invalidate the session we just wrote into storageState. The Node
  // client used persistSession:false so there is no local session to clean up anyway.

  // eslint-disable-next-line no-console -- setup progress, not an app error path
  console.log(`[global-setup] admin session minted for ${email} (uid ${data.user.id.slice(0, 8)}…)`);
}

export default globalSetup;
