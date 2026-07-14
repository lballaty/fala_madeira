// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/about/changelog.ts
// Description: Release-notes source for the in-app About surface (EN-4). The root CHANGELOG.md is
//   the single source of truth (CalVer YYYY.MM.DD.N entries); it is imported verbatim at build
//   time via ?raw and parsed into per-version release notes. Keeping CHANGELOG canonical means the
//   release-cut CHANGELOG entry (a hard release gate, MULTI-AGENT-WORKFLOW §7) is exactly what the
//   About screen renders — no second copy to drift.
// Author: Lane B (with assistant)
// Created: 2026-07-14

import changelogRaw from '../../../CHANGELOG.md?raw';

export interface Release {
  /** CalVer version string, e.g. "2026.07.14.1". */
  version: string;
  /** One string per changelog bullet (continuation lines folded into a single entry). */
  notes: string[];
}

/**
 * Parse a CHANGELOG.md body into per-version release notes, newest first (file order).
 * Recognises `## <version>` headers and `- ` bullets; indented continuation lines are folded
 * into the preceding bullet. Blank lines and horizontal rules (`---`) are ignored. The parser is
 * pure so it can be unit-tested against fixture text.
 */
export function parseChangelog(raw: string): Release[] {
  const releases: Release[] = [];
  let current: Release | null = null;

  for (const line of raw.split('\n')) {
    const header = line.match(/^##\s+(.+?)\s*$/);
    if (header) {
      current = { version: header[1].trim(), notes: [] };
      releases.push(current);
      continue;
    }
    if (!current) continue; // skip the file's title/preamble before the first version header

    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) {
      current.notes.push(bullet[1].trim());
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '' || trimmed === '---') continue;
    // Continuation line: fold into the last bullet of the current release.
    if (current.notes.length > 0) {
      current.notes[current.notes.length - 1] += ` ${trimmed}`;
    }
  }

  return releases;
}

/** Parsed release history for the About screen, newest first. */
export const RELEASES: Release[] = parseChangelog(changelogRaw);
