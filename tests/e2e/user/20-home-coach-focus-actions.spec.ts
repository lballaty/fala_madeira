// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/20-home-coach-focus-actions.spec.ts
// Description: Coach Focus action coverage. Seeds one due mastery row so the Focus card renders a
//   real actionable suggestion, then verifies the "why this?" panel and one-tap Practice route.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

interface SituationCandidate {
  id: string;
  vocabulary: Array<{ word: string }>;
}

interface ContentPackCandidate {
  situations: SituationCandidate[];
}

function isSituationCandidate(value: unknown): value is SituationCandidate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && Array.isArray(candidate.vocabulary);
}

function isContentPackCandidate(value: unknown): value is ContentPackCandidate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.situations) && candidate.situations.every(isSituationCandidate);
}

test.describe('home coach focus actions', () => {
  test('seeded due review produces a Focus suggestion with why-panel and Practice routing', async ({ page, userEvidence, testUser, coverage }) => {
    const { error: resetError } = await userEvidence
      .from('mastery_items')
      .delete()
      .eq('user_id', testUser.userId);
    expect(resetError?.message ?? null).toBeNull();

    const { data, error } = await userEvidence.from('content_packs').select('payload').limit(5);
    expect(error?.message ?? null).toBeNull();

    let seedTarget: { situationId: string; word: string } | null = null;
    for (const row of data ?? []) {
      const payload = (row as { payload?: unknown }).payload;
      if (!isContentPackCandidate(payload)) continue;
      const match = payload.situations.find((s) => Array.isArray(s.vocabulary) && s.vocabulary.length > 0 && typeof s.vocabulary[0]?.word === 'string');
      if (match) {
        seedTarget = { situationId: match.id, word: match.vocabulary[0].word };
        break;
      }
    }

    expect(seedTarget).not.toBeNull();
    const itemKey = `vocab:${seedTarget!.situationId}:${seedTarget!.word}`;
    const insert = await userEvidence.from('mastery_items').upsert({
      user_id: testUser.userId,
      item_key: itemKey,
      dimension: 'retrieve',
      ease: 1.3,
      interval_days: 1,
      repetitions: 1,
      next_review: new Date(Date.now() - 60_000).toISOString(),
      last_grade: 0,
    }, {
      onConflict: 'user_id,item_key,dimension',
    });
    expect(insert.error?.message ?? null).toBeNull();

    try {
      await landOnHome(page);

      const whyButton = page.getByRole('button', { name: 'Why this?' }).first();
      await expect(whyButton).toBeVisible({ timeout: 30_000 });
      await whyButton.click();
      coverage.touch('coach.focus.why_this', 'outcome-asserted');

      await expect(page.getByText('Weakness')).toBeVisible();
      await expect(page.getByText('Goal relevance')).toBeVisible();
      await expect(page.getByText('Review urgency')).toBeVisible();
      await expect(page.getByText('Recency / avoidance')).toBeVisible();

      const suggestionCard = whyButton.locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
      await suggestionCard.getByRole('button', { name: 'Practice', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible({ timeout: 20_000 });
      coverage.touch('coach.focus.practice', 'outcome-asserted');
    } finally {
      await userEvidence.from('mastery_items').delete().eq('user_id', testUser.userId);
    }
  });
});
