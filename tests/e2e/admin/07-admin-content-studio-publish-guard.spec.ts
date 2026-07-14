// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/admin/07-admin-content-studio-publish-guard.spec.ts
// Description: Admin Content Studio guard coverage. Loads a real persisted situation into the
//   editor, confirms the safe baseline action-state for the existing valid draft, then makes the
//   draft invalid and asserts validation blocks publish while leaving Save draft available. This
//   stays read-only against live content: it never clicks Save draft or Publish.
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
}

interface ContentPackCandidate {
  id: string;
  situations: SituationCandidate[];
}

interface ContentPackRow {
  id: string;
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
  return typeof candidate.id === 'string' && Array.isArray(candidate.situations) && candidate.situations.every(isSituationCandidate);
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
        entry.title.trim().length > 0 &&
        entry.summary.trim().length > 0 &&
        entry.tracks.length > 0 &&
        entry.phrase_patterns.length > 0 &&
        entry.vocabulary.length > 0,
    );
    if (situation) return { pack, situation };
  }
  return null;
}

function draftField(container: Page | Locator, label: string): Locator {
  return container.locator('label').filter({ hasText: label }).locator('input, textarea, select').first();
}

test.describe('admin content studio publish guard', () => {
  test('validation blocks publish for an invalid draft while keeping the safe actions visible', async ({
    adminPage,
    adminEvidence,
  }) => {
    const { data, error } = await adminEvidence.from('content_packs').select('id, payload').order('id', { ascending: true });

    expect(error?.message ?? null).toBeNull();
    const target = pickExistingSituation((data ?? []) as ContentPackRow[]);
    expect(target ?? null).not.toBeNull();

    const { pack, situation } = target!;

    await landOnHome(adminPage);
    await adminPage.getByRole('button', { name: 'Admin' }).first().click();
    await expect(adminPage.getByRole('heading', { name: 'Admin' })).toBeVisible();

    await adminPage.getByRole('button', { name: /Content Studio/i }).click();
    await expect(adminPage.getByText(/Select a pack to author or edit its situations/i)).toBeVisible();

    await draftField(adminPage, 'Pack').selectOption(pack.id);
    await draftField(adminPage, 'Edit situation').selectOption(situation.id);

    const saveDraftButton = adminPage.getByRole('button', { name: 'Save draft' });
    const publishButton = adminPage.getByRole('button', { name: 'Publish' });

    await expect(draftField(adminPage, 'Title')).toHaveValue(situation.title);
    await expect(saveDraftButton).toBeEnabled();
    await expect(publishButton).toBeEnabled();

    await adminPage.getByRole('button', { name: 'Validate' }).click();
    await expect(publishButton).toBeEnabled();

    await draftField(adminPage, 'Title').fill('');
    await draftField(adminPage, 'Phrase patterns (JSON array)').fill('[{');
    await adminPage.getByRole('button', { name: 'Validate' }).click();

    await expect(adminPage.getByText(/error\(s\)/i)).toBeVisible();
    await expect(adminPage.getByText(/situation\.title/i)).toBeVisible();
    await expect(adminPage.getByText(/situation\.phrase_patterns/i).first()).toBeVisible();
    await expect(saveDraftButton).toBeEnabled();
    await expect(publishButton).toBeDisabled();
  });
});
