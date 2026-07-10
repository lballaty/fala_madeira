// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/fixtures.ts
// Description: Shared Playwright fixtures for the vertical-slice e2e suite. Extends the base
//   test with: (1) an onboarding IndexedDB seed injected via page.addInitScript BEFORE app
//   boot — the admin's onboarding-complete record lives in IndexedDB (FalaMadeiraAudioCache/kv,
//   key `onboarding:record:<uid>`) which storageState does NOT capture, so without the seed a
//   fresh context re-triggers OnboardingFlow; (2) a service-worker guard (the PWA registers a
//   SW that would serve cached content during context.setOffline tests) — unregistered on boot;
//   (3) an RLS-scoped Supabase evidence client (anon key + the admin session) used by tests to
//   read the rows the UI actions created (docs/TEST-VERTICAL-SLICES.md §4 domain-row evidence);
//   (4) a network requestId capture helper for edge-function slices (the /functions/v1/* body
//   echoes `requestId`). See global-setup.ts for how the session is minted.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, expect, type Page, type Response } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, REPO_ROOT_DIR } from './env';

const ONBOARDING_KEY_PREFIX = 'onboarding:record:';
const SESSION_INFO_PATH = resolve(REPO_ROOT_DIR, 'tests/e2e/.auth/admin-session.json');

export interface AdminSessionInfo {
  userId: string;
  email: string;
  access_token: string;
  refresh_token: string;
}

export function readAdminSessionInfo(): AdminSessionInfo {
  return JSON.parse(readFileSync(SESSION_INFO_PATH, 'utf8')) as AdminSessionInfo;
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
    const DB_VERSION = 2;
    const KV_STORE = 'kv';
    const BLOB_STORE = 'audio';
    const key = ${JSON.stringify(ONBOARDING_KEY_PREFIX)} + ${JSON.stringify(userId)};
    const record = { complete: true, placementLevel: 1, completedAt: new Date().toISOString() };
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
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
  /** The page with onboarding pre-seeded + SW unregistered (admin lands on Home). */
  page: Page;
  /** RLS-scoped Supabase client authed as the admin (reads only the admin's own rows). */
  evidence: SupabaseClient;
  /** The admin session info (userId etc.) for evidence queries. */
  admin: AdminSessionInfo;
};

export const test = base.extend<Fixtures>({
  admin: async ({}, use) => {
    await use(readAdminSessionInfo());
  },

  page: async ({ page }, use) => {
    const admin = readAdminSessionInfo();
    await page.addInitScript(makeInitScript(admin.userId));
    await use(page);
  },

  evidence: async ({ admin }, use) => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Authenticate the Node-side client with the admin session so RLS scopes reads to the
    // admin's own rows — the realistic "read the rows the user created" evidence path.
    const { error } = await client.auth.setSession({
      access_token: admin.access_token,
      refresh_token: admin.refresh_token,
    });
    if (error) {
      throw new Error(`evidence client setSession failed: ${error.message}`);
    }
    // IMPORTANT: do NOT signOut() here — the evidence client shares the admin's refresh_token
    // with the browser session (from global-setup). Calling signOut() revokes that token
    // server-side and evicts the browser's restored session, kicking the app back to AuthScreen.
    // The client is disposable per test; leaving the session intact keeps the shared session valid.
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
