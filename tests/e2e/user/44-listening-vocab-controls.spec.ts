// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/44-listening-vocab-controls.spec.ts
// Description: Functional coverage for three interactive controls that lacked inventory coverage:
//   the Listening dictation text input ("Escreve aqui…"), the Listening "Playback speed" pill
//   group, and the Vocabulary Review "Play the word" audio button. Reaches each control from the
//   Practice hub and asserts its deterministic response (value reflected / aria-pressed toggled /
//   button enabled with no throw). Audio playback itself is fire-and-forget (no DOM "playing"
//   indicator), so the audio button is asserted at the interaction+no-error level rather than by a
//   playing state. Records control-coverage touches so the coverage checker can verify depth.
// Author: Coverage backlog (with assistant)
// Created: 2026-07-13

import { test, expect, landOnHome } from '../support/fixtures';

async function openPractice(page: Parameters<typeof landOnHome>[0]) {
  await landOnHome(page);
  await page.getByRole('button', { name: 'Practice' }).first().click();
}

test.describe('listening + vocabulary controls', () => {
  test('Listening dictation input reflects typed value ("Escreve aqui…")', async ({ page, coverage }) => {
    await openPractice(page);

    await page.getByText('Listening', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Listening' })).toBeVisible();

    // The dictation card renders whenever the engine has items; the textarea carries the
    // "Escreve aqui…" placeholder and an sr-only "Type what you heard" label. Reach it and prove
    // it is an editable value-bearing control (controlled input round-trips the typed value).
    const dictation = page.getByRole('textbox', { name: 'Type what you heard' });
    await expect(dictation).toBeVisible();
    await expect(dictation).toHaveAttribute('placeholder', 'Escreve aqui…');

    await dictation.fill('bom dia como está');
    await expect(dictation).toHaveValue('bom dia como está');
    coverage.touch('practice.listening.dictation_input', 'value-changed');
  });

  test('Listening playback speed pills toggle the selected speed', async ({ page, coverage }) => {
    await openPractice(page);

    await page.getByText('Listening', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Listening' })).toBeVisible();

    // "Playback speed" is a role=group of pills (slow / normal / natural); the selected pill
    // carries aria-pressed=true. Default is "normal". Changing selection is deterministic and
    // reflected immediately via aria-pressed, with no dependency on live audio.
    const speedGroup = page.getByRole('group', { name: 'Playback speed' });
    await expect(speedGroup).toBeVisible();

    const normal = speedGroup.getByRole('button', { name: 'normal' });
    const slow = speedGroup.getByRole('button', { name: 'slow' });
    await expect(normal).toHaveAttribute('aria-pressed', 'true');

    await slow.click();
    await expect(slow).toHaveAttribute('aria-pressed', 'true');
    await expect(normal).toHaveAttribute('aria-pressed', 'false');

    // Reversible: re-select normal and confirm the selection follows the interaction.
    await normal.click();
    await expect(normal).toHaveAttribute('aria-pressed', 'true');
    await expect(slow).toHaveAttribute('aria-pressed', 'false');
    coverage.touch('practice.listening.playback_speed', 'outcome-asserted');
  });

  test('Vocabulary "Play the word" audio button is interactive and error-free', async ({ page, coverage }) => {
    await openPractice(page);

    // Enter via a single situation so the quiz prompt card renders deterministically (the hub deck
    // is progress-scoped and may be empty for a fresh user). The prompt card (EN-18) shows the PT
    // word beside a "Play the word" speaker button before any answer is typed.
    await page.getByRole('button', { name: 'Browse situations' }).click();
    await expect(page.getByRole('heading', { name: 'Situations' })).toBeVisible();
    const firstSituation = page.locator('button[aria-expanded]').first();
    await expect(firstSituation).toBeVisible({ timeout: 20_000 });
    await firstSituation.click();
    await expect(page.getByText('Practice this with…')).toBeVisible();
    await page.getByRole('button', { name: 'Vocabulary Review' }).click();
    await expect(page.getByRole('heading', { name: 'Vocabulary Review' })).toBeVisible();

    const input = page.getByTestId('vocab-answer-input');
    const emptyOrSummary = page
      .getByRole('heading', { name: 'No vocabulary here' })
      .or(page.getByRole('heading', { name: 'Nothing to review yet' }))
      .or(page.getByRole('heading', { name: 'Session complete' }));
    // Branch only AFTER the surface settles (the deck loads async): wait for the prompt card OR an
    // empty/summary state, then decide on the settled DOM.
    await expect(input.or(emptyOrSummary.first())).toBeVisible({ timeout: 20_000 });
    if (!(await input.isVisible())) {
      await expect(emptyOrSummary.first()).toBeVisible();
      test.info().annotations.push({
        type: 'note',
        description: 'Vocabulary deck empty this run; "Play the word" not reachable — coverage touch skipped.',
      });
      return;
    }

    const playWord = page.getByRole('button', { name: 'Play the word' }).first();
    await expect(playWord).toBeVisible();
    await expect(playWord).toBeEnabled();

    // Audio playback is fire-and-forget (playText → TTS, no DOM "playing" indicator), so the
    // deterministic outcome we can assert is: the click resolves without a thrown error, the button
    // stays present/enabled, no audio-error banner appears, and — per the speaker's stopPropagation
    // guard — the prompt does NOT submit (the answer input is still visible, no feedback shown).
    await playWord.click();

    await expect(playWord).toBeEnabled();
    await expect(page.getByText(/Audio unavailable|Playback failed|Could not play/i)).toHaveCount(0);
    await expect(input).toBeVisible();
    await expect(page.getByTestId('vocab-feedback')).toHaveCount(0);
    coverage.touch('practice.vocabulary.play_word', 'outcome-asserted');
  });
});
