// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/08-practice-engine-surfaces.spec.ts
// Description: Deterministic practice-engine coverage beyond route-smoke tests. Exercises the
//   Listening engine's in-mode state transitions, the Missions engine's create/review loop, and
//   deeper Speaking drill selection without relying on live AI outputs.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

async function openPractice(page: Parameters<typeof landOnHome>[0]) {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Practice' }).first().click();
}

test.describe('practice engine surfaces', () => {
  test('Listening supports speed, transcript, dictation, and deterministic check flows', async ({ page }) => {
    await openPractice(page);

    await page.getByText('Listening', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Listening' })).toBeVisible();

    const normalSpeed = page.getByRole('button', { name: 'normal' });
    const naturalSpeed = page.getByRole('button', { name: 'natural' });
    await expect(normalSpeed).toHaveAttribute('aria-pressed', 'true');
    await naturalSpeed.click();
    await expect(naturalSpeed).toHaveAttribute('aria-pressed', 'true');
    await expect(normalSpeed).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Reveal transcript' }).click();
    await expect(page.getByRole('button', { name: 'Hide transcript' })).toBeVisible();
    await expect(page.getByText('Tap any word to hear it again.')).toBeVisible();

    await page.getByRole('textbox', { name: 'Type what you heard' }).fill('teste');
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByRole('button', { name: 'Next line' })).toBeVisible();
    await page.getByRole('button', { name: 'Next line' }).click();
    await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();

    const firstCheckChoices = page
      .locator('div.bg-card')
      .filter({ has: page.getByRole('heading', { name: 'What did you hear?' }) })
      .getByRole('button')
      .filter({ hasText: /.+/ });

    await firstCheckChoices.nth(1).click();
    await expect(page.getByText(/Good ear\.|Not quite/i)).toBeVisible();
  });

  test('Missions supports new mission creation and not-yet review without leaving the loop', async ({ page }) => {
    await openPractice(page);

    await page.getByText('Missions', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Real-world missions' })).toBeVisible();

    await page.getByRole('button', { name: /New mission/i }).click();
    await expect(page.getByRole('heading', { name: 'Pick a situation' })).toBeVisible();

    const firstSituation = page.locator('button').filter({ hasText: /L\d/ }).first();
    await expect(firstSituation).toBeVisible();
    await firstSituation.click();

    const missionStatement = page.getByRole('textbox', { name: 'My mission statement' });
    if (await missionStatement.count()) {
      await missionStatement.fill('I will ask for a coffee politely tomorrow.');
    }

    await page.getByRole('button', { name: "I'm doing it" }).click();
    await expect(page.getByRole('heading', { name: 'Real-world missions' })).toBeVisible();

    const latestMissionCard = page.locator('div.bg-card').filter({ has: page.getByRole('button', { name: 'I did it' }) }).first();
    await expect(latestMissionCard).toBeVisible();
    await latestMissionCard.getByRole('button', { name: 'I did it' }).click();

    await expect(page.getByText('After-action review')).toBeVisible();
    await page.getByRole('button', { name: 'Not yet' }).click();
    await page.getByRole('button', { name: 'Save review' }).click();

    await expect(page.getByRole('heading', { name: 'Attempt logged' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to missions' }).click();
    await expect(page.getByRole('heading', { name: 'Real-world missions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'I did it' }).first()).toBeVisible();
  });

  test('Speaking exposes repeat and shadowing drill bodies with reversible drill selection', async ({ page }) => {
    await openPractice(page);

    await page.getByText('Speaking & Pronunciation', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Speaking & Pronunciation' })).toBeVisible();

    await page.getByRole('button', { name: 'Repeat after me' }).click();
    await expect(page.getByRole('button', { name: 'All drills' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listen' })).toBeVisible();
    await page.getByRole('button', { name: 'All drills' }).click();

    await page.getByRole('button', { name: 'Shadowing' }).click();
    await expect(page.getByRole('button', { name: 'Start shadowing' })).toBeVisible();
    const loopToggle = page.getByRole('button', { name: 'Loop' });
    await expect(loopToggle).toHaveAttribute('aria-pressed', 'false');
    await loopToggle.click();
    await expect(loopToggle).toHaveAttribute('aria-pressed', 'true');
  });
});
