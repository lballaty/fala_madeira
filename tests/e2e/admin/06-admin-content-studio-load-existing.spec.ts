// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/06-admin-content-studio-load-existing.spec.ts
// Description: Admin Content Studio regression coverage for loading an existing situation. Picks a
//   real admin-readable pack from the database, loads one persisted situation into the editor, and
//   asserts that the real scalar and JSON draft fields hydrate without publishing or mutating data.
// Author: Codex
// Created: 2026-07-13

import type { Locator, Page } from '@playwright/test';
import { test, expect, landOnHome } from '../support/fixtures';

interface SituationCandidate {
  id: string;
  title: string;
  summary: string;
  level: number;
  cefr: string;
  tracks: string[];
  goals?: string[];
  phrase_patterns: unknown[];
  vocabulary: unknown[];
  cultural_notes?: unknown[];
}

interface ContentPackCandidate {
  id: string;
  name: string;
  version: string;
  status?: string | null;
  situations: SituationCandidate[];
}

interface ContentPackRow {
  id: string;
  name: string;
  version: string;
  status: string | null;
  payload: unknown;
}

function isSituationCandidate(value: unknown): value is SituationCandidate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.level === 'number' &&
    typeof candidate.cefr === 'string' &&
    Array.isArray(candidate.tracks) &&
    Array.isArray(candidate.phrase_patterns) &&
    Array.isArray(candidate.vocabulary)
  );
}

function isContentPackCandidate(value: unknown): value is ContentPackCandidate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.version === 'string' &&
    Array.isArray(candidate.situations) &&
    candidate.situations.every(isSituationCandidate)
  );
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? [], null, 2);
}

function draftField(container: Page | Locator, label: string): Locator {
  return container.locator('label').filter({ hasText: label }).locator('input, textarea, select').first();
}

function pickExistingSituation(rows: ContentPackRow[]): {
  pack: ContentPackCandidate;
  situation: SituationCandidate;
} | null {
  for (const row of rows) {
    if (!isContentPackCandidate(row.payload)) continue;
    const pack = row.payload;
    const situation = pack.situations.find(
      (entry) =>
        entry.summary.trim().length > 0 &&
        entry.tracks.length > 0 &&
        entry.phrase_patterns.length > 0 &&
        entry.vocabulary.length > 0,
    );
    if (situation) return { pack, situation };
  }
  return null;
}

test.describe('admin content studio load existing situation', () => {
  test('admin can load an existing situation and see the persisted draft fields', async ({
    adminPage,
    adminEvidence,
  }) => {
    const { data, error } = await adminEvidence
      .from('content_packs')
      .select('id, name, version, status, payload')
      .order('id', { ascending: true });

    expect(error?.message ?? null).toBeNull();
    const target = pickExistingSituation((data ?? []) as ContentPackRow[]);
    expect(target ?? null).not.toBeNull();

    const { pack, situation } = target!;
    const expectedPackLabel = `${pack.name} (${pack.id} · v${pack.version}${pack.status ? ` · ${pack.status}` : ''})`;
    const expectedTracks = situation.tracks.join(', ');
    const expectedGoals = (situation.goals ?? []).join('\n');
    const expectedPhrasePatterns = prettyJson(situation.phrase_patterns);
    const expectedVocabulary = prettyJson(situation.vocabulary);
    const expectedCulturalNotes = prettyJson(situation.cultural_notes ?? []);

    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

    await adminPage.getByRole('button', { name: /Content Studio/i }).click();
    await expect(adminPage.getByText(/Select a pack to author or edit its situations/i)).toBeVisible();

    const packSelect = draftField(adminPage, 'Pack');
    await expect(packSelect).toBeVisible();
    await packSelect.selectOption(pack.id);
    await expect(packSelect).toHaveValue(pack.id);

    const situationSelect = draftField(adminPage, 'Edit situation');
    await expect(situationSelect).toBeVisible();
    await situationSelect.selectOption(situation.id);

    await expect(draftField(adminPage, 'Situation id')).toHaveValue(situation.id);
    await expect(draftField(adminPage, 'Title')).toHaveValue(situation.title);
    await expect(draftField(adminPage, 'Summary')).toHaveValue(situation.summary);
    await expect(draftField(adminPage, 'Level')).toHaveValue(String(situation.level));
    await expect(draftField(adminPage, 'CEFR')).toHaveValue(situation.cefr);
    await expect(draftField(adminPage, 'Tracks (comma-separated ids)')).toHaveValue(expectedTracks);
    await expect(draftField(adminPage, 'Goals (one per line)')).toHaveValue(expectedGoals);
    await expect(draftField(adminPage, 'Phrase patterns (JSON array)')).toHaveValue(expectedPhrasePatterns);
    await expect(draftField(adminPage, 'Vocabulary (JSON array)')).toHaveValue(expectedVocabulary);
    await expect(draftField(adminPage, 'Cultural notes (JSON array, optional)')).toHaveValue(expectedCulturalNotes);

    await expect(adminPage.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'Publish' })).toBeVisible();
  });
});
