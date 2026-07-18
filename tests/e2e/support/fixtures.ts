// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/fixtures.ts
// Description: Shared Playwright fixtures for the regression e2e suite. Extends the base test
//   with both role sessions (admin + throwaway test-user), onboarding seeding for either role,
//   RLS-scoped evidence clients, and a network requestId capture helper for edge-function slices.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, expect, type BrowserContext, type Page, type Response } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  REPO_ROOT_DIR,
  ADMIN_SESSION_INFO_PATH,
  ADMIN_STORAGE_STATE_PATH,
  TEST_USER_SESSION_INFO_PATH,
  TEST_USER_STORAGE_STATE_PATH,
  makeTestUserCreds,
  type SessionInfo,
} from './env';
import { createCoverageRecorder, type CoverageRecorder } from './controlCoverage';

const ONBOARDING_KEY_PREFIX = 'onboarding:record:';
const ADMIN_SESSION_INFO_FALLBACK_PATH = resolve(REPO_ROOT_DIR, 'tests/e2e/.auth/admin-session.json');
const TEST_USER_SESSION_INFO_FALLBACK_PATH = resolve(REPO_ROOT_DIR, 'tests/e2e/.auth/test-user-session.json');
const ADMIN_STORAGE_STATE_FALLBACK_PATH = resolve(REPO_ROOT_DIR, 'tests/e2e/.auth/admin.json');
const TEST_USER_STORAGE_STATE_FALLBACK_PATH = resolve(REPO_ROOT_DIR, 'tests/e2e/.auth/test-user.json');

export type AdminSessionInfo = SessionInfo;
export type TestUserSessionInfo = SessionInfo;

function readSessionInfo(path: string): SessionInfo {
  return JSON.parse(readFileSync(path, 'utf8')) as SessionInfo;
}

export function readAdminSessionInfo(): AdminSessionInfo {
  return readSessionInfo(ADMIN_SESSION_INFO_PATH || ADMIN_SESSION_INFO_FALLBACK_PATH);
}

export function readTestUserSessionInfo(): TestUserSessionInfo {
  return readSessionInfo(TEST_USER_SESSION_INFO_PATH || TEST_USER_SESSION_INFO_FALLBACK_PATH);
}

/**
 * Init script (runs in the page BEFORE any app code): seed the onboarding-complete record into
 * IndexedDB so App.tsx renders the main shell instead of OnboardingFlow, and unregister the PWA
 * service worker so offline tests exercise the app's own online/offline handling (not the SW
 * cache). Written as a string-injected script; `userId` is interpolated at inject time.
 */
function makeInitScript(userId: string): string {
  return `
  (() => {
    // (a) Best-effort unregister the PWA service worker so it does not intercept network in
    //     offline tests. New/first load has none registered yet; this covers reused profiles.
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      }
    } catch (e) {}

    // (b) Seed the onboarding-complete record into IndexedDB (FalaMadeiraAudioCache/kv).
    const DB_NAME = 'FalaMadeiraAudioCache';
    // MUST stay equal to the app's DB_VERSION in src/platform/web/storage.web.ts. Opening an
    // existing higher-version DB at a LOWER version throws VersionError, which silently fails this
    // seed (swallowed below) and strands the app on onboarding — this drifted to v2 when the app
    // bumped v2->v3 (EN-8 audio_pinned store) and broke ~31 landOnHome-dependent content specs.
    const DB_VERSION = 3;
    const KV_STORE = 'kv';
    const BLOB_STORE = 'audio';
    const PINNED_STORE = 'audio_pinned';
    const key = ${JSON.stringify(ONBOARDING_KEY_PREFIX)} + ${JSON.stringify(userId)};
    const record = { complete: true, placementLevel: 1, completedAt: new Date().toISOString() };
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
        if (!db.objectStoreNames.contains(PINNED_STORE)) db.createObjectStore(PINNED_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(KV_STORE, 'readwrite');
          tx.objectStore(KV_STORE).put(record, key);
        } catch (e) { /* store may not exist on a brand-new db race; upgrade path handles it */ }
      };
    } catch (e) {}
  })();
  `;
}

type Fixtures = {
  /** Default page is the throwaway test user with onboarding pre-seeded. */
  page: Page;
  /** Explicit test-user page (same role as the default page). */
  userPage: Page;
  /** Explicit admin page (separate browser context, admin session restored). */
  adminPage: Page;
  /** RLS-scoped Supabase client authed as the throwaway test user. */
  evidence: SupabaseClient;
  /** Alias for test-user evidence, used by role-specific specs. */
  userEvidence: SupabaseClient;
  /** RLS-scoped Supabase client authed as the admin. */
  adminEvidence: SupabaseClient;
  /** The throwaway test-user session info (userId etc.). */
  testUser: TestUserSessionInfo;
  /** The admin session info (userId etc.). */
  admin: AdminSessionInfo;
  /** Interactive-control touch recorder for coverage verification. */
  coverage: CoverageRecorder;
  /**
   * Reset the shared throwaway user's mutable per-user state to a deterministic baseline:
   * zero the daily voice usage and clear the persisted learning-path/goal-track selection.
   * The suite runs serially on ONE shared user (playwright.config.ts), so durable DB state
   * (voice_usage_today, user_track_selection) leaks between specs — exhausting the voice
   * budget and pinning a goal track. State-sensitive specs call this BEFORE landOnHome so the
   * app boots from a clean baseline. Uses the test user's own RLS-scoped session (self-writes).
   */
  resetUserState: () => Promise<void>;
};

async function seedRoleContext(context: BrowserContext, userId: string): Promise<void> {
  await context.addInitScript(makeInitScript(userId));
}

function makeEvidenceClient(info: SessionInfo): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function makeStorageState(origin: string, info: SessionInfo) {
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          {
            name: SUPABASE_AUTH_STORAGE_KEY,
            value: JSON.stringify({
              access_token: info.access_token,
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              refresh_token: info.refresh_token,
              user: {
                id: info.userId,
                email: info.email,
              },
            }),
          },
        ],
      },
    ],
  };
}

export const test = base.extend<Fixtures>({
  coverage: async ({}, use, testInfo) => {
    const recorder = createCoverageRecorder(testInfo);
    await use(recorder);
    recorder.flush();
  },

  admin: async ({}, use) => {
    await use(readAdminSessionInfo());
  },

  testUser: async ({}, use) => {
    await use(readTestUserSessionInfo());
  },

  userPage: async ({ browser }, use) => {
    const testUser = readTestUserSessionInfo();
    const context = await browser.newContext({
      storageState: TEST_USER_STORAGE_STATE_PATH || TEST_USER_STORAGE_STATE_FALLBACK_PATH,
    });
    await seedRoleContext(context, testUser.userId);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  page: async ({ userPage }, use) => {
    await use(userPage);
  },

  adminPage: async ({ browser, admin }, use) => {
    const context = await browser.newContext({
      storageState: ADMIN_STORAGE_STATE_PATH || ADMIN_STORAGE_STATE_FALLBACK_PATH,
    });
    await seedRoleContext(context, admin.userId);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  userEvidence: async ({ testUser }, use) => {
    const client = makeEvidenceClient(testUser);
    const { error } = await client.auth.setSession({
      access_token: testUser.access_token,
      refresh_token: testUser.refresh_token,
    });
    if (error) {
      throw new Error(`evidence client setSession failed: ${error.message}`);
    }
    await use(client);
  },

  evidence: async ({ userEvidence }, use) => {
    await use(userEvidence);
  },

  resetUserState: async ({ testUser }, use) => {
    const reset = async () => {
      const client = makeEvidenceClient(testUser);
      const { error: authErr } = await client.auth.setSession({
        access_token: testUser.access_token,
        refresh_token: testUser.refresh_token,
      });
      if (authErr) throw new Error(`resetUserState setSession failed: ${authErr.message}`);
      // Zero the daily voice budget so audio-driven specs don't inherit an exhausted counter.
      const { error: voiceErr } = await client
        .from('profiles')
        .update({ voice_usage_today: 0, last_voice_usage_date: null })
        .eq('id', testUser.userId);
      if (voiceErr) throw new Error(`resetUserState voice reset failed: ${voiceErr.message}`);
      // Clear any persisted goal-track/path selection so path-sensitive specs start neutral.
      const { error: trackErr } = await client
        .from('user_track_selection')
        .delete()
        .eq('user_id', testUser.userId);
      if (trackErr) throw new Error(`resetUserState track clear failed: ${trackErr.message}`);
    };
    await use(reset);
  },

  adminEvidence: async ({ admin }, use) => {
    const client = makeEvidenceClient(admin);
    const { error } = await client.auth.setSession({
      access_token: admin.access_token,
      refresh_token: admin.refresh_token,
    });
    if (error) {
      throw new Error(`admin evidence client setSession failed: ${error.message}`);
    }
    await use(client);
  },
});

export { expect };

/**
 * Wait for the app shell to be ready and on Home. The desktop viewport renders the sidebar; the
 * greeting "Olá, …" proves a profile loaded (HomeView). Returns once Home is visible.
 */
export async function landOnHome(page: Page): Promise<void> {
  await page.goto('/');
  // Either the greeting or a Home-only element. The greeting is profile-driven.
  await expect(page.getByRole('heading', { name: /Olá,/i })).toBeVisible({ timeout: 30_000 });
}

/**
 * Provision a one-off disposable user and browser context. Use this for destructive flows
 * (for example account deletion) so the shared suite user remains intact for later specs.
 */
export async function createThrowawayUserContext(
  browser: { newContext: (options?: Parameters<BrowserContext['storageState']>[0] extends never ? never : any) => Promise<BrowserContext> },
  // Session localStorage is keyed by origin, so this MUST match the origin the page actually loads
  // (playwright's baseURL / BASE_URL). Hardcoding a port broke runs served on a non-default port.
  origin = process.env.BASE_URL || 'http://127.0.0.1:4173',
): Promise<{ context: BrowserContext; page: Page; session: SessionInfo }> {
  const creds = makeTestUserCreds();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
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
      `createThrowawayUserContext signUp failed for ${creds.email}: ${error?.message ?? 'no session returned'}.`,
    );
  }

  const session: SessionInfo = {
    userId: data.user.id,
    email: data.user.email ?? creds.email,
    password: creds.password,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
  const context = await browser.newContext({ storageState: makeStorageState(origin, session) });
  await seedRoleContext(context, session.userId);
  const page = await context.newPage();
  return { context, page, session };
}

/**
 * Capture the `requestId` echoed by the FIRST /functions/v1/<fn> response that matches, whether
 * a success body ({ ..., requestId }) or an error envelope ({ error: { requestId } }).
 * Returns a promise resolving to the requestId (or null if the body had none).
 */
export function captureEdgeRequestId(page: Page, fnName: string, timeoutMs = 30_000): Promise<string | null> {
  return new Promise<string | null>((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(null), timeoutMs);
    const handler = async (response: Response) => {
      if (!response.url().includes(`/functions/v1/${fnName}`)) return;
      try {
        const body = await response.json();
        const rid: string | null =
          (body && body.requestId) || (body && body.error && body.error.requestId) || null;
        if (rid) {
          clearTimeout(timer);
          page.off('response', handler);
          resolvePromise(rid);
        }
      } catch {
        /* non-JSON body — ignore, keep listening */
      }
    };
    page.on('response', handler);
  });
}
