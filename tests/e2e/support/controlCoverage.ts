// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/support/controlCoverage.ts
// Description: Run-artifact helper for the interactive coverage program. Specs call `touch()`
//   when they actually exercise a control; the fixture writes one per-test artifact so the
//   checker can verify claimed controls were touched at the declared depth.
// Author: Codex
// Created: 2026-07-13

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { REPO_ROOT_DIR } from './env';

export const DEPTH_ORDER = ['rendered', 'clicked', 'value-changed', 'outcome-asserted'] as const;
export type ControlDepth = (typeof DEPTH_ORDER)[number];

export interface CoverageRecorder {
  touch: (id: string, depth: ControlDepth) => void;
  flush: () => void;
}

const depthIndex = new Map(DEPTH_ORDER.map((depth, index) => [depth, index]));
const touchesDir = resolve(REPO_ROOT_DIR, 'artifacts/control-touches');

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'unnamed';
}

export function createCoverageRecorder(testInfo: TestInfo): CoverageRecorder {
  const touched = new Map<string, ControlDepth>();
  const specPath = testInfo.file.startsWith(`${REPO_ROOT_DIR}/`)
    ? testInfo.file.slice(REPO_ROOT_DIR.length + 1)
    : testInfo.file;

  return {
    touch(id, depth) {
      const current = touched.get(id);
      if (!current) {
        touched.set(id, depth);
        return;
      }
      const nextIndex = depthIndex.get(depth) ?? -1;
      const currentIndex = depthIndex.get(current) ?? -1;
      if (nextIndex > currentIndex) {
        touched.set(id, depth);
      }
    },

    flush() {
      mkdirSync(touchesDir, { recursive: true });
      const artifactPath = resolve(
        touchesDir,
        `${sanitizeSegment(testInfo.file.replace(/^tests[\\/]/, ''))}--${sanitizeSegment(testInfo.title)}.json`,
      );
      const payload = {
        generated_at: new Date().toISOString(),
        spec: specPath,
        title: testInfo.title,
        touches: Array.from(touched.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, depth]) => ({ id, depth })),
      };
      writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    },
  };
}
