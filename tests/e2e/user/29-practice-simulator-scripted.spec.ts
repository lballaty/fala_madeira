// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/29-practice-simulator-scripted.spec.ts
// Description: Scripted Situation Simulator coverage. Routes into a known authored situation,
//   completes both a guided L1 branch and an L3 hint-assisted branch, and asserts the persisted
//   `user_situation_progress` score payload for the simulator mode.
// Author: Codex
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

const SITUATION_ID = 'sit-d1-greetings-presence';
const SITUATION_TITLE = 'Greetings & Presence';

async function openSimulatorForGreetings(page: Parameters<typeof landOnHome>[0]) {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Practice' }).first().click();
  await page.getByRole('button', { name: 'Browse situations' }).click();
  await expect(page.getByText(/Any track, any level, any situation/i)).toBeVisible();

  const situationCard = page.locator('div').filter({ hasText: SITUATION_TITLE }).first();
  await situationCard.getByRole('button', { name: new RegExp(SITUATION_TITLE) }).click();
  await situationCard.getByRole('button', { name: 'Situation Simulator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Situation Simulator' })).toBeVisible();
  await expect(page.getByText(new RegExp(`${SITUATION_TITLE} · pick your difficulty`, 'i'))).toBeVisible();
}

test.describe('practice simulator scripted flow', () => {
  test('guided L1 scripted branch completes and persists simulator progress', async ({ page, userEvidence, testUser, coverage }) => {
    await openSimulatorForGreetings(page);
    coverage.touch('practice.situation.mode_simulator', 'outcome-asserted');

    const startedAt = new Date().toISOString();
    await page.getByRole('button', { name: 'Start the conversation' }).click();
    coverage.touch('practice.simulator.start_conversation', 'outcome-asserted');

    await expect(page.getByText('Bom dia! Tudo bem?')).toBeVisible();
    await expect(page.getByText('Good morning! Everything OK?')).toBeVisible();

    await page.getByRole('button', { name: 'Bom dia! Tudo bem, obrigado. E o senhor?' }).click();
    await expect(page.getByText('Tudo bem, obrigado. Em que posso ajudar?')).toBeVisible();
    await expect(page.getByRole('button', { name: /Obrigado\./ }).first()).toBeVisible();
    await page.getByRole('button', { name: /Obrigado\./ }).first().click();

    await expect(page.getByText('✓ Handled.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Again' })).toBeVisible();

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('user_situation_progress')
            .select('updated_at, status, score')
            .eq('user_id', testUser.userId)
            .eq('situation_id', SITUATION_ID)
            .eq('mode', 'simulator')
            .maybeSingle();

          if (!data || typeof data.updated_at !== 'string' || data.updated_at < startedAt) {
            return null;
          }

          const score = typeof data.score === 'object' && data.score !== null ? data.score : null;
          return score
            ? `${data.status}|${score.variant}|${score.difficulty}|${score.hints}|${score.turns}`
            : null;
        },
        { timeout: 12_000, message: 'user_situation_progress did not persist the L1 simulator completion' },
      )
      .toBe('completed|scripted|1|0|2');
  });

  test('L3 scripted flow reveals hints, accepts typed completion, and persists hint usage', async ({ page, userEvidence, testUser, coverage }) => {
    await openSimulatorForGreetings(page);
    coverage.touch('practice.situation.mode_simulator', 'outcome-asserted');

    const startedAt = new Date().toISOString();
    await page.getByRole('button', { name: 'L3' }).click();
    coverage.touch('practice.simulator.difficulty_l3', 'outcome-asserted');
    await page.getByRole('button', { name: 'Start the conversation' }).click();
    coverage.touch('practice.simulator.start_conversation', 'outcome-asserted');

    const replyInput = page.getByPlaceholder('Type your reply in Portuguese…');
    await expect(replyInput).toBeVisible();
    await expect(page.getByRole('button', { name: 'Need a hint?' })).toBeVisible();

    await replyInput.fill('resposta errada');
    coverage.touch('practice.simulator.reply_input', 'value-changed');
    await page.getByRole('button', { name: 'Send reply' }).click();
    coverage.touch('practice.simulator.send_reply', 'outcome-asserted');
    await expect(page.getByText(/didn't land in this scene/i)).toBeVisible();

    await replyInput.fill('ainda errado');
    coverage.touch('practice.simulator.reply_input', 'value-changed');
    await page.getByRole('button', { name: 'Send reply' }).click();
    coverage.touch('practice.simulator.send_reply', 'outcome-asserted');
    await expect(page.getByText(/Not quite — tap "Need a hint\?"/i)).toBeVisible();

    await page.getByRole('button', { name: 'Need a hint?' }).click();
    coverage.touch('practice.simulator.hint_toggle', 'outcome-asserted');
    await expect(page.getByRole('button', { name: 'Bom dia! Tudo bem, obrigado. E o senhor?' })).toBeVisible();
    await page.getByRole('button', { name: 'Bom dia! Tudo bem, obrigado. E o senhor?' }).click();

    await expect(page.getByText('Tudo bem, obrigado. Em que posso ajudar?')).toBeVisible();
    await replyInput.fill('Obrigado.');
    coverage.touch('practice.simulator.reply_input', 'value-changed');
    await page.getByRole('button', { name: 'Send reply' }).click();
    coverage.touch('practice.simulator.send_reply', 'outcome-asserted');

    await expect(page.getByText('✓ Handled.')).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(
        async () => {
          const { data } = await userEvidence
            .from('user_situation_progress')
            .select('updated_at, status, score')
            .eq('user_id', testUser.userId)
            .eq('situation_id', SITUATION_ID)
            .eq('mode', 'simulator')
            .maybeSingle();

          if (!data || typeof data.updated_at !== 'string' || data.updated_at < startedAt) {
            return null;
          }

          const score = typeof data.score === 'object' && data.score !== null ? data.score : null;
          return score
            ? `${data.status}|${score.variant}|${score.difficulty}|${score.hints}`
            : null;
        },
        { timeout: 12_000, message: 'user_situation_progress did not persist the L3 hint-assisted simulator completion' },
      )
      .toBe('completed|scripted|3|1');
  });
});
