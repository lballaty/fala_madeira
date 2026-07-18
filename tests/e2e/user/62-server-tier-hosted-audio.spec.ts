// File: tests/e2e/user/62-server-tier-hosted-audio.spec.ts
// Description: EN-8 repeatable real-HTTP integration for the client server-audio tier — the durable,
//   CI-repeatable complement to the one-time live verify-win-staging. Fulfils the /audio/** route
//   with REAL PCM bytes over real HTTP and asserts the client serves a pre-hosted clip WITHOUT
//   calling the paid provider (the core EN-8 503/cost win). Covers three behaviours:
//     1. SERVE      — /audio 200 (octet-stream PCM) → provider tts route is NEVER hit.
//     2. HTML-GUARD — /audio 200 but content-type text/html (SPA-shell miss) → treated as a MISS,
//                     falls through to the provider (proves the content-type guard).
//     3. DEVICE-WARM (owed play→reload) — after a server-tier hit warms the device cache, a page
//                     RELOAD + replay of the same clip serves from the device tier: neither /audio
//                     nor the provider is hit the second time.
//   verpexBase defaults to '/audio' (config.ts) when VITE_AUDIO_VERPEX_BASE is unset, so the preview
//   build's server-tier probe is a same-origin request Playwright can route. Audio playback is stubbed
//   deterministically (per user/22) so the assertions are wire-level, not sound-dependent.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import { Buffer } from 'node:buffer';
import { test, expect, landOnHome } from '../support/fixtures';
import type { Page } from '@playwright/test';

// A real (silent) 24kHz mono s16le PCM body — non-empty so tryFetchPcm accepts it as audio.
const REAL_PCM = Buffer.from(new Int16Array(2048).buffer);
const SILENT_PCM_BASE64 = REAL_PCM.toString('base64');
const AI_GATEWAY = '**/functions/v1/ai-gateway';
const CHAT_REPLY = 'Bom dia! Como está hoje?';

declare global {
  interface Window {
    __audioPlays?: number;
  }
}

// Deterministic audio: stub Audio + AudioContext so PCM "plays" instantly and increments a counter,
// making playback observable without real sound (mirrors user/22).
async function installDeterministicAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__audioPlays = 0;
    class MockAudio {
      src = '';
      playbackRate = 1;
      paused = true;
      onended: (() => void) | null = null;
      async play() {
        this.paused = false;
        window.__audioPlays = (window.__audioPlays ?? 0) + 1;
        window.setTimeout(() => {
          this.paused = true;
          this.onended?.();
        }, 60);
      }
      pause() {
        this.paused = true;
      }
      removeAttribute() {}
      load() {}
    }
    class MockAudioContext {
      state: 'running' | 'suspended' = 'running';
      destination = {};
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
      }
      createBufferSource() {
        let timer: number | null = null;
        const source = {
          buffer: null as unknown,
          playbackRate: { value: 1 },
          onended: null as null | (() => void),
          connect: () => {},
          start: () => {
            window.__audioPlays = (window.__audioPlays ?? 0) + 1;
            timer = window.setTimeout(() => {
              timer = null;
              source.onended?.();
            }, 60);
          },
          stop: () => {
            if (timer !== null) {
              window.clearTimeout(timer);
              timer = null;
            }
            source.onended?.();
          },
        };
        return source;
      }
      async resume() {
        this.state = 'running';
      }
      async suspend() {
        this.state = 'suspended';
      }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, writable: true, value: MockAudio });
    Object.defineProperty(window, 'AudioContext', { configurable: true, writable: true, value: MockAudioContext });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, writable: true, value: MockAudioContext });
  });
}

// Drive a real tutor chat reply and click its per-message "Listen" (→ geminiService.playSpeech →
// synthesizeCached, which runs the device→pinned→verpex→supabase→provider tier lookup).
async function chatThenListen(page: Page): Promise<void> {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Tutor' }).first().click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao seu Tutor!' })).toBeVisible();
  await page.getByRole('button', { name: 'Just Want to Chat' }).click();
  const input = page.getByPlaceholder('Type in Portuguese...');
  await input.fill('Olá');
  const sendButton = page.locator('div.absolute.bottom-0 button').last();
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
  await expect(page.getByRole('heading', { name: /^AI / })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(CHAT_REPLY)).toBeVisible();
  // The NEWEST AI reply's own Listen is the last one (an earlier welcome message has its own Listen
  // whose text may already be cached from an on-load greeting — clicking that would never miss the
  // cache and so never probe the server tier). The reply's text is fresh → cache miss → tier lookup.
  const listen = page.getByRole('button', { name: 'Listen' }).last();
  await expect(listen).toBeVisible();
  await listen.click();
}

// Fulfil the chat action locally with a fixed reply (so the cache key is stable across reloads); a
// per-test callback decides how the tts action is handled.
async function routeAiGateway(
  page: Page,
  onTts: (route: import('@playwright/test').Route) => Promise<void>,
): Promise<void> {
  await page.route(AI_GATEWAY, async (route) => {
    let body: Record<string, unknown> | null = null;
    try {
      body = route.request().postDataJSON() as Record<string, unknown> | null;
    } catch {
      body = null;
    }
    if (body?.action === 'chat') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: CHAT_REPLY, requestId: 'e2e-chat-ok' }),
      });
      return;
    }
    if (body?.action === 'tts') {
      await onTts(route);
      return;
    }
    await route.continue();
  });
}

// STATUS (2026-07-17, owner-approved defer): authored scaffold, NOT yet green. In the preview build
// the tutor reply + Listen render and click correctly, but no /audio fetch or playback registers via
// the route/mock — the playSpeech → synthesizeCached → fetchServerTier path needs live network/console
// tracing to pin down (a non-obvious preview-build wiring issue, not a config/timeout problem —
// serverTierTimeoutMs=4000 is fine). The tier-order + HTML-shell-guard BEHAVIOUR is already covered by
// passing unit tests in src/services/__tests__/geminiService.test.ts ("synthesizeCached tier order
// (EN-8)"), so this real-HTTP e2e is additive integration proof, not the sole coverage. Marked
// test.fixme so it does not gate the suite; owed item tracked in docs/TESTER-FEEDBACK-TRACKER.md (EN-8).
test.describe('EN-8 server-audio tier (real HTTP): hosted clip serves without the provider', () => {
  test.fixme('a hosted /audio clip (200 PCM) is served and the provider tts is NEVER called', async ({ page }) => {
    await installDeterministicAudio(page);

    let audioHits = 0;
    let ttsInvoked = false;
    await page.route('**/audio/**', async (route) => {
      audioHits += 1;
      await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: REAL_PCM });
    });
    // Supabase buffer tier should never be reached (verpex 200s first) — 404 it defensively.
    await page.route('**/storage/v1/object/public/tts-audio/**', (route) => route.fulfill({ status: 404, body: '' }));
    await routeAiGateway(page, async (route) => {
      ttsInvoked = true; // MUST NOT happen — the server tier served the clip.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ audio: SILENT_PCM_BASE64, requestId: 'e2e-should-not-happen' }) });
    });

    await chatThenListen(page);

    // Server tier was probed + served, playback started, provider skipped, no error toast.
    await expect.poll(() => audioHits, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__audioPlays ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
    expect(ttsInvoked, 'provider tts must NOT be called when a hosted clip serves').toBe(false);
    await expect(page.getByText(/\(Ref: /)).toHaveCount(0);
  });

  test.fixme('a 200 text/html SPA-shell at /audio is treated as a MISS and falls through to the provider', async ({ page }) => {
    await installDeterministicAudio(page);

    let ttsInvoked = false;
    // Both server tiers return a non-PCM shell → must be rejected by the content-type guard.
    await page.route('**/audio/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>app</title>' }),
    );
    await page.route('**/storage/v1/object/public/tts-audio/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>app</title>' }),
    );
    await routeAiGateway(page, async (route) => {
      ttsInvoked = true; // EXPECTED here — the shells are not audio, so the provider must be used.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ audio: SILENT_PCM_BASE64, requestId: 'e2e-tts-fallthrough' }) });
    });

    await chatThenListen(page);

    await expect.poll(() => ttsInvoked, { timeout: 20_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__audioPlays ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/\(Ref: /)).toHaveCount(0);
  });

  test.fixme('play → reload → replay is served from the DEVICE tier (no second /audio fetch, no provider)', async ({ page }) => {
    await installDeterministicAudio(page);

    let audioHits = 0;
    let ttsInvoked = false;
    await page.route('**/audio/**', async (route) => {
      audioHits += 1;
      await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: REAL_PCM });
    });
    await page.route('**/storage/v1/object/public/tts-audio/**', (route) => route.fulfill({ status: 404, body: '' }));
    await routeAiGateway(page, async (route) => {
      ttsInvoked = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ audio: SILENT_PCM_BASE64, requestId: 'e2e-should-not-happen' }) });
    });

    // First play: server-tier hit warms the device cache.
    await chatThenListen(page);
    await expect.poll(() => audioHits, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__audioPlays ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);
    const hitsAfterFirst = audioHits;
    // Let the non-blocking device-cache warm settle before reloading.
    await page.waitForTimeout(1500);

    // Reload (IndexedDB device cache survives) and replay the SAME reply → identical cache key.
    await page.reload();
    await chatThenListen(page);
    await expect.poll(() => page.evaluate(() => window.__audioPlays ?? 0), { timeout: 20_000 }).toBeGreaterThan(0);

    // The second play must be served from the device cache: no new /audio fetch, provider never used.
    expect(audioHits, 'replay after reload must NOT re-fetch /audio (device cache hit)').toBe(hitsAfterFirst);
    expect(ttsInvoked, 'replay after reload must NOT call the provider').toBe(false);
    await expect(page.getByText(/\(Ref: /)).toHaveCount(0);
  });
});
