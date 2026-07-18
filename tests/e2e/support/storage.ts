// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/storage.ts
// Description: Playwright helpers for reading the app's web storage adapter surfaces. The app
//   persists structured KV state in IndexedDB `FalaMadeiraAudioCache/kv` first and falls back to
//   `localStorage` with the `fm-kv:` prefix, so specs should not assume localStorage directly.
//   The IndexedDB opens below MUST use the same version as the app's DB_VERSION in
//   src/platform/web/storage.web.ts (currently 3). Opening an existing higher-version DB at a lower
//   version throws VersionError, so these reads/writes silently return null / no-op — which drifted
//   to v2 after the app went v2->v3 (EN-8) and made KV assertions (e.g. paths:selection) fail.
// Author: Codex
// Created: 2026-07-13

import type { Page } from '@playwright/test';

/**
 * Read the first KV value whose key starts with `prefix`. Needed since SEC-1 namespaced durable
 * keys by user id (e.g. `paths:selection:${userId}`): specs that don't know the exact id (fresh
 * signup flows) can still assert the value under the per-user key. Same storage tiers as readKv.
 */
export async function readKvByPrefix(page: Page, prefix: string): Promise<unknown | null> {
  return page.evaluate(async (p) => {
    const lsPrefix = `fm-kv:${p}`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(lsPrefix)) {
        try {
          return JSON.parse(localStorage.getItem(k) as string);
        } catch {
          return null;
        }
      }
    }
    return await new Promise<unknown | null>((resolve) => {
      try {
        const request = indexedDB.open('FalaMadeiraAudioCache', 3);
        request.onerror = () => resolve(null);
        request.onupgradeneeded = () => resolve(null);
        request.onsuccess = () => {
          try {
            const db = request.result;
            if (!db.objectStoreNames.contains('kv')) {
              resolve(null);
              return;
            }
            const tx = db.transaction('kv', 'readonly');
            const cursorReq = tx.objectStore('kv').openCursor();
            cursorReq.onerror = () => resolve(null);
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (!cursor) {
                resolve(null);
                return;
              }
              if (typeof cursor.key === 'string' && cursor.key.startsWith(p)) {
                resolve(cursor.value ?? null);
                return;
              }
              cursor.continue();
            };
          } catch {
            resolve(null);
          }
        };
      } catch {
        resolve(null);
      }
    });
  }, prefix);
}

/**
 * Write a value into the app's primary KV store (IndexedDB `FalaMadeiraAudioCache/kv`) — the tier
 * the app actually reads first (localStorage is only its fallback when IndexedDB is unavailable).
 * Needed by SEC-2 specs to seed pre-fix state (e.g. a legacy device-global `paths:selection`).
 */
export async function writeKv(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(
    async ({ k, v }) =>
      new Promise<void>((resolve) => {
        try {
          const req = indexedDB.open('FalaMadeiraAudioCache', 3);
          req.onerror = () => resolve();
          req.onsuccess = () => {
            try {
              const db = req.result;
              if (!db.objectStoreNames.contains('kv')) {
                resolve();
                return;
              }
              const tx = db.transaction('kv', 'readwrite');
              tx.objectStore('kv').put(v, k);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          };
        } catch {
          resolve();
        }
      }),
    { k: key, v: value },
  );
}

/** Delete a key from the app's primary KV store (IndexedDB). Companion to writeKv. */
export async function deleteKv(page: Page, key: string): Promise<void> {
  await page.evaluate(
    async (k) =>
      new Promise<void>((resolve) => {
        try {
          const req = indexedDB.open('FalaMadeiraAudioCache', 3);
          req.onerror = () => resolve();
          req.onsuccess = () => {
            try {
              const db = req.result;
              if (!db.objectStoreNames.contains('kv')) {
                resolve();
                return;
              }
              const tx = db.transaction('kv', 'readwrite');
              tx.objectStore('kv').delete(k);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          };
        } catch {
          resolve();
        }
      }),
    key,
  );
}

export async function readKv(page: Page, key: string): Promise<unknown | null> {
  return page.evaluate(async (requestedKey) => {
    const localFallbackKey = `fm-kv:${requestedKey}`;
    const localRaw = localStorage.getItem(localFallbackKey);
    if (localRaw !== null) {
      try {
        return JSON.parse(localRaw);
      } catch {
        return null;
      }
    }

    return await new Promise<unknown | null>((resolve) => {
      try {
        const request = indexedDB.open('FalaMadeiraAudioCache', 3);
        request.onerror = () => resolve(null);
        request.onupgradeneeded = () => resolve(null);
        request.onsuccess = () => {
          try {
            const db = request.result;
            if (!db.objectStoreNames.contains('kv')) {
              resolve(null);
              return;
            }
            const tx = db.transaction('kv', 'readonly');
            const store = tx.objectStore('kv');
            const getRequest = store.get(requestedKey);
            getRequest.onerror = () => resolve(null);
            getRequest.onsuccess = () => resolve(getRequest.result ?? null);
          } catch {
            resolve(null);
          }
        };
      } catch {
        resolve(null);
      }
    });
  }, key);
}
