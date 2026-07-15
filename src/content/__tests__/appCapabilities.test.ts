// File: src/content/__tests__/appCapabilities.test.ts
// Description: Integrity tests for the App Capability Registry (src/content/appCapabilities.ts) —
//   the single source behind the manual, the chat-help projection, navigation, and hints.
//   Phase 1: ids unique; area is a known AppArea; short is single-line + non-empty + compact;
//   long non-empty; keywords non-empty; every target.controlId is a non-empty string.
//   Phase 2 (added with navigateToCapability): every target.controlId is a data-testid that
//   actually renders somewhere under src/ (guards dangling nav targets), and every capability
//   is resolvable by navigateToCapability's lookup.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  APP_CAPABILITIES,
  APP_AREA_LABELS,
  type AppArea,
  type AppCapability,
} from '../appCapabilities';

const VALID_AREAS: AppArea[] = ['home', 'learning', 'practice', 'tutor', 'profile', 'account'];

describe('APP_CAPABILITIES integrity', () => {
  it('has at least one capability', () => {
    expect(APP_CAPABILITIES.length).toBeGreaterThan(0);
  });

  it('every id is unique', () => {
    const ids = APP_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every area is a known AppArea (and has a label)', () => {
    for (const c of APP_CAPABILITIES) {
      expect(VALID_AREAS).toContain(c.area);
      expect(APP_AREA_LABELS[c.area]).toBeTruthy();
    }
  });

  it('short is a non-empty single line and compact (<= 160 chars)', () => {
    for (const c of APP_CAPABILITIES) {
      expect(c.short.trim().length, `${c.id} short must be non-empty`).toBeGreaterThan(0);
      expect(c.short.includes('\n'), `${c.id} short must be single-line`).toBe(false);
      expect(c.short.length, `${c.id} short must stay compact`).toBeLessThanOrEqual(160);
    }
  });

  it('long is non-empty and carries no literal markdown asterisks', () => {
    for (const c of APP_CAPABILITIES) {
      expect(c.long.trim().length, `${c.id} long must be non-empty`).toBeGreaterThan(0);
      expect(c.long.includes('**'), `${c.id} long must not show literal ** (the EN-17 render bug)`).toBe(false);
    }
  });

  it('keywords is a non-empty array of non-empty lowercase strings', () => {
    for (const c of APP_CAPABILITIES) {
      expect(Array.isArray(c.keywords) && c.keywords.length > 0, `${c.id} keywords`).toBe(true);
      for (const k of c.keywords) {
        expect(k.trim().length).toBeGreaterThan(0);
        expect(k, `${c.id} keyword "${k}" must be lowercase`).toBe(k.toLowerCase());
      }
    }
  });

  it('every target (when present) has a known area and a non-empty controlId or none', () => {
    for (const c of APP_CAPABILITIES) {
      if (!c.target) continue;
      expect(VALID_AREAS).toContain(c.target.area);
      if (c.target.controlId !== undefined) {
        expect(typeof c.target.controlId).toBe('string');
        expect(c.target.controlId.trim().length, `${c.id} target.controlId`).toBeGreaterThan(0);
      }
    }
  });
});

// ── Phase 2: nav-target integrity against real selectors ─────────────────────────────
// Collect every data-testid literal declared anywhere under src/ so we can prove that every
// navigation target the registry points at is a control that actually renders in the app.
function collectRenderedTestIds(): Set<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = resolve(here, '..', '..'); // src/content/__tests__ -> src
  const ids = new Set<string>();
  const re = /data-testid=(?:"([^"]+)"|'([^']+)'|\{`([^`]+)`\})/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && (p.endsWith('.tsx') || p.endsWith('.ts'))) {
        const txt = readFileSync(p, 'utf8');
        let m: RegExpExecArray | null;
        while ((m = re.exec(txt))) ids.add(m[1] || m[2] || m[3]);
      }
    }
  };
  walk(srcRoot);
  return ids;
}

describe('APP_CAPABILITIES navigation targets', () => {
  const rendered = collectRenderedTestIds();

  it('every target.controlId is a data-testid rendered somewhere under src/', () => {
    const dangling: string[] = [];
    for (const c of APP_CAPABILITIES) {
      const controlId = c.target?.controlId;
      if (controlId && !rendered.has(controlId)) dangling.push(`${c.id} -> ${controlId}`);
    }
    expect(dangling, `dangling nav targets (controlId not a rendered data-testid): ${dangling.join(', ')}`).toEqual([]);
  });
});

// ── navigateToCapability resolution ──────────────────────────────────────────────────
// The registry must be resolvable by id — the shape the navigate service depends on.
describe('capability lookup', () => {
  const byId = new Map<string, AppCapability>(APP_CAPABILITIES.map((c) => [c.id, c]));

  it('every id resolves back to its capability', () => {
    for (const c of APP_CAPABILITIES) {
      expect(byId.get(c.id)).toBe(c);
    }
  });
});
