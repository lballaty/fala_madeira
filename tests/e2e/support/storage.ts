// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/storage.ts
// Description: Playwright helpers for reading the app's web storage adapter surfaces. The app
//   persists structured KV state in IndexedDB `FalaMadeiraAudioCache/kv` first and falls back to
//   `localStorage` with the `fm-kv:` prefix, so specs should not assume localStorage directly.
// Author: Codex
// Created: 2026-07-13

import type { Page } from '@playwright/test';

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
        const request = indexedDB.open('FalaMadeiraAudioCache', 2);
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
