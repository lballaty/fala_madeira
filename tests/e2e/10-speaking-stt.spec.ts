// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/tests/e2e/10-speaking-stt.spec.ts
// Description: S10 Speaking / Pronunciation slice. The scoring + voice-usage evidence depends on
//   real STT (mic) input, which is NOT automatable headlessly without a mocked speech adapter
//   (docs/TEST-VERTICAL-SLICES.md G6 + S10). Rather than weaken the assertion to a UI-only check
//   or fake a pass, we skip honestly with the G6 reference. The Speaking mode's non-STT surface
//   (tile present, mode opens) is already covered by 04-practice.spec.ts (all-8-tiles) and the
//   registry; the STT-dependent record-and-compare + pronunciation_attempts write is the
//   engine-speaking-pronunciation step's own evidence once a mock speech adapter lands.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { test } from './support/fixtures';

test.describe('speaking / pronunciation STT (S10)', () => {
  test.skip('record-and-compare + pronunciation_attempts write (needs mocked STT — G6)', async () => {
    // Intentionally skipped: real mic/STT input is not automatable headlessly (G6). Enable once a
    // deterministic mock speech adapter is injectable via src/platform/speech, then drive:
    //   repeat/shadow an item → mock recognition result → assert a NEW pronunciation_attempts row
    //   (append-only; UPDATE must fail) + a mastery_items row with dimension='say', and capture the
    //   scoring-call requestId from /functions/v1/gemini for the correlation_id join.
  });
});
