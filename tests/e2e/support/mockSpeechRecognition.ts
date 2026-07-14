// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/mockSpeechRecognition.ts
// Description: Browser-level fake SpeechRecognition helper for deterministic e2e speech flows.
//   Injects before app startup so the existing web speech adapter resolves as available without
//   product-code changes. Shared by speaking, simulator, and tutor mic-path specs.
// Author: Codex
// Created: 2026-07-13

import type { Page } from '@playwright/test';

export async function installMockSpeechRecognition(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MockWindow = Window & { __mockSpeechTranscript?: string };

    class MockSpeechRecognition {
      lang = 'pt-PT';
      continuous = false;
      interimResults = true;
      onstart: (() => void) | null = null;
      onresult: ((event: { resultIndex: number; results: { length: number; 0: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null = null;
      onnomatch: (() => void) | null = null;
      onerror: ((event: { error?: unknown }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        const transcript = ((window as MockWindow).__mockSpeechTranscript ?? '').trim();
        queueMicrotask(() => {
          this.onstart?.();
          setTimeout(() => {
            if (!transcript) {
              this.onnomatch?.();
              this.onend?.();
              return;
            }
            this.onresult?.({
              resultIndex: 0,
              results: {
                length: 1,
                0: {
                  isFinal: true,
                  0: { transcript },
                },
              },
            });
            this.onend?.();
          }, 20);
        });
      }

      stop() {
        this.onend?.();
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      writable: true,
      value: MockSpeechRecognition,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: MockSpeechRecognition,
    });
  });
}

export async function setMockSpeechTranscript(page: Page, transcript: string): Promise<void> {
  await page.evaluate((nextTranscript) => {
    (window as Window & { __mockSpeechTranscript?: string }).__mockSpeechTranscript = nextTranscript;
  }, transcript);
}
