// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/legal/types.ts
// Description: Shared types for the legal slice. Legal documents (Terms, Privacy, AI-use)
//   are typed constants so they stay bundleable and versionable; LegalPage renders any
//   LegalDocument generically. Every document carries version/lastUpdated/status so the
//   UI can surface them and reviewers can track drafts.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

export type LegalDocId = 'terms' | 'privacy' | 'ai-use';

export interface LegalSection {
  heading: string;
  /** Paragraphs rendered before any bullets. */
  paragraphs?: string[];
  /** Bullet list rendered after the paragraphs. */
  bullets?: string[];
}

export interface LegalDocument {
  id: LegalDocId;
  title: string;
  /** Semver-ish document version, surfaced in the UI. */
  version: string;
  /** ISO date (YYYY-MM-DD), surfaced in the UI. */
  lastUpdated: string;
  /** 'draft' renders the "DRAFT — pending legal review" banner. */
  status: 'draft' | 'published';
  intro?: string[];
  sections: LegalSection[];
}
