// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/user/61-about-contact-support.spec.ts
// Description: Coverage-backlog spec (2026-07-16 audit) for the About modal's "Contact Support"
//   entry, which had no e2e coverage: it must hand off from the About sheet to the Support &
//   Feedback modal (AboutModal onOpenSupport seam).
// Author: Coverage audit (with assistant)
// Created: 2026-07-16

import { test, expect, landOnHome } from '../support/fixtures';

test.describe('about modal contact-support handoff', () => {
  test('Contact Support inside About opens the Support & Feedback modal', async ({ page, coverage }) => {
    await landOnHome(page);
    await page.getByRole('button', { name: 'Profile' }).first().click();
    await page.getByRole('button', { name: 'About', exact: true }).click();

    const aboutDialog = page.getByRole('dialog', { name: /About FalaMadeira/ });
    await expect(aboutDialog).toBeVisible();

    await aboutDialog.getByRole('button', { name: 'Contact Support' }).click();

    // Outcome: the Support & Feedback modal is now the active surface.
    const supportDialog = page.getByRole('dialog', { name: 'Support & Feedback' });
    await expect(supportDialog).toBeVisible();
    coverage.touch('settings.about.contact_support', 'outcome-asserted');

    await supportDialog.getByLabel('Close').click();
    await expect(supportDialog).toBeHidden();
  });
});
