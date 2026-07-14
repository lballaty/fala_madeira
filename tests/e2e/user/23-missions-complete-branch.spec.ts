// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/23-missions-complete-branch.spec.ts
// Description: Positive-branch Missions coverage. Creates a real mission, completes the
//   after-action flow with a successful grade, and asserts the completed-state UI.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

async function openPractice(page: Parameters<typeof landOnHome>[0]) {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Practice' }).first().click();
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible();
}

test.describe('missions complete branch', () => {
  test('I did it -> Went well -> Save review reaches the completed success state', async ({ page }) => {
    await openPractice(page);

    await page.getByText('Missions', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Real-world missions' })).toBeVisible();

    await page.getByRole('button', { name: /New mission/i }).click();
    await expect(page.getByRole('heading', { name: 'Pick a situation' })).toBeVisible();

    const missionReadySituation = page.locator('button').filter({ hasText: /mission ready/i }).first();
    const fallbackSituation = page.locator('button').filter({ hasText: /^L\d/ }).first();
    const chosenSituation = (await missionReadySituation.count()) > 0 ? missionReadySituation : fallbackSituation;
    await expect(chosenSituation).toBeVisible();
    await chosenSituation.click();

    const missionStatement = page.getByRole('textbox', { name: 'My mission statement' });
    if (await missionStatement.count()) {
      await missionStatement.fill(`I will complete this mission for e2e at ${Date.now()}.`);
    }

    await page.getByRole('button', { name: "I'm doing it" }).click();
    await expect(page.getByRole('heading', { name: 'Real-world missions' })).toBeVisible();

    const latestMissionCard = page.locator('div.bg-card').filter({ has: page.getByRole('button', { name: 'I did it' }) }).first();
    await expect(latestMissionCard).toBeVisible();

    const missionTitle = (await latestMissionCard.locator('span.font-bold.text-sm').first().textContent())?.trim();
    if (!missionTitle) {
      throw new Error('Could not read the newly created mission title before completing it.');
    }

    await latestMissionCard.getByRole('button', { name: 'I did it' }).click();
    await expect(page.getByText('After-action review')).toBeVisible();

    await page.getByRole('button', { name: 'Went well' }).click();
    await page.getByRole('textbox', { name: 'After-action note' }).fill('The positive branch reached a completed mission state.');
    await page.getByRole('button', { name: 'Save review' }).click();

    await expect(page.getByRole('heading', { name: 'Mission logged' })).toBeVisible();
    await expect(page.getByText(/Real-world use is the strongest signal there is/i)).toBeVisible();

    await page.getByRole('button', { name: 'Back to missions' }).click();
    await expect(page.getByRole('heading', { name: 'Real-world missions' })).toBeVisible();

    const completedCard = page
      .locator('section')
      .filter({ hasText: 'Completed' })
      .locator('div.bg-card')
      .first();
    await expect(completedCard).toContainText(missionTitle);
    await expect(completedCard).toContainText('Went well');
  });
});
