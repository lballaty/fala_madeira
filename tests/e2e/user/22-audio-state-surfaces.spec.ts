// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/22-audio-state-surfaces.spec.ts
// Description: Deterministic coverage for visible audio-state transitions only. Stubs TTS and
//   browser audio so the suite can assert real UI changes (button text / pulse class) without
//   depending on subjective sound or flaky media capabilities.
// Author: Codex
// Created: 2026-07-13

import { Buffer } from 'node:buffer';
import { test, expect, landOnHome } from '../support/fixtures';

const SILENT_PCM_BASE64 = Buffer.from(new Int16Array(2048).buffer).toString('base64');

async function installDeterministicAudio(page: Parameters<typeof landOnHome>[0]) {
  await page.addInitScript(() => {
    class MockAudio {
      src = '';
      playbackRate = 1;
      paused = true;
      onended: (() => void) | null = null;

      async play() {
        this.paused = false;
        window.setTimeout(() => {
          this.paused = true;
          this.onended?.();
        }, 120);
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
        return {
          getChannelData: () => new Float32Array(length),
        };
      }

      createBufferSource() {
        let timer: number | null = null;
        const source = {
          buffer: null as unknown,
          playbackRate: { value: 1 },
          onended: null as null | (() => void),
          connect: () => {},
          start: () => {
            timer = window.setTimeout(() => {
              timer = null;
              source.onended?.();
            }, 120);
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

    Object.defineProperty(window, 'Audio', {
      configurable: true,
      writable: true,
      value: MockAudio,
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: MockAudioContext,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      writable: true,
      value: MockAudioContext,
    });
  });

  await page.route('**/functions/v1/ai-gateway', async (route) => {
    let body: Record<string, unknown> | null = null;
    try {
      body = route.request().postDataJSON() as Record<string, unknown> | null;
    } catch {
      body = null;
    }

    if (body?.action === 'tts') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          audio: SILENT_PCM_BASE64,
          sampleRateHz: 24000,
          requestId: 'e2e-tts-audio-state',
        }),
      });
      return;
    }

    await route.continue();
  });
}

async function openPractice(page: Parameters<typeof landOnHome>[0]) {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Practice' }).first().click();
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
}

test.describe('audio state surfaces', () => {
  test('Repeat after me toggles Listen into Playing and back', async ({ page, coverage }) => {
    await installDeterministicAudio(page);
    await openPractice(page);

    await page.getByText('Speaking & Pronunciation', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Speaking & Pronunciation' })).toBeVisible();

    await page.getByRole('button', { name: 'Repeat after me' }).click();
    const listenButton = page.getByRole('button', { name: 'Listen' });
    await expect(listenButton).toBeVisible();

    await listenButton.click();
    await expect(page.getByRole('button', { name: 'Playing…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listen' })).toBeVisible({ timeout: 5_000 });
    coverage.touch('practice.audio.repeat_listen', 'outcome-asserted');
    coverage.touch('practice.audio.repeat_playing', 'outcome-asserted');
  });

  test('Pattern Builder pulses the Hear it icon only while playback is active', async ({ page, coverage }) => {
    await installDeterministicAudio(page);
    await openPractice(page);

    await page.getByText('Pattern Builder', { exact: true }).click();
    await expect(page.getByText(/Pick a situation to drill/i)).toBeVisible({ timeout: 20_000 });

    const firstSituation = page.locator('button').filter({ hasText: /^L\d/ }).first();
    await expect(firstSituation).toBeVisible();
    await firstSituation.click();

    const hearButton = page.getByRole('button', { name: 'Hear it' }).first();
    const hearIcon = hearButton.locator('svg');
    await expect(hearButton).toBeVisible({ timeout: 15_000 });
    await expect(hearIcon).not.toHaveClass(/animate-pulse/);

    await hearButton.click();
    await expect(hearIcon).toHaveClass(/animate-pulse/);
    await expect(hearIcon).not.toHaveClass(/animate-pulse/, { timeout: 5_000 });
    coverage.touch('practice.audio.pattern_hear_it', 'outcome-asserted');
  });
});
