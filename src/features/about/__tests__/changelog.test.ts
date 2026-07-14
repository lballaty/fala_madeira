// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/about/__tests__/changelog.test.ts
// Description: Unit coverage for the About release-notes parser (EN-4). Guards the CHANGELOG.md ->
//   per-version Release[] transform the About screen renders: version headers, bullet extraction,
//   continuation-line folding, preamble/rule skipping, and newest-first order.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import { describe, it, expect } from 'vitest';
import { parseChangelog, RELEASES } from '../changelog';

const FIXTURE = `# Changelog

Some preamble that must be ignored.

---

## 2026.07.14.2

- Second release, first note.
- A note that wraps across
  two source lines.

## 2026.07.14.1

- First release note.
`;

describe('parseChangelog', () => {
  it('extracts each version header as a release, newest first', () => {
    const releases = parseChangelog(FIXTURE);
    expect(releases.map((r) => r.version)).toEqual(['2026.07.14.2', '2026.07.14.1']);
  });

  it('ignores preamble before the first version header', () => {
    const releases = parseChangelog(FIXTURE);
    // "Some preamble..." is not attached to any release.
    expect(releases.every((r) => !r.notes.some((n) => n.includes('preamble')))).toBe(true);
  });

  it('extracts bullets and folds continuation lines into one note', () => {
    const [latest] = parseChangelog(FIXTURE);
    expect(latest.notes).toEqual([
      'Second release, first note.',
      'A note that wraps across two source lines.',
    ]);
  });

  it('does not treat horizontal rules as notes', () => {
    const releases = parseChangelog(FIXTURE);
    expect(releases.flatMap((r) => r.notes)).not.toContain('---');
  });

  it('exposes the real project CHANGELOG as a non-empty release history with valid CalVer', () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    for (const release of RELEASES) {
      expect(release.version).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d+$/);
      expect(release.notes.length).toBeGreaterThan(0);
    }
  });
});
