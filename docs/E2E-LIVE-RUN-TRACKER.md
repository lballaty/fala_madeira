# E2E Live-Run Findings Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/E2E-LIVE-RUN-TRACKER.md
**Description:** Live defect queue from executing the Playwright e2e suite (T-COV mandate, commit 662541b). The test-building agent authors specs but cannot bind ports in its sandbox; the runner session executes the suite (local `vite preview` + LIVE Supabase) and records every discrete failure here. Two buckets: EXECUTION FAILURES (tests that exist but fail) and COVERAGE GAPS (surfaces/flows not yet exercised). Owners — **app** (product code, runner/product session fixes, mirrored to REQUIREMENTS-TRACKER), **harness** (fixtures/setup/technique), **selector** (locator defects), **data** (seed/state assumptions), **environment** (runner env / concurrency noise). Harness/selector/data items belong to the test-building agent.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-13
**Last Updated:** 2026-07-13 (builder handoff batch: support/video/path journeys + tutor Ref-toast spec + inventory migration checkpoint)
**Last Updated By:** e2e builder session

## How to use this file

- **Test-building agent:** items with owner harness/selector/data are your worklist. When you change a spec, set the item to `fixed-pending-rerun` with a one-line note; the runner re-executes and flips to `verified` or reopens.
- **Runner session:** append a run section per execution; update item statuses; never edit specs (`tests/e2e/` is the test agent's scope).
- **Statuses:** `open` · `fixed-pending-rerun` · `verified` · `wont-fix` (with reason).
- Writes to this file are coordinated via the global queue (`queuectl reserve`).

## Run log

### Run 19 — 2026-07-14 — batches through ae7181c (user/46, user/47 @clean guard); a11y Home REGRESSION + 429 guard hit
- **101 passed · 4 failed of 105 (6.6m).** Suite grew 87→105 across the latest Lane A batches (user/46 assorted-input, user/47 @clean error-guard project, schema-drift gate).
- **The 4 failures:**
  1. **⚠ a11y Home REGRESSION** — `11-accessibility.spec.ts:36` fails again (was 4/4 green after 9aed0db). **State-dependent:** my PF-11 fix was verified against the EMPTY-state Home; run 19 hit the POPULATED state (coach wins/streak data from earlier specs), which renders green status pills (`bg-green-50`/`bg-green-500/10 text-green-700` ≈ #2b9658/#2c7f53 at 3.53–4.13:1) and a blue element (#2b7cd5 ≈ 3.8–4.17:1) still below 4.5. My fix did NOT cover these. **PF-11 REOPENED (partial):** darken the populated-Home green pills + that blue element; also seed a deterministic Home state so the a11y smoke isn't data-dependent. Owner: app/design.
  2. **user/44 (EF-34)** — unchanged (vocab deck-sourcing).
  3. **user/45 (EF-35)** — unchanged (all 187 situations mission-ready → self-made path unreachable).
  4. **user/47 (NEW @clean error-guard)** — caught `console.error: HTTP 429 (Too Many Requests)` during Home→Learning(+audio)→Practice→Tutor→Profile (+~3 other console errors). Likely environmental (full-suite TTS/edge rate-limit) and/or missing 429 backoff in the client. Triage: does it reproduce at low load (real UX gap) or only under suite hammering (test-env)? Owner: app (429 handling) + test-env.
- **Not regressions in the deployed product from this session** except the state-dependent a11y-Home gap (my a11y fix was incomplete for populated Home). EF-33/LT10 + deployed a11y (empty-state) hold.
- **Artifacts:** `artifacts/e2e-run19-2026-07-14.tgz`.

### Deploy — 2026-07-14 ~ CEST — EF-33/LT10 + a11y fixes shipped to production
- **`npm run deploy` PASSED the full ship gate** (tsc + vitest + build + e2e coverage contract) and rsynced dist to Verpex. Prod smoke `@smoke` = **6/6 green**; `manifest.webmanifest` HTTP 200. Live at https://falamadeira.searchingfool.com.
- **Ships:** EF-33/LT10 supabase-js post-reload deadlock fix (024683b), and the a11y fixes (9aed0db — PF-11 contrast + PF-12 control labels). Owner: hard-refresh once post-deploy (service worker).

### Run 18 — 2026-07-14 — regression check after a11y fixes + newest Lane A batch
- **102 passed · 2 failed of 104 (6.5m).** Suite grew 87 → 104: another Lane A batch (specs user/38–45) landed on disk during the deploy.
- **a11y fixes VERIFIED — all 4 axe smokes GREEN in the full suite; ZERO regressions from the color-token + aria-label changes** (every previously-passing functional test still passes; the files I edited — index.css/SettingsView/HomeView/PracticeHubView — did not break anything).
- **The only 2 failures are BRAND-NEW specs, not regressions and not from my a11y work** (they exercise VocabularyView / Missions / Simulator, which I did not touch):
  - **EF-34 · user/44 (`44-listening-vocab-controls.spec.ts:65`, "Play the word" audio button):** waits 15s for a vocab completion/empty heading (`All caught up` / `No vocabulary here yet` / `Session complete`) that never appears — deck-state assumption (same shared-SRS-state family as EF-30). This is the CG-18 audio-trigger coverage being added; good. Owner: new-spec/state (Lane A). Status: open.
  - **EF-35 · user/45 (`45-missions-simulator-controls.spec.ts:47`):** waits for a difficulty-level button matching `/^L\d/` (excluding "mission ready") that never renders — selector/state assumption on the missions/simulator backlog. Owner: new-spec/selector (Lane A). Status: open.
- **Artifacts:** `artifacts/e2e-run18-2026-07-14.tgz`.
- **EF-34/EF-35 deeper diagnosis (Lane B attempt 2026-07-14, NOT resolved):**
  - **EF-35 (user/45) — spec premise impossible with current content.** All **187 seed situations have an authored `mission`** (187 "mission" keys / 187 ids), so every one renders the "mission ready" badge and the `hasNot: mission ready` filter excludes ALL of them — the SELF-MADE mission-statement form only renders for a non-mission-ready situation, so it is unreachable. Removing the wrong `^` anchor (/^L\d/ → /L\d/) was necessary but not sufficient. Real fix (Lane A/content): either add a non-mission-ready situation to the seed, or drive the self-made path via its actual entry point (if one exists independent of the picker), or drop the assertion. Lane B applied the anchor fix + a deck reset as partial improvements; specs still fail.
  - **EF-34 (user/44) — vocab deck not deterministically populated.** Resetting the user's retrieve-dimension `mastery_items` up front did NOT yield a standard flashcard in-suite; the "Vocabulary Review" surface reaches neither a `Flashcard — tap to flip` control nor a settled empty-state heading within timeout. Needs a read of the deck-sourcing in `VocabularyView`/its hook (is the review deck due-only? does it use the audio-first variant name?) to make "Play the word" deterministically reachable. Owner: Lane A (+ Lane B verify).
  - **Both remain OPEN.** They are NEW-spec/content problems, not product regressions and not caused by the a11y deploy.

### Run 17 — 2026-07-13 ~18:45 CEST — new batch ef1c90f (functional tests for 11 previously-silent controls)
- **83 passed · 4 failed of 87 (5.4m, exit 1).** Suite grew 80 → 87: batch adds admin/09 (reject-correction), user/39 (alt tutor + theme Light/System ×2 tests), user/40 (SRS grade-variants Again/Hard/Easy + Almost/Missed), user/41 (Learning review-mode toggle + Phrase-Library filter). Inventory 142 → 153.
- **All 7 new batch tests PASS on the runner** (tutor→Maria persists `selected_tutor_id`; theme applies `<html data-theme>` + `fm_theme`; grade variants advance the deck; review-mode label flip + phrase filter narrows; reject-correction polls `lesson_corrections.status == 'rejected'`). Every pre-existing functional test still passes.
- **The 4 failures are UNCHANGED from run 16 — the same axe `@a11y` smokes** (auth / home / profile-settings / practice-hub), i.e. the real product WCAG-AA violations tracked as PF-11 (color-contrast) + PF-12 (unnamed settings selects / unlabeled input). No new failures, no regressions from the batch.
- **Net functional state: 83/83 green; the only red is the a11y smoke, which stays red until the design/app a11y fixes land** (owner decision still open per run 16: split `@a11y` into its own CI lane so the functional suite reports green independently).
- **Artifacts:** `artifacts/e2e-run17-2026-07-13.tgz`.

### Run 16 — 2026-07-13 ~18:20 CEST — new batch a7089e2 (axe a11y smoke + mobile-viewport project, CG-17)
- **76 passed · 4 failed of 80 (4.4m, exit 1).** Suite grew 75 → 80: the new `tests/e2e/11-accessibility.spec.ts` adds 4 `@a11y` axe smokes (auth / home / practice-hub / profile-settings) and the mobile-viewport project adds 1. **All 75 pre-existing functional tests still pass — no functional regressions.**
- **The 4 failures are the new axe spec correctly catching REAL product a11y violations (product/design owner, NOT test defects):**
  - **`color-contrast` (serious, 22 nodes across all 4 screens):** the iOS-blue `#007aff` at bold small sizes computes to **4.01:1** (white-on-blue CTAs and blue-on-white text) — below WCAG 2.2 AA 4.5:1. Also low-contrast green status pills (`#299556`/`#529573` on pale-green ≈ 2.98–3.58:1). → **PF-11**, maps to existing REQUIREMENTS U4/U5.
  - **`select-name` (critical, 3 nodes, Profile/Settings):** `<select>` elements with no accessible name (the settings selects — provider/voice/level pickers). → **PF-12**.
  - **`label` (critical, 1 node, Profile/Settings):** a form `<input>` with no associated label. → **PF-12**.
- **These are pre-existing product defects surfaced by new coverage, not new regressions.** The axe spec is doing its job; it will stay red until the design-system contrast + the two settings-control labels are fixed. Decision for owner/Lane A: keep `@a11y` in the default run (suite stays red until fixed) or gate it behind a separate `@a11y` project/CI job so the functional suite reports green independently (recommended — a11y remediation is a design task on its own track).
- **Artifacts:** `artifacts/e2e-run16-2026-07-13.tgz` (per-screen axe violation JSON + screenshots).

### Run 15 — 2026-07-13 ~17:35 CEST — FULL GREEN (Lane B; user/24 + user/32 spec fixes, commit add5911)
- **75 passed · 0 failed of 75 (4.1m, exit 0). First fully-green full-suite run.** Both remaining failures fixed (owner-directed Lane B takeover of the two spec items). Both fixed specs verified 3/3 deterministic standalone before the suite run.
- **user/24 (EF-25) CLOSED:** asserted the recap's unique segment-summary copy instead of the ambiguous, twice-rendered "Nicely done" label.
- **user/32 (EF-32) CLOSED:** root cause was the LegalPage modal (fixed inset-0 z-[70]) still running its framer-motion EXIT animation when the next checkbox force-click fired — the click landed on the exiting overlay, so the checkbox never toggled. `openLegalDocFromConsent` now waits for the legal dialog to detach (count 0) after Close; `toggleConsentRow` hardened to a state-guarded click + explicit `toBeChecked`. NOT a product bug (the control toggles fine — proven by passing user/12).
- **Artifacts:** `artifacts/e2e-run15-2026-07-13.tgz`. tsc --noEmit clean.

### Run 14 — 2026-07-13 ~16:58 CEST — full-suite regression check (Lane B; post-EF-33 fix + Lane A batch 0986b96)
- **73 passed · 2 failed of 75 (4.0m, exit 1).** REGRESSION CHECK RESULT: **no regressions from the EF-33/LT10 fix (024683b).** All three EF-33 targets pass in-suite (user/30, user/34, user/35). Lane A's spec batch 0986b96 (24/32/04 fixes) is now live in the tree.
- **Both remaining failures are NEW DEEPER LAYERS, not regressions** — Lane A's fixes worked and pushed each spec further into its flow, exposing a next-step assertion problem. Both are spec-side (Lane A):
  - **user/24 → EF-25 layer 3:** the `exact:true` heading fix worked; the spec now runs the whole daily session and REACHES the recap (`Session done` heading asserts fine). New blocker at line 50: `getByText(/Nicely done/i)` resolves to **2 elements** — the recap renders a per-segment "Nicely done" label twice. Fix: scope to `.first()` or to a specific segment card. (Not a product bug — two per-segment labels are legitimate.)
  - **user/32 → EF-32 layer 2:** the consent-copy regex fix worked; the row + checkbox now resolve. New blocker at line 61: `checkbox.check({ force: true })` reports "Clicking the checkbox did not change its state." **Proven spec-side, not a product bug:** passing spec user/12 force-checks the SAME inputs (`input[type="checkbox"].nth(0/1)`) and succeeds — so the control toggles fine for real users. user/32 differs by (a) scoping via `label`→`getByRole('checkbox')` and (b) opening/closing three legal-doc modals immediately before the first check. Fix (Lane A): click the label/row (drives the real `onChange`) instead of force-`.check()` on the controlled React input, or poll the CTA's enabled state rather than asserting the input's `checked` — controlled-checkbox + force-check is the pitfall-#3 family.
- **Artifacts:** `artifacts/e2e-run14-2026-07-13.tgz` (suite log + traces/screenshots for the 2 failures).

### Run 13 — 2026-07-13 ~16:50 CEST — LT10/EF-31/EF-33 fix verification (Lane B product fix, commit 024683b)
- **72 passed · 3 failed of 75 (4.4m).** user/30, user/34, user/35 ALL pass in-suite; the three remaining failures are exactly the known Lane A selector items (user/04 EF-16, user/24 EF-25 `exact:true`, user/32 EF-32 consent copy). No regressions from the fix.
- **Root cause of the whole LT10 family, empirically nailed (lock-spy + fetch-spy probe):** gotrue's `_initialize()` runs inside the auth navigator-lock and AWAITS every `onAuthStateChange` subscriber; our callback (`useAuth.ts`) awaited `fetchProfile()` (REST) → `_getAccessToken` → `getSession()` → `initializePromise` → the very callback being awaited. **Self-deadlock** — lock held forever, ALL REST traffic hangs pre-network. Only raced when the app subscribed before `_initialize` finished: warm-cache reloads (EF-33) and offline reloads (EF-31).
- **Fix (024683b):** onAuthStateChange callback made synchronous, profile/lessons follow-up deferred to a macrotask (supabase-js's own documented guidance); sync-queue auth-readiness awaits timeout-guarded (5s) + one guarded `refreshSession()` + 3s/10s/30s reconnect ladder.
- **Acceptance:** user/30+34+35 standalone ×3 → 3/3 green each; in-suite green. Probe shows the init lock releasing in <1ms post-reload (was: held forever). Artifacts: `artifacts/e2e-run13-2026-07-13.tgz` (suite + acceptance logs + before/after probe logs).
- **NOT yet deployed to production** — dist carrying the fix is built and smoke-ready; deploy is an owner call (`npm run deploy`).

### Run 12 — 2026-07-13 ~15:30 CEST — full suite (Lane B; validates the 16:05 builder batch)
- **69 passed · 6 failed of 75 (5.7m, exit 1).** Suite grew 71 → 75 (user/34, 35, 36, 37 new). Failures: user/04, 24, 30, 32, 34, 35. Artifacts: `artifacts/e2e-run12-2026-07-13.tgz` (includes the standalone 34+35 rerun log).
- **Fixed-verified this run (close):** user/21 (EF-23 quiz overlay scoping ✅), user/25 (EF-24 ✅), user/17 (EF-27 ✅), user/29 (EF-28 ✅), user/30 first-card revision (EF-30 ✅ — its residual failure is purely EF-31 now). The owner-requested targets all validated: **user/08 ✅, user/36 ✅, user/37 ✅** (error-surface Ref contract now covered — closes that Gap-Analysis logical item), updated **admin/02–08 ✅**, **user/09 ✅, user/11 ✅**.
- **PF-5 verified live:** session-view heading now renders "Daily session" — the duplicate-heading a11y collision is gone. user/24's remaining failure is a NEW spec-side strict violation (see EF-25 update).
- **NEW EF-32** (user/32): consent-row locator text doesn't match the real copy. **NEW EF-33** (user/34 + 35): My Submissions refresh permanently disabled after the mid-test reload — wire-proven supabase-js wedge, LT10 family, now on an ONLINE reload. Reproduced ×2 (in-suite + standalone rerun).
- **Data hygiene:** admin Review Queues showed **131 item(s) awaiting action** during the 34-failure snapshot — e2e residue (11+ `e2e-lesson-*` corrections, dozens of open tickets/suggestions) has re-accumulated since the 62-row sweep. Failed specs leak their rows when they die before `finally` cleanup fires on the ADMIN side; a periodic sweep or a global `e2e-*` cleanup in teardown is warranted (extends EF-14's observation).

### Builder batch — 2026-07-13 ~16:05 CEST — coverage expansion + handoff checkpoint (validated by run 12 above)
- **No live execution in this lane.** This batch is builder-only and needs runner validation before any domain is marked closed.
- **New journey specs added:**
  - `tests/e2e/user/34-support-ticket-roundtrip.spec.ts` — user files ticket → admin closes exact row → user refreshes My Submissions and sees `closed`.
  - `tests/e2e/user/35-video-suggestion-roundtrip.spec.ts` — user suggests video from Lesson Details → admin approves exact row → user refreshes My Submissions and sees `approved`.
  - `tests/e2e/user/36-path-switch-home-cta.spec.ts` — switch path in Settings and prove Home CTA changes for adaptive / goal-track / structured.
  - `tests/e2e/user/37-tutor-error-ref-toast.spec.ts` — forced tutor edge failure via route interception; asserts calm toast with short `Ref` while the Tutor surface remains mounted.
- **Existing specs hardened with explicit touch evidence / outcome assertions:** `user/01`, `user/08`, `user/10`, `user/14`, `user/17`, `admin/05`.
- **Coverage-system progress:**
  - inventory now **142 controls** (was 141 at the prior builder checkpoint);
  - `npm run test:e2e:coverage` passes;
  - warnings reduced to **46 legacy `covered_by` strings** and **1 rendered-only control** (`tutor.model.listen`);
  - the earlier "structured claim could not be verified by selector-text grep" warning is now **gone**.
- **Local verification in builder lane:** `npx tsc --noEmit` ✅, `npm run test:e2e:coverage` ✅. No Playwright/browser execution from this sandboxed lane.
- **Runner-targeted next batch:** execute `user/34`, `user/35`, `user/36`, `user/37`, plus the updated `user/08`, `user/10`, `user/14`, `user/17`, and `admin/05` to validate the new touch claims and journey closures.

### Run 11 — 2026-07-13 ~15:10 CEST — stability confirmation
- **66 passed · 5 failed (4.7m) — identical to run 10** (user/04, 21, 24, 30, 32). No new Lane A batch; determinism re-confirmed. Open items: 3 Lane A spec fixes (04/21 quiz-loop family, 32 new-spec iteration), PF-5 product tweak (blocks 24), LT10/EF-31 product follow-up (blocks 30).

### Runs 9–10 — 2026-07-13 ~14:05–14:45 CEST — builder batch + sync-queue hardening validation
- Run 9: 69 tests, **65 passed · 4 failed**. Verified: EF-16's earlier layers, user/22 audio revisions, NEW user/31 onboarding-path-variants passes (CG-7 closes further).
- Run 10 (validation of sync-queue hardening 78ddfd0): 71 tests, **66 passed · 5 failed** — no regressions; 5th failure is the brand-new user/32 consent-guard spec (first run, Lane A iterating).
- **Deep-dive (Lane B, ~2h of instrumented probes): user/30's residual failure is EF-31 — a REAL narrow product defect** in the reconnect replay on offline-reloaded pages. Chain proven: enqueue ✓ (durable, exact payload) → offline reload keeps session UI ✓ → online event fires ✓ → flush runs and re-reads the queue ✓ → **replay stalls**: gotrue (supabase auth) races its own session restoration on offline-reloaded pages — wire-captured `POST /rest/v1/mastery_items → 401` (unauthenticated replay) in some timings; in others the replay hangs on gotrue's internal lock and never reaches the network (trace-verified zero POSTs). Sync-queue hardening (78ddfd0: auth-await, cache-poisoning fix, bounded +3s retry) shipped — necessary but not sufficient.
- user/04, 21, 24 signatures unchanged from run 8 diagnoses (Lane A). EF-25 still blocked on PF-5.

### Run 8 — 2026-07-13 ~13:30 CEST — builder batch targeting the final six
- 67 tests / 55 files · **63 passed · 4 failed (4.2m)** · artifacts: `artifacts/e2e-run8-2026-07-13/`. Trend: 25→48→55→56→58→61→61→63.
- **Verified this run:** EF-22 (user/20 coach Focus routing — deterministic suggestion setup works) and EF-24 (user/25 quiz progression write — `completed_lessons` write proven end-to-end via UI for the first time 🎉).
- **Remaining 4, new signatures:**
  - EF-16 (user/04): spec progressed INTO the quiz section; now re-clicks an already-answered (red) animating choice — same answered-state family as EF-23's earlier round. Click Next after answering instead.
  - EF-23 (user/21): 'did not advance' assert is a FALSE negative — ALL typed questions share the identical heading "Listen and type what you hear:", so question-text comparison can't detect advancement between two consecutive typed questions. Compare the progress dots / question index (or the answer value), not the heading text.
  - EF-25 (user/24): unchanged — hard-blocked on **PF-5** (two identical 'Today's Session' headings in the nearest section; product change owned by Lane B/product).
  - EF-30 (user/30): the read-the-front-word approach landed but `p.text-2xl` isn't inside the flashcard button for AUDIO-FIRST card variants (the 'hear' dimension card deliberately shows no word on the front — VocabularyView renders the word only on flip/other variants at :107/:116/:128). Handle variants: flip first and read the back, or skip audio-first cards when picking the item to grade.

### Run 7 — 2026-07-13 ~12:45 CEST — stability confirmation
- **61 passed · 6 failed (4.8m) — IDENTICAL failure set to run 6** (user/04, 20, 21, 24, 25, 30). The 12:29 fixture/spec edits were already in run 6's build; no new Lane A fixes had landed.
- Reproducibility upgraded: all six remaining items confirmed deterministic across two identical back-to-back runs — zero flake in the suite. Diagnoses in the run-6 entry stand unchanged.

### Run 6 — 2026-07-13 ~13:05 CEST — full suite (Lane B; post-deploy stability + builder batch)
- 67 tests / 55 files · **61 passed · 6 failed (5.0m)** · artifacts: `artifacts/e2e-run6-2026-07-13/`. Best score yet (25→48→55→56→58→61).
- **Verified this run:** EF-15 fully (admin/06 select-value assert passes; admin/07 already green), EF-27 (user/17), EF-28 (user/29 simulator scripted).
- **Remaining 6, all known items, several with new signatures (builder mid-iteration):**
  - EF-16 (user/04): spec now reaches the phrase grid; NEW blocker — clicking the "Play pronunciation" button times out on Playwright's STABILITY wait (the element keeps animating). If the audio icon has an idle/persistent pulse animation, buttons never go "stable" — click with `{ force: true }`, or product limits the pulse to the actually-playing state.
  - EF-22 (user/20): the Focus-card CTA click now works; 'Vocabulary Review' STILL doesn't appear — because the TOP suggestion isn't necessarily the seeded vocab item: shared-user SRS rows from earlier specs can outrank it (same contamination family as EF-30). Reclassified **data**: assert the suggestion's engine label before clicking, or make setup state deterministic.
  - EF-23 (user/21): choice-answer loop added; NEW — after answering, the loop re-clicks the already-answered (green) choice which is animating/disabled instead of advancing; click Next once the answer registers.
  - EF-24 (user/25): 'Next Question' stays disabled — the answer wasn't accepted (same answer-loop sequencing family as EF-23).
  - EF-25 (user/24): `ancestor::section[1]` STILL resolves 2 identical 'Today's Session' headings — the NEAREST section genuinely contains both. **Escalated to a small product change (PF-5): differentiate the two headings** (Home card summary vs session view title) — an a11y smell as well as untestable.
  - EF-30 (user/30): unchanged (first-card assumption).
- No new product bugs. LT8+LT9 deploy did not regress anything.

### Deploy — 2026-07-13 ~12:50 CEST — LT8 + LT9 shipped to production
- `npm run deploy` (full ship gate incl. the new e2e coverage-contract step) → https://falamadeira.searchingfool.com — manifest 200, new bundle hash serving, **6/6 prod smoke green** (`BASE_URL=prod --grep @smoke`).
- In prod now: offline practice grades persist + sync on reconnect; offline PWA reload keeps the session (LT9, 869dc7c); admin voice-limit clobber race closed (LT8, 715c9b7 — builder-authored, runner-reviewed). Users need a hard refresh / SW update cycle to pick up the new bundle.

### Run 5 — 2026-07-13 ~12:30 CEST — full suite (Lane B; LT9 fix verification)
- 67 tests / 55 files · **58 passed · 9 failed (5.3m)** · artifacts: `artifacts/e2e-run5-2026-07-13/`.
- **LT9/EF-29 FIXED (commit 869dc7c) — five sites, two layers.** Layer 1: the four engines' network `getUser()` → local `getSession()`; probe confirms the offline grade is durably enqueued (exact payload in `sync:queue`). Layer 2 (found during acceptance): the FIFTH site was `useAuth`'s boot check — an offline PWA reload landed signed-in users on the AuthScreen and left the replay without auth; fixed the same way. Dev-probe confirms the reconnect drain (`SYNC_QUEUE_FLUSHED synced 1`); user/30 passes solo; offline reload now keeps the session. Gates: tsc 0 · 154/154 unit · full suite 58/67.
- **Passed this run (previously failing):** admin/05 (EF-14 — card anchoring + the seed sweep removed the ambiguity pile), admin/07 (EF-15 second half), user/30 solo-verified (see EF-30 for its in-suite data flake).
- **Still failing (all pre-known Lane A items):** admin/06 (EF-15 select-option visibility), user/04 (EF-16), user/17 (EF-27), user/20 (EF-22), user/21 (EF-23), user/24 (EF-25), user/25 (EF-24), user/29 (EF-28).
- **New: EF-30** — user/30 in-suite failure is a spec DATA assumption: it expects the first flashcard to be 'Bom dia', but SRS state written by earlier suite specs reorders the deck (Lane B probe once enqueued 'Boa tarde' as first card). Product path verified working; fix the spec to grade the card it actually shows (read the visible word, assert that item key) or reset the situation's mastery rows in setup.

### Run 4 — 2026-07-13 ~11:30 CEST — full suite (Lane B; builder batch incl. user/29-30)
- 67 tests / 55 files · **56 passed · 11 failed (5.0m)** · suite lock held · artifacts: `artifacts/e2e-run4-2026-07-13/`.
- **Verified this run:** EF-13 (admin/03 passes — card anchoring fixed), user/14 & daily-session storage reads hold, my-submissions… (see EF-27 note), plus the whole previously-green set stayed green after the seed sweep.
- **⚠ REAL PRODUCT BUG FOUND — EF-29/LT9 (user/30 is a CORRECT spec):** offline vocabulary grades are silently DROPPED. Lane B instrumented probe (IDB put-spy + net capture): `VocabularyView` resolves identity via `supabase.auth.getUser()` — a NETWORK call — captured failing `auth/v1/user :: ERR_INTERNET_DISCONNECTED`; the view then mounts "signed out", `applyGrade` short-circuits, `enqueue` never runs (zero `sync:queue` IDB puts), nothing to flush on reconnect. Systemic: the same network-`getUser()` identity pattern is in `missionsStore.ts:141`, `simulator/progress.ts:44`, `speaking/attempts.ts:60` — all four engines lose persistence offline. Fix (product): resolve identity locally (`auth.getSession()`) or thread the user from App; grades must enqueue whenever a local session exists.
- **Reproduced:** EF-16 (user/04), EF-24 (user/25 — answers still junk, score <3), EF-25 (user/24 — section anchor still resolves 2 headings: same outermost-ancestor trap on `locator('section').filter(...).first()`).
- **Progressed (new signatures):** EF-14 (admin/05: card click anchoring works; the in-card STATUS assert now strict-fails — 3 'in-progress' texts inside the anchored card; assert the status badge node specifically). EF-15 (admin/06: helper now finds the pack ✓; NEW: asserting `<option>` visibility — options inside a native `<select>` are never "visible" to Playwright; assert `toHaveValue`/selected option instead. admin/07: validation text `situation.phrase_patterns` appears twice — `.first()` or scope the error list). EF-22 (user/20: builder applied the main-scope; Home's `main` holds 3 'Practice' buttons — multiple Focus suggestions each carry one; scope to the suggestion card or `.first()`). EF-23 (user/21: enabled-wait added; next blocker — after 'Next Question' the following question may be CHOICE-type with no text input; branch per question type instead of always waiting for the input).
- **New items:** EF-27 (user/17-my-submissions: 'approved' exact-text matches 2 badges — first regression of this spec, likely from status-seeding changes), EF-28 (user/29 simulator scripted: first exchange works, then option button 'Obrigado.' not found — verify the scripted branch against the pack's actual sit-d1 dialogue nodes; owner data).

### Run 3 — 2026-07-13 ~10:15 CEST — full suite (Lane B rerun of EF-13…EF-24)
- 64 tests / 53 files · **55 passed · 9 failed (4.4m)** · suite lock held throughout · artifacts: `artifacts/e2e-run3-2026-07-13/`.
- **Verified this run:** EF-18 (user/15/16/23), EF-19 (user/17), EF-20 (user/18), EF-21 (user/19), EF-17 (storage-layer read — user/14 passes; user/24 got past the poll). PF-3/LT8 product fix (voice-limit dirty flag in `useSettings.ts`) reviewed by runner — correct. New preflight step `test:e2e:coverage` validated: exit 0, 127 controls.
- **EF-22 adjudicated (Lane B code trace): TEST BUG, app correct.** `handleFocusAct` (HomeView.tsx:137) DOES auto-route via `openMode(engineId, situationId)`. The spec's `getByRole('button', { name: 'Practice' }).first()` resolves to the SIDEBAR nav button (earlier in DOM order than the FocusCard CTA, both named "Practice"), which only switches tabs. Fix: scope to `getByRole('main')` / the card container.
- **Reproduced unchanged (deterministic):** EF-13 (now 7 matches), EF-14 (now **15** matches — seed garbage nearly doubles per run, CS-8 now URGENT), EF-15 (both content-studio specs), EF-16 (user/04 modal never opens).
- **Progressed with new signatures:** EF-23 — overlay scoping fixed; NEW blocker: the typed-answer input is `disabled` after an answer is submitted; fill the next answer only after 'Next Question' resets it. EF-24 — roadmap navigation fixed; quiz now completes but junk answers score <3, so `/Quiz completed! Score: [3-5]/` never appears — the spec must source CORRECT answers from the pack content to pass and trigger the `completed_lessons` write. EF-25 filed (user/24 duplicate heading).

### Run 2 — 2026-07-13 ~09:35 CEST — full suite, local preview + live Supabase
- Command: `npx playwright test --reporter=line` · Suite grew to **64 tests / 53 files** (all compile).
- Pre-run: runner reviewed + applied **migration 00009 live** (authored by test agent, whose sandbox cannot reach the DB; APPLIED.md claimed it but live lacked it — column + policy now verified live). Runner held the suite-run queue claim for the whole run (CS-6) — no mid-run contamination this time.
- **Result: 48 passed · 16 failed (5.7m).** Round-1 scoreboard: **EF-1, EF-2, EF-4…EF-12 all `verified`** (10 items closed); EF-3's product half verified fixed (seeded request now visible to admin — RLS works; a selector defect remains, split to EF-13). **Tutor switching works end-to-end (EF-10/LT6 closed). Admin Requests queue works (LT7 closed).** STT mock landed: 10-speaking-stt + response-speed now RUN and PASS (CG-1, CG-12 closed); audio-state (CG-3), unlock-key (CG-14), voice-limit (CG-15) specs pass — closed.
- The 16 round-2 failures are ALL in new/modified specs — triaged as EF-13…EF-24 below. None is a new product bug; one is good product news (offline drilling verified working).
- Artifacts: `artifacts/e2e-run2-2026-07-13/` (tgz snapshots).

### Run 1 — 2026-07-13 07:35 CEST — full suite, local preview (127.0.0.1:4173) + live Supabase
- Command: `npx playwright test --reporter=line` (this machine binds ports fine; webServer built dist/ and served preview)
- Tree: origin/main @ e59755a + test agent's uncommitted specs. `--list` OK: 38 tests / 28 files, all compile.
- Global setup: OK (admin session + throwaway user minted).
- **Result: 25 passed · 12 failed · 1 skipped (3.8m).**
- Artifacts snapshot (test-results/ is overwritten every run): `artifacts/e2e-run-2026-07-13-0735/test-results-snapshot.tgz` + `run-log.tgz`. Per-failure paths below refer to dirs inside that snapshot.
- ⚠️ Concurrency note: another agent re-ran global-setup DURING triage (tests/e2e/.auth/*.json regenerated mid-analysis, new throwaway user). See E-1.

---

## Bucket 1 — EXECUTION FAILURES (discrete items)

### EF-1 · offline split never triggers — `setOffline` hits the wrong browser context
- **Spec:** `tests/e2e/08-offline.spec.ts:16`
- **Test:** offline behavior (S17 §10) › online-only marked; offline shows "Online only" while offline-capable modes still work
- **Failure type:** assertion timeout — `heading "Online only"` never visible; snapshot shows Simulator's NORMAL difficulty picker (app never saw offline)
- **Reproducibility:** deterministic (structural; will fail every run)
- **Likely owner:** **harness** (fixtures)
- **Evidence:** `fixtures.ts` overrides `page` → `userPage`, created from a **new** `browser.newContext(...)`; the spec's `context` fixture is still Playwright's built-in default context, so `context.setOffline(true)` toggled an unrelated, pageless context. Runner probe confirmed Playwright's `setOffline` DOES flip `navigator.onLine` + fires the `offline` event in this Chromium when applied to the right context. App code is correct (`SimulatorView.tsx:30` useIsOnline; guard at `:122`).
- **Suggested fix (test agent):** use `page.context().setOffline(true)` in the spec, or make fixtures override `context` to be the userPage's context. Audit any other spec that destructures `{ context }`.
- **Artifacts:** `08-offline-offline-behavio-aa009-…/` (screenshot, error-context.md, trace.zip)
- **Status:** verified — run 2 (2026-07-13): spec passes after fixtures context fix

### EF-2 · Global Voice Limit panel — locator resolves to the whole page
- **Spec:** `tests/e2e/admin/02-admin-global-settings.spec.ts:21`
- **Test:** admin global settings › Global Voice Limit writes to global_settings and can be restored
- **Failure type:** poll mismatch — expected 5 (DB initial), extracted 30
- **Reproducibility:** deterministic
- **Likely owner:** **selector** — `adminPage.locator('div').filter({ hasText: 'Global Voice Limit' }).first()` matches the OUTERMOST ancestor div (whole page), so `extractFirstInteger(panel.textContent())` grabs the first integer anywhere on the page (30 = likely admin's personal `profiles.voice_limit` display), not the global control. Runner verified live `global_settings.voice_limit` = "5" (updated_at 2026-07-10 — untouched, so the app did NOT clobber it).
- **Suggested fix (test agent):** anchor on the control itself, e.g. `getByText('Global Voice Limit').locator('xpath=ancestor::div[1]')` or a tight `.filter({ has: … })` on the innermost card; or read the value node directly.
- **Related product finding:** PF-3 below (mount-time write-back race in the same control — separate item, did not fire this run).
- **Artifacts:** `admin-02-admin-global-sett-90145-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-3 · Admin Review Queues never shows users' lesson requests — live RLS gap
- **Spec:** `tests/e2e/admin/03-admin-review-queues.spec.ts:11`
- **Test:** admin review queues › admin can read seeded pending items and resolve queue actions
- **Failure type:** assertion timeout — seeded request theme not visible (correction WAS visible)
- **Reproducibility:** deterministic
- **Likely owner:** **app** (live DB schema/RLS) — **REAL PRODUCT BUG.** The test is correct.
- **Evidence (runner, pg-direct + REST):** seeded row EXISTS in `lesson_requests` (RLS-bypassed count = 1). Live SELECT policy is `auth.uid() = user_id` with **no `OR is_admin()`** — unlike `lesson_corrections` (`… OR is_admin()`), `tickets` (has it), `video_suggestions` (has it). Admin REST probe: 0 rows from `lesson_requests`, 1 row from `lesson_corrections`. So the Requests queue in Admin Review is permanently empty for other users' rows in production.
- **Fix (runner/product session):** migration 00009 — recreate the `lesson_requests` SELECT policy as `((auth.uid() = user_id) OR is_admin())`; log in `supabase/migrations/APPLIED.md`. Test should pass unchanged afterward (later assertions on tickets/videos already have working policies).
- **Artifacts:** `admin-03-admin-review-queu-777b3-…/`
- **Status:** verified (product) — migration 00009 applied live by runner 2026-07-13; seeded request now visible to admin in run 2. Remaining selector defect split to EF-13.

### EF-4 · Home "Continue Learning" — button is named by the lesson title, not the heading
- **Spec:** `tests/e2e/user/01-home-navigation.spec.ts:11`
- **Test:** home navigation surfaces › Home opens settings, unlock modal, and Continue Learning routes into a lesson detail
- **Failure type:** click timeout — `getByRole('button', { name: /Continue Learning/i })` not found
- **Reproducibility:** deterministic
- **Likely owner:** **selector** — "Continue Learning" is a sibling `h2` (`HomeView.tsx:304`); the actual card IS a `<button>` but its accessible name is the lesson title + "Month N • category". Optional app improvement: add `aria-label="Continue Learning: {title}"` to the card button, but the selector fix is sufficient.
- **Suggested fix (test agent):** locate the card via the section, e.g. `page.getByRole('heading', { name: 'Continue Learning' })` then the adjacent button, or `getByRole('button', { name: /Month \d/ }).first()`.
- **Artifacts:** `user-01-home-navigation-ho-d3659-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-5 · Lesson-detail modals — `Close` strict-mode violation (parent + child dialogs)
- **Spec:** `tests/e2e/user/03-learning-detail-surfaces.spec.ts:11` (line 24)
- **Test:** learning detail surfaces › Vocabulary Lookup and Start Practice Quiz open their real modal surfaces
- **Failure type:** strict-mode violation — `getByRole('button', { name: 'Close' })` resolves to 2 (Lesson Details dialog + Vocabulary Lookup dialog)
- **Reproducibility:** deterministic
- **Likely owner:** **selector**
- **Suggested fix (test agent):** scope to the child: `page.getByRole('dialog', { name: 'Vocabulary Lookup' }).getByLabel('Close')`. (Positive signal: both dialogs render with proper roles/names — the focus-trap stack works.)
- **Artifacts:** `user-03-learning-detail-su-08a1c-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-6 · Practice browse — `Culture` matches 6 buttons
- **Spec:** `tests/e2e/user/05-practice-browse-and-quiz.spec.ts:11` (line 24)
- **Test:** practice browse and quiz entry › Browse situations expands a real situation and routes into Culture mode
- **Failure type:** strict-mode violation — mode chip + 5 situation titles containing "Culture"
- **Reproducibility:** deterministic (content-dependent: pack situations contain the word)
- **Likely owner:** **selector**
- **Suggested fix (test agent):** `getByRole('button', { name: 'Culture', exact: true })` (element #1 in the violation list is exactly that).
- **Artifacts:** `user-05-practice-browse-an-e03a7-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-7 · Practice mode routing — sidebar "Practice" does not close an active mode
- **Spec:** `tests/e2e/user/07-practice-mode-routing.spec.ts:11` (line 20)
- **Test:** practice mode routing › Vocabulary Review, Phrase Library, and Speaking open their real mode bodies
- **Failure type:** click timeout — `Phrase Library` tile never visible after finishing Vocabulary Review
- **Reproducibility:** deterministic
- **Likely owner:** **selector/data (navigation assumption)** — clicking the sidebar Practice nav only switches tabs; it does NOT reset the active mode route (documented in `08-offline.spec.ts:46-48`). The page was still inside Vocabulary Review, so the tile grid never rendered.
- **Suggested fix (test agent):** exit each mode via the mode-chrome back button (chevron-left) before opening the next tile — same pattern 08-offline uses.
- **Artifacts:** `user-07-practice-mode-rout-1b86d-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-8 · Tutor practice modal — "Type in Portuguese..." matches 2 inputs
- **Spec:** `tests/e2e/user/08-tutor-practice-modal-controls.spec.ts:11` (line 35)
- **Test:** tutor practice modal controls › Start Today's Lesson opens the tutor modal and local controls respond
- **Failure type:** strict-mode violation — main tutor chat input + modal dialog input share the placeholder
- **Reproducibility:** deterministic
- **Likely owner:** **selector**
- **Suggested fix (test agent):** scope to `getByRole('dialog', { name: /Tutor/ }).getByPlaceholder('Type in Portuguese...')` (the violation output shows the dialog is named "AI Maria Tutor" — consider `/Tutor/` since tutor name varies).
- **Artifacts:** `user-08-tutor-practice-mod-ff2c9-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-9 · Playback-speed slider — direct `input.value=` is swallowed by React
- **Spec:** `tests/e2e/user/09-settings-persistence.spec.ts:11` (line 26)
- **Test:** settings persistence › playback speed change persists to the profile row
- **Failure type:** assertion timeout — UI never shows "1.3x"
- **Reproducibility:** deterministic
- **Likely owner:** **harness (technique)** — the spec sets `input.value = '1.3'` then dispatches `input`/`change`. React's controlled-input value tracker dedupes direct value writes, so the state never changes (`SettingsView.tsx:241` renders `{playbackSpeed}x` from React state).
- **Suggested fix (test agent):** use the native setter trick inside `evaluate`: `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, '1.3')` then dispatch `input` (bubbles) — or drive the slider with keyboard (`slider.focus()` + ArrowRight presses), which is closer to real usage. Also verify `input[type="range"]` `.first()` is actually the playback slider.
- **Artifacts:** `user-09-settings-persisten-4b019-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-10 · Switch AI Tutor — `profiles.selected_tutor_id` column DOES NOT EXIST in live DB
- **Spec:** `tests/e2e/user/10-settings-readwrite.spec.ts:11` (line 34)
- **Test:** settings read/write coverage › Switch AI Tutor persists to profiles and can be restored
- **Failure type:** assertion timeout — "Choose Your Tutor" modal never closes after picking a tutor
- **Reproducibility:** deterministic
- **Likely owner:** **app** (live DB schema drift) — **REAL PRODUCT BUG, prod-affecting.** The test found it correctly.
- **Evidence (runner):** PATCH `profiles.selected_tutor_id` as the e2e user → `400 PGRST204 "Could not find the 'selected_tutor_id' column"`. Live `profiles` columns verified: no `selected_tutor_id`. App code writes it (`useSettings.ts:332`) and only closes the modal on success (`:338`) — so every tutor switch fails for every user, the error is logged but the modal just sticks open. This exactly matches the "modal seems stuck" class the owner saw in live testing.
- **Fix (runner/product session):** migration 00009 — `ALTER TABLE profiles ADD COLUMN selected_tutor_id text` (nullable; app defaults to Maria when null); log in APPLIED.md. Optional hardening: on update error show the Ref-carrying toast instead of a silent stuck modal.
- **Artifacts:** `user-10-settings-readwrite-29368-…/`
- **Status:** verified — migration 00009 applied live by runner 2026-07-13 (column + 't1' default verified); run 2: tutor switch persists and restores end-to-end.

### EF-11 · Terms of Service — `/Version/i` strict-mode violation
- **Spec:** `tests/e2e/user/11-settings-static-surfaces.spec.ts:10` (line 36)
- **Test:** settings static surfaces › User Manual, App Tutorial, and legal documents open and navigate
- **Failure type:** strict-mode violation — matches the version stamp AND body copy "We may update these terms. The version and date…"
- **Reproducibility:** deterministic
- **Likely owner:** **selector**
- **Suggested fix (test agent):** `getByText(/Version \d/)` or `.first()`.
- **Artifacts:** `user-11-settings-static-su-ce3f6-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes

### EF-12 · Settings path control — "Learn by goal" is the ONBOARDING label, not Settings'
- **Spec:** `tests/e2e/user/14-settings-local-controls.spec.ts:11` (line 24)
- **Test:** settings local controls › theme, path type, and offline-audio controls respond and persist locally
- **Failure type:** click timeout — `button "Learn by goal"` not found on the Settings screen
- **Reproducibility:** deterministic
- **Likely owner:** **selector/data** — "Learn by goal" exists only in `OnboardingFlow.tsx:92`. The Settings path selector uses the path-policy names (comment at `SettingsView.tsx:193`: "Structured course / Goal track / Adaptive guided / Free"). Check the rendered button labels in SettingsView and target those.
- **Artifacts:** `user-14-settings-local-con-49ca6-…/`
- **Status:** verified — run 2 (2026-07-13): spec passes past the label click (new storage-layer issue split to EF-17)

---

---

## Round-2 execution failures (2026-07-13 run 2 — all in new/modified specs; no new product bugs)

### EF-13 · admin queue action buttons — `filter().first()` ancestor trap (recurrence of pitfall #2)
- **Spec:** `tests/e2e/admin/03-admin-review-queues.spec.ts:69` · **Test:** admin can read seeded pending items and resolve queue actions
- **Failure type:** strict-mode violation — `locator('div').filter({ hasText: correctionText }).first().getByRole('button', { name: 'Approve correction' })` resolves to 5 buttons (the `.first()` div is an outer container holding ALL queue cards)
- **Reproducibility:** deterministic · **Likely owner:** **selector**
- **Suggested fix:** anchor the card on its innermost container: `getByText(correctionText).locator('xpath=ancestor::div[1]')` or `.locator('div').filter({ hasText: x }).last()`; same pattern as EF-2's fix. See repo-specs/testing/playwright Known Pitfalls #2.
- **Artifacts:** `artifacts/e2e-run2-2026-07-13/…admin-03…` · **Status:** fixed-pending-rerun — builder replaced the outer-container `filter().first()` pattern with a `queueCard()` helper anchored from the target text node to the nearest rounded card (`tests/e2e/admin/03-admin-review-queues.spec.ts`).

### EF-14 · admin/05 same ancestor trap — and seed garbage is accumulating
- **Spec:** `tests/e2e/admin/05-admin-queue-actions.spec.ts:90` · **Test:** admin can resolve request, ticket, and video actions beyond the default happy path
- **Failure type:** strict-mode violation — 'Mark implemented' resolves to **8** buttons: the queue now holds 8 pending requests from prior runs (CS-8 evidence — the owner's real admin view is filling with `Admin queue …` test rows)
- **Reproducibility:** deterministic, worsening per run · **Likely owner:** **selector** (+ **data** for cleanup)
- **Suggested fix:** same card-anchoring fix as EF-13, PLUS implement CS-8 now: afterEach delete seeded rows by nonce via evidence clients; also run a one-off sweep of accumulated `Admin queue…`/`Admin implemented…` rows.
- **Status:** fixed-pending-rerun — builder applied the same `queueCard()` selector anchoring in `tests/e2e/admin/05-admin-queue-actions.spec.ts`, added finally-block teardown for all seeded queue rows, and removed the brittle in-card `'in-progress'` text assert now that DB status polling already proves the state change.
- **Runner sweep 2026-07-13 ~10:30:** Lane B deleted all accumulated seed rows live (single transaction; patterns `Admin…`/`E2E…`+nonce): 26 lesson_requests, 12 lesson_corrections, 12 tickets, 12 video_suggestions. Next run starts clean — but WITHOUT Lane A's afterEach teardown the pile regrows every run. Throwaway auth users (`falamadeira-e2e-*@example.test`) also accumulate; sweeping `auth.users` is more sensitive — Lane A should add global-teardown deletion via the account-deletion path, or the owner approves a one-off auth sweep.

### EF-15 · content-studio specs: `pickExistingSituation` finds no eligible situation (admin/06 + admin/07)
- **Specs:** `admin/06-admin-content-studio-load-existing.spec.ts:108`, `admin/07-admin-content-studio-publish-guard.spec.ts:90` · **Failure type:** `expect(target).not.toBeNull()` — helper returned null against the live `content_packs` rows
- **Reproducibility:** deterministic · **Likely owner:** **data** (helper's eligibility criteria don't match any live pack/situation shape)
- **Suggested fix:** log WHICH criterion filtered everything out (pack status? draft fields? situation kind?) and align with the live pack (v1.3.0, 187 situations, status semantics in CONTENT-ARCHITECTURE); assert a helpful message instead of bare not-null so the next failure self-explains.
- **Status:** fixed-pending-rerun — builder aligned both spec helpers with the live content-studio/schema contract by making `goals` optional and removing `goals.length > 0` from the candidate filter in `tests/e2e/admin/06-admin-content-studio-load-existing.spec.ts` and `tests/e2e/admin/07-admin-content-studio-publish-guard.spec.ts`; run-4/run-5 follow-ups are also patched locally (`admin/06` now avoids native-option visibility checks AND no longer assumes the transient "Edit situation" `<select>` retains the chosen value after hydration, while `admin/07` scopes the duplicated `situation.phrase_patterns` validation text with `.first()`).

### EF-16 · user/04 (modified this round): lesson-detail modal never opened before 'Vocabulary Lookup' click
- **Spec:** `tests/e2e/user/04-learning-feedback.spec.ts:81` · **Failure type:** click timeout; snapshot shows the Learning Plan WITHOUT the Lesson Details dialog — `openFirstLessonDetails(page)` didn't open it (likely interaction with the modals opened/closed earlier in the same test)
- **Reproducibility:** new this round (spec was refactored; round-1 version passed) · **Likely owner:** **harness** (helper/flow state) — NOT a product regression: unmodified `user/03` opens the same modal and PASSED this run
- **Suggested fix:** after closing the suggest-video modal, wait for the Learning Plan to be interactive again before calling the helper; have `openFirstLessonDetails` assert the dialog actually opened.
- **Status:** fixed-pending-rerun — builder re-hardened the flow in `tests/e2e/user/04-learning-feedback.spec.ts` by reasserting the Learning Plan state, reopening Lesson Details before the correction path, making `openFirstLessonDetails()` retry once if the first click does not actually open the dialog, correcting the live control name mismatch (`Vocab` opens the `Vocabulary Lookup` dialog), and scoping the quiz helper into the fixed overlay so its fallback answer click cannot escape to the animated lesson-detail pronunciation buttons underneath. Run-8 follow-up is also patched locally: progression detection now polls the quiz progress-dot index after each multiple-choice `Next Question` click, so the helper cannot re-click an already-answered prior card when consecutive typed questions reuse the same heading text.
- **Run-12 update (15:05 revision): still failing, NEW layer.** After "Suggestion submitted for review!" succeeds, the spec's next click (the `[class*="cursor-pointer"]` Day item) is intercepted for the FULL 15s by a `div.fixed.inset-0.z-[60]` overlay (plus transiently the success toast). App-side the suggest-video modal DOES close on success (`useLessonModals.ts:114` sets `isSuggestionModalOpen=false` BEFORE the toast) — so the lingering z-60 overlay is a DIFFERENT dialog still mounted (stacked-dialog family, pitfall #4): most likely the Lesson Details dialog the suggest modal was opened from. Close/dismiss the parent dialog (or act inside it) before touching the Learning Plan list. Also note this spec's failure leaks its seeded rows into the live queues when it dies before cleanup — see the run-12 data-hygiene note. Artifacts: `artifacts/e2e-run12-2026-07-13.tgz` → `user-04-learning-feedback…`.

### EF-17 · path-selection asserted in localStorage, but the app persists via platform.storage = IndexedDB (user/14 + user/24)
- **Specs:** `user/14-settings-local-controls.spec.ts:35`, `user/24-daily-session-loop.spec.ts:25` · **Failure type:** poll `localStorage.getItem('paths:selection')` stays null
- **Reproducibility:** deterministic · **Likely owner:** **harness** (wrong storage layer)
- **Evidence:** the app writes `config.paths.selectionStorageKey` (`'paths:selection'`) via `platform.storage.set` (`src/paths/index.ts:134`), whose web adapter is **IndexedDB `FalaMadeiraAudioCache/kv`** (`src/platform/web/storage.web.ts`; localStorage only as `fm-kv:`-prefixed fallback). The UI part of user/14 passed — the 'Goal track' label fix worked; only the persistence read is wrong.
- **Suggested fix:** read the IndexedDB kv store in `page.evaluate` (same DB/store the onboarding init-script already writes) — worth adding a tiny `readKv(page, key)` helper in fixtures.
- **Status:** verified — run 3: user/14 passes; user/24 got past the storage poll (its remaining failure is EF-25, a different defect)

### EF-18 · Settings screen heading is "Profile", not "Settings" (user/15 + user/16 + user/23)
- **Specs:** `user/15-settings-signout.spec.ts:14`, `user/16-settings-password-surface.spec.ts:14`, `user/23-account-delete-cancel.spec.ts:23` · **Failure type:** `getByRole('heading', { name: 'Settings' })` not found
- **Reproducibility:** deterministic · **Likely owner:** **selector**
- **Evidence:** `SettingsView.tsx:140` — `<h1>Profile</h1>`. (Passing settings specs never asserted this heading.)
- **Suggested fix:** assert `heading "Profile"` — or propose renaming the H1 if "Settings" is the intended product wording (owner call; nav button also says Profile, so the test should follow the product).
- **Status:** verified — run 3: all three specs pass

### EF-19 · auth mode toggle — 'Password' collides with 'Forgot Password?' (pitfall #6)
- **Spec:** `tests/e2e/user/17-auth-mode-transitions.spec.ts:31` · **Failure type:** strict-mode violation (2 matches; element 1 is the exact-match tab)
- **Reproducibility:** deterministic · **Likely owner:** **selector** · **Suggested fix:** `exact: true`.
- **Status:** verified — run 3: user/17 passes

### EF-20 · `/Version/i` strict violation copied into the NEW signup-consent spec (recurrence of EF-11)
- **Spec:** `tests/e2e/user/18-auth-signup-consent-links.spec.ts:30` · same two-element collision EF-11 had; the fixed pattern from user/11 wasn't propagated to the new spec.
- **Reproducibility:** deterministic · **Likely owner:** **selector** · **Suggested fix:** `getByText(/Version \d/)`; consider a shared `expectLegalDocOpen()` helper so the pattern exists once.
- **Status:** verified — run 3: user/18 passes

### EF-21 · offline pattern drill: after grading, the NEXT card is in Reveal state — spec expects a grade button or completion
- **Spec:** `tests/e2e/user/19-offline-pattern-builder-drill.spec.ts:43` · **Failure type:** assertion timeout
- **Reproducibility:** deterministic · **Likely owner:** **selector/data** (flow assumption)
- **Evidence:** failure snapshot shows the drill correctly advanced offline to the next phrase: "Reveal the Portuguese" + "Reveal the phrase to grade your recall" — grade buttons only appear after Reveal. **Good product news: offline drilling WORKS** (this closes the product question in CG-16's read path).
- **Suggested fix:** loop: reveal → grade → expect (next Reveal | Drill complete).
- **Status:** verified — run 3: user/19 passes (offline drill loop asserted correctly)

### EF-22 · coach Focus 'Practice' routing — Vocabulary Review heading never appears
- **Spec:** `tests/e2e/user/20-home-coach-focus-actions.spec.ts:74` · **Failure type:** assertion timeout after clicking the Practice nav
- **Reproducibility:** deterministic · **Likely owner:** **TBD (app-or-test)** — the why-panel and suggestion asserts PASSED; the open question is whether acting on a Focus suggestion is supposed to auto-route into the suggested mode (check `handleFocusAct` in `HomeView.tsx:85`) or the spec wrongly assumes the Practice tab lands inside the mode. If the product intends auto-routing and doesn't, that's a real app bug — needs a decision from the code, not a guess.
- **Status:** fixed-pending-rerun — builder tightened the adjudicated selector fix in `tests/e2e/user/20-home-coach-focus-actions.spec.ts` again for run 4: the `Practice` click is now scoped to the same suggestion card as the opened `Why this?` control, avoiding the three-card collision inside `main`. Run-6 contamination follow-up is also patched locally: the spec now wipes the shared user's `mastery_items` before seeding its due review row and cleans them up afterward so a prior spec cannot outrank the intended Focus suggestion.

### EF-23 · quiz options clicked in `main`, but the quiz renders in a fixed z-60 overlay that intercepts pointer events
- **Spec:** `tests/e2e/user/21-quiz-full-flow.spec.ts:34` · **Failure type:** click timeout — `locator('main button')…` targets a button BEHIND the quiz overlay (`div.fixed.inset-0.z-[60]` intercepts)
- **Reproducibility:** deterministic · **Likely owner:** **selector**
- **Suggested fix:** scope option clicks inside the quiz surface itself (role=dialog if it has one, else the z-60 container), not `main`.
- **Status:** VERIFIED-CLOSED (run 12) — user/21 passes. Builder scoped interactions into the quiz overlay and branches per question type in `tests/e2e/user/21-quiz-full-flow.spec.ts`: translation questions use the text input + `Check Answer`, choice questions click an answer option inside the quiz grid with no typed-input wait assumption. Run-8 follow-up is also patched locally: after each `Next Question` click the spec now polls the active quiz progress-dot index, not the reused typed-question heading text, so consecutive translation questions no longer produce a false "did not advance" failure.

### EF-24 · quiz progression: 'Greetings & Presence' button not found on the Learning Plan
- **Spec:** `tests/e2e/user/25-learning-quiz-progression-write.spec.ts:44` · **Failure type:** click timeout
- **Reproducibility:** deterministic · **Likely owner:** **selector/data** — the roadmap likely needs a month/day expansion first, or the day button's accessible name differs from the raw title (compare with `openFirstLessonDetails`, which works in user/03).
- **Suggested fix:** reuse `openFirstLessonDetails`-style navigation (or expand Month 1 → Day 1 explicitly) instead of matching the lesson title at top level.
- **Status:** VERIFIED-CLOSED (run 12) — user/25 passes. Builder switched the spec to the same first-lesson card navigation used elsewhere and replaced the junk-answer heuristic in `tests/e2e/user/25-learning-quiz-progression-write.spec.ts` with a deterministic answer path derived from the actual quiz implementation in `src/components/Quiz.tsx` plus `INITIAL_LESSONS[0]`. Multiple-choice questions use the real vocabulary prompt mapping, typed questions capture the quiz's own TTS request payload after `Play audio`, and the loop now waits for the `h3` question text to change after each `Next Question` click so it cannot re-act on the prior answered state.

### EF-25 · user/24: "Today's Session" heading duplicated — strict violation after storage fix
- **Spec:** `tests/e2e/user/24-daily-session-loop.spec.ts:28` · **Failure type:** strict-mode violation — `getByRole('heading', { name: "Today's Session" })` resolves to 2 elements (Home's session card AND the DailySessionView heading both render it)
- **Reproducibility:** deterministic (run 3) · **Likely owner:** **selector** (scope to the session surface); minor product nit: two identical headings on one screen is also an a11y smell — Lane B will flag to product if scoping doesn't isolate cleanly
- **Status:** ✅ CLOSED (run 15, commit add5911). See run-14/run-15 updates below. — builder replaced the broad `locator('section').filter(...).first()` pattern in `tests/e2e/user/24-daily-session-loop.spec.ts`; the session card is now anchored from the actual `Start today's session` button to its nearest ancestor section before asserting/clicking, the post-launch assert was corrected to the ACTIVE session UI that actually renders (`Skip` + `Segment N of M`), and the product copy has now been differentiated in `src/features/session/DailySessionView.tsx` from `"Today's session"` to `"Daily session"` so the duplicate-heading/a11y collision no longer exists in the live surface.
- **Run-12 update: app half VERIFIED (PF-5 closes — "Daily session" renders live), spec half still fails — NEW strict violation.** `homeSessionSection.getByRole('heading', { name: "Today's Session" })` (spec line 32) resolves to 2 elements: the Home card's h2 "Today's Session" AND the h3 "Start today's session" INSIDE the CTA button (getByRole name matching is case-insensitive substring by default — pitfall #6, non-exact name collision). Fix (high confidence, one token): `{ name: "Today's Session", exact: true }`. Owner: Lane A. Artifacts: `artifacts/e2e-run12-2026-07-13.tgz` → `user-24-daily-session-loop…`.
- **Run-14 update: the `exact:true` fix (Lane A, 0986b96) WORKED — spec now reaches the recap.** New (third) layer: line 50 `getByText(/Nicely done/i)` → strict violation, 2 matches (per-segment "Nicely done" labels on the recap). Fix: `.first()` or scope to a segment. Legitimate product copy — not a duplicate-heading a11y smell like the original EF-25. Owner: Lane A. Artifacts: `artifacts/e2e-run14-2026-07-13.tgz` → `user-24…`.

### EF-27 · my-submissions: 'approved' exact-text matches two status badges (first seen run 4)
- **Spec:** `tests/e2e/user/17-my-submissions-statuses.spec.ts:11` · **Failure type:** strict-mode violation (2 matches — two seeded groups both carry an 'approved' badge)
- **Reproducibility:** first failure in 3 runs of this spec (spec/seed change suspected) · **Likely owner:** **selector** — scope the badge assert to its group/row.
- **Artifacts:** `artifacts/e2e-run4-2026-07-13/…user-17…` · **Status:** VERIFIED-CLOSED (run 12) — user/17 passes. Builder scoped each status-pill assertion to the row anchored by its seeded primary text in `tests/e2e/user/17-my-submissions-statuses.spec.ts`, and now asserts the row's trailing status-pill node directly instead of text-matching an ambiguous badge string across the whole modal.

### EF-28 · simulator scripted branch: second exchange option 'Obrigado.' never appears
- **Spec:** `tests/e2e/user/29-practice-simulator-scripted.spec.ts:38` · **Failure type:** click timeout after a successful first exchange (reply text WAS visible)
- **Reproducibility:** deterministic (run 4, first run of this spec) · **Likely owner:** **data** — the scripted option text must match the pack's actual sit-d1 dialogue node options; verify against `content/packs/seed-course.json` (or the node graph exposes different L1 options after the first reply).
- **Artifacts:** `artifacts/e2e-run4-2026-07-13/…user-29…` · **Status:** VERIFIED-CLOSED (run 12) — both user/29 tests pass. Builder verified the seeded sit-d1 scripted node data locally in `src/content/packs/seed-course.ts` (the `Obrigado.` option exists on the polite-response node) and relaxed the tap in `tests/e2e/user/29-practice-simulator-scripted.spec.ts` to wait for and click the first matching `Obrigado.` option instead of relying on a strict exact-name match.

### EF-29 · ⚠ PRODUCT BUG — offline grades silently dropped: engines resolve identity via network `getUser()`
- **Spec:** `tests/e2e/user/30-offline-mastery-queue.spec.ts:26` (spec is CORRECT — do not change its expectation)
- **Failure type:** queued mastery write never flushes — because it was never queued
- **Reproducibility:** deterministic · **Likely owner:** **app** — mirrored to REQUIREMENTS-TRACKER as **LT9**
- **Evidence (Lane B instrumented probe, 2026-07-13):** IDB put-spy shows ZERO `sync:queue` writes after grading offline; net capture shows `GET /auth/v1/user → ERR_INTERNET_DISCONNECTED` at mode entry. `VocabularyView.tsx:315` resolves the user via `supabase.auth.getUser()` (network); on failure it mounts `user: null` ("signed-out sessions expected"), `applyGrade` short-circuits at its guard, `enqueue` never runs. The sync-queue itself is healthy — the identity resolution in FRONT of it breaks the offline chain.
- **Blast radius (same pattern):** `missions/missionsStore.ts:141`, `simulator/progress.ts:44`, `speaking/attempts.ts:60` — all four engines lose persistence when offline or when the auth endpoint is slow/unreachable.
- **Fix (product, high confidence):** replace network `getUser()` with local `auth.getSession()` (persisted session read, no fetch) — or thread the authenticated user down from App state; grades/attempts/progress must enqueue whenever a local session exists. Optional hardening: surface a "practice saved locally, will sync" note instead of silent signed-out downgrade.
- **Artifacts:** `artifacts/e2e-run4-2026-07-13/…user-30…` + probe transcript in run log · **Status:** open — product fix pending assignment

### EF-30 · user/30 in-suite: first-card assumption — deck order depends on prior suite specs' SRS writes
- **Spec:** `tests/e2e/user/30-offline-mastery-queue.spec.ts` · **Failure type:** poll for `vocab:…:Bom dia|retrieve|4` never matches — the graded card was NOT 'Bom dia' (earlier suite specs, e.g. user/15 vocabulary session, write mastery rows for the shared user, reordering due/new selection; Lane B probe observed 'Boa tarde' as the first card under similar state)
- **Reproducibility:** in-suite deterministic-ish (state-dependent); passes solo · **Likely owner:** **data**
- **Suggested fix (Lane A):** read the visible front-of-card word and assert THAT item key (grade what the app actually shows), or delete ALL `mastery_items` for the situation's items in setup, not just the 'Bom dia' row.
- **Artifacts:** `artifacts/e2e-run5-2026-07-13/…user-30…` · **Status:** VERIFIED-CLOSED (run 12) — the deck-order/first-card layer no longer fires; user/30's sole remaining failure is EF-31's reconnect stall. Builder now deletes the shared user's retrieve-dimension `mastery_items` up front, flips the card offline first, reads the authoritative Portuguese word from the BACK face (so the key does not depend on whichever front-face variant the SRS selected), asserts the flushed DB row against the dynamically derived `vocabItemKey(...)`, and cleans the retrieve rows back up after the spec so it cannot contaminate later SRS-driven surfaces. Run-8 follow-up is also patched locally: the spec now re-locates the flipped card by its BACK-face accessible name before reading `p.text-2xl`, which avoids stale pre-flip locators on the audio-first variant.

### EF-31 · ⚠ PRODUCT (narrow) — reconnect replay stalls on offline-reloaded pages: gotrue session-restoration race
- **Spec:** `tests/e2e/user/30-offline-mastery-queue.spec.ts` (spec CORRECT — keep its expectation; it passes when the page is NOT reloaded offline)
- **Failure type:** queued write never drains within 15s of reconnect, only when the page was reloaded WHILE offline
- **Reproducibility:** deterministic in-spec after the 13:37 revision; timing-dependent across builds · **Owner:** **app** — mirrored as **LT10**
- **Evidence (Lane B instrumented probes + trace forensics, 2026-07-13):** two failure modes observed on the same code: (a) replay POST goes out UNAUTHENTICATED → 401 (wire-captured; page shows Home, parallel authed PATCHes succeed — gotrue getSession transiently null right after offline reload); (b) replay never reaches the network (spec trace: ZERO POSTs; flush re-reads queue then blocks — consistent with gotrue's internal navigator-lock held by an offline-started refresh retry). Dev-server probe (no reload) drains perfectly: `SYNC_QUEUE_FLUSHED synced 1`.
- **Shipped hardening (78ddfd0):** flush auth-await, read-failure no longer poisons the cache empty, enqueue re-anchors the cache, online handler invalidates empty cache + one +3s follow-up drain. Necessary, not sufficient.
- **Remaining fix (high confidence, scoped):** on reconnect, if `getSession()` (timeout-guarded, e.g. `Promise.race` 5s) yields no session but a refresh token exists, call `supabase.auth.refreshSession()` once (also timeout-guarded), THEN drain; extend the retry ladder (3s → 10s → 30s) so a late gotrue recovery still drains. Alternatively/additionally raise with supabase-js: offline-boot `_recoverAndRefresh` leaving the lock held is arguably an upstream bug.
- **Artifacts:** probe transcripts in run-log entries; traces under `test-results/…user-30…` snapshots runs 4–10 · **Status:** FIXED-VERIFIED (run 13, commit 024683b) — root cause was the onAuthStateChange self-deadlock (see run 13 + EF-33): the "gotrue lock hang" mode was our own callback awaiting REST inside gotrue's notify loop, and the 401 mode was the drain racing session restoration (now covered by the guarded refreshSession + retry ladder). user/30 passes in-suite and ×3 standalone. No supabase-js upstream bug to report — the library behaved as documented.

### EF-32 · user/32 consent guard: locator text doesn't match the real consent copy
- **Spec:** `tests/e2e/user/32-onboarding-consent-guard.spec.ts:59` (via `toggleConsentRow`, called from :89) · **Failure type:** element not found — `locator('label').filter({ hasText: /I have read and accept the Terms of Service and Privacy Policy/i })`
- **Reproducibility:** deterministic (runs 8–12 of this spec family) · **Likely owner:** **selector** (copy mismatch)
- **Evidence:** the real copy (`OnboardingFlow.tsx` ConsentRow, ~line 414) is **"I agree to the Terms of Service and Privacy Policy (GDPR compliant)."** and **"I understand I am interacting with an AI system (EU AI Act disclosure)…"**. The markup is test-friendly (real `<label>` wrapping a real `input[type=checkbox]`) — only the filter text is wrong.
- **Suggested fix (high confidence):** filter on `/I agree to the/i` and `/I understand I am interacting with an/i` (or `/Terms of Service/` scoped to `label`). Keep the `getByRole('checkbox')` part — it resolves fine once the label matches.
- **Run-14 update: consent-copy regex fix (Lane A, 0986b96) WORKED — row + checkbox now resolve.** New (second) layer: line 61 `checkbox.check({ force: true })` → "Clicking the checkbox did not change its state." NOT a product bug — passing spec user/12 force-checks the same `input[type=checkbox]` and succeeds, so the control toggles for real users. user/32 differs by label-scoped `getByRole('checkbox')` + three legal-doc modal round-trips right before. Fix (Lane A): click the label/row to drive the real `onChange`, or poll the CTA's enabled state instead of asserting `input.checked` (controlled React checkbox + force-check = pitfall #3). Artifacts: `artifacts/e2e-run14-2026-07-13.tgz` → `user-32…`.
- **Status:** ✅ CLOSED (run 15, commit add5911) — Lane B takeover. Final root cause: the LegalPage z-[70] modal's framer-motion exit animation was still covering the checkboxes when the force-click fired (the click hit the exiting overlay, not the input). Fixed by waiting for the legal dialog to detach after Close, plus a state-guarded click + explicit toBeChecked. Verified 3/3 deterministic and in full suite (75/75).

### EF-33 · ⚠ PRODUCT (LT10 family) — My Submissions load wedges after an ONLINE mid-test reload; refresh button disabled forever (user/34 + user/35)
- **Specs:** `tests/e2e/user/34-support-ticket-roundtrip.spec.ts:79`, `tests/e2e/user/35-video-suggestion-roundtrip.spec.ts` (same point) · **Failure type:** click timeout — `Refresh submissions` button stays `disabled` for the full 15s
- **Reproducibility:** deterministic ×2 (run 12 in-suite AND standalone rerun of just 34+35 — identical signature in all four executions) · **Likely owner:** **app** — same wedge family as EF-31/LT10, now WITHOUT offline involvement
- **Evidence (trace forensics, run 12):** the button is `disabled={isLoading}`; `loadMySubmissions` (`useSettings.ts:470`) sets `isLoading=true` then awaits a `Promise.all` of four owner-filtered SELECTs with a `finally` that clears it — so a stuck-disabled button means the queries NEVER settle. Wire truth from `trace.zip → 1-trace.network` (user context): after the spec's second `landOnHome(page)` (= `page.goto('/')`, a full ONLINE reload), the user page issues **ZERO Supabase REST requests of any kind** — not even the boot profile fetch — while the UI still renders (greeting comes up, modal opens). Every supabase-js call on the reloaded page hangs before the network layer: the gotrue session-restoration lock signature of EF-31, triggered here by a plain online reload after ~30–60s of another context's activity. The sequence: boot ✓ (full REST batch) → `POST tickets → 201` ✓ → reload → silence.
- **Forensics caveat:** the Playwright `error-context.md` page snapshot for these failures shows the ADMIN page (Admin dialog + queues), not the failing user page — don't be misled; the click log itself confirms the resolved element is MySubmissionsModal's aria-labelled refresh button on the user page.
- **Why the passing spec differs:** `user/17-my-submissions-statuses` opens My Submissions right after the FIRST boot (no mid-test reload) and passes — the reload is the trigger, exactly as in EF-31.
- **Suggested fix:** same scoped fix as LT10 (timeout-guarded `getSession()` → one timeout-guarded `refreshSession()` → proceed), but applied at the supabase-client/init seam rather than only inside sync-queue — EF-33 proves the wedge blocks ALL post-reload REST traffic, not just queue replay. Consider a supabase-js upstream issue with both wire captures. Product impact if real for users: any reload that hits this race renders the app permanently read-only (infinite spinners) until another reload.
- **Spec-side note (Lane A, secondary):** clicking Refresh immediately after the heading appears also races the auto-load fired by `openMySubmissions` even when healthy; wait for the button to be enabled (or for the initial load to settle) before clicking. This does NOT explain the 15s hang — the product wedge does.
- **Artifacts:** `artifacts/e2e-run12-2026-07-13.tgz` → `user-34-support-ticket-rou…`, `user-35-video-suggestion-r…` (each with trace.zip + two screenshots) + `/tmp/e2e-rerun-3435.log` snapshot inside the tgz · **Status:** FIXED-VERIFIED (run 13, commit 024683b) — root cause: `useAuth.ts` awaited `fetchProfile()` INSIDE the `onAuthStateChange` callback, which gotrue awaits inside its auth lock during `_initialize()` → self-deadlock (REST → getSession → initializePromise → the awaited callback). Fixed by making the callback synchronous and deferring the follow-up fetch to a macrotask; sync-queue drains additionally timeout-guarded. user/34 + user/35 pass ×3 standalone and in-suite. Before/after lock-spy probe logs in `artifacts/e2e-run13-2026-07-13.tgz`.

## Product findings (mirrored to REQUIREMENTS-TRACKER; runner/product session owns)

- **PF-1 (= EF-10):** `profiles.selected_tutor_id` missing in live DB → tutor switching broken in production; silent stuck modal. Fix: migration + optional error toast.
- **PF-2 (= EF-3):** `lesson_requests` SELECT RLS lacks `OR is_admin()` → Admin Review "Requests" queue permanently empty for user submissions. Fix: policy migration.
- **PF-3 (latent, found during EF-2 triage):** `useSettings.ts:289-300` — the admin global-voice-limit write-back effect runs whenever `profile` loads; if it fires before the run-once `fetchGlobalSettings` resolves, an admin's mount can upsert the localStorage/default value (30) OVER the DB value (5), silently reconfiguring production. Did NOT fire this run (`global_settings.updated_at` still 2026-07-10) but the race is real. Fix: skip the write-back until the fetched value has been applied (dirty-flag), or write only on explicit +/- interaction.
- **PF-4 (a11y, minor, from EF-4):** the Continue Learning card button's accessible name is just the lesson title; consider `aria-label` including its function.
- **PF-10 (gap analysis v2):** the offline write-queue wraps ONLY mastery_items — missions, simulator completions, pronunciation attempts, quiz completions, and profile prefs write directly and are lost offline (log-only). §10's promise is one-fifth implemented. Route them through the existing enqueue seam (it's proven); each is a small change now that LT9 fixed identity resolution.
- **PF-6 (quiz architecture review, 2026-07-13, owner-prompted):** quiz questions are GENERATED client-side from the legacy `lesson.vocabulary`/`lesson.patterns` (random 5, `components/Quiz.tsx:22-48`); the pack schema's `review_items` (which the content validator actively encourages) are never read by the Quiz — the same dual-source class as FE3 videos. Authored quiz content is effectively dead data.
- **PF-7 (quiz persistence):** NO per-answer persistence exists — no quiz_results store and, more importantly, no mastery/SRS emission: quiz answers never feed the 'retrieve' dimension, so the Coach is completely blind to quiz performance. The ONLY write is `profiles.completed_lessons` when score ≥3/5 (`usePractice.ts:73-86`), and it is a DIRECT supabase update, NOT routed through the offline sync-queue — **a quiz passed offline silently loses its completion** (one more LT9-class site; the write seam exists, it's just not used here). Optimistic local state is not rolled back on write failure (error is logged+Ref'd).
- **PF-8 (quiz correctness nit):** scoring normalizes punctuation (`normalizeText`) but the inline feedback banner compares with plain lowercase/trim (`Quiz.tsx:173,177`) — the same typed answer can SCORE correct while the banner shows "Incorrect. The answer was: …". Also: accent-sensitive matching is deliberate (EU-PT) but undocumented — specs must type exact diacritics.
- **PF-9 (quiz robustness, minor):** distractors are sampled only from the same lesson's vocabulary with a biased shuffle — lessons with <4 vocab items yield short option lists, and colliding translations can duplicate the correct answer among options. No XP/streak is awarded on quiz completion (gamification loop untouched by quizzes).
- **PF-5 (from EF-25, escalated run 6):** Home's session card AND the daily-session surface rendered identical 'Today's Session' headings inside the same nearest `<section>` — duplicate identical headings were an a11y smell and made the surface un-anchorable for tests. Builder patched the session-view heading to **"Daily session"** in `src/features/session/DailySessionView.tsx`; **runner VERIFIED live in run 12 — PF-5 CLOSED.** (EF-25's remaining failure is a spec-side non-exact-name strict violation, not this.)
- **PF-11 (a11y, WCAG 2.2 AA color-contrast) — ✅ FIXED+DEPLOYED (commit 9aed0db, live 2026-07-14).** Root token `--fm-brand #007AFF` (4.01:1) darkened to `#0063CE` (~5.7:1) for light mode + lighter dark-mode brand `#0A84FF`; scattered Tailwind-default accents on the tested screens fixed (streak `text-orange-500`→`-800`, "Online only" badge→`orange-700`, hero subtitles `text-blue-100/opacity-90`→`text-blue-50`, empty-state green dropped `/80` opacity). axe smoke now 4/4 green. **Remaining tail (tracked, not on a tested screen):** `text-orange-500` on the icon-circle in `LearningView.tsx:220` — verify when a Learning-screen axe smoke is added.
- **PF-13 (⚠ potential PRODUCT bug — schema drift, UNVERIFIED by Lane B):** Lane A's new schema-drift gate (commit 5d12b0a, `scripts/check-schema-drift.mjs`) reports that code writes `profiles` columns the LIVE PROD table is **missing**: `total_time_spent`, `active_month`, `has_accepted_terms`, `has_accepted_ai_usage` (+5 non-literal payloads flagged for manual review). This is the LT6/LT7 pattern (missing column → silent write failure in prod). **Lane B has NOT independently verified against the live DB** — next runner must two-pass verify (`npm run test:schema-drift` with SUPABASE_DB_HOST → prod, then cloud-dev) before treating as confirmed. If real: needs a migration, mirror to REQUIREMENTS-TRACKER as an LT item, and likely a redeploy. Owner: app/DB.
- **PF-12 (a11y, critical, form controls unnamed) — ✅ FIXED+DEPLOYED (commit 9aed0db, live 2026-07-14).** Added `aria-label` to the Audio Speed range input and the Voice Provider / Storage limit / Download-for-offline selects in `SettingsView.tsx`. Both critical axe findings (`select-name`, `label`) cleared.

## Gap Analysis v2 — 2026-07-13 ~15:00 (owner-requested; suite at 58 spec files / 71 tests, inventory 141 controls)

### Closed since the v1 review (verified by passing specs)
CG-1 (STT mock), CG-3 (audio states), CG-4/CG-13 partially (quiz flow + progression write specs exist, 2 still red), CG-5 (coach actions), CG-7 (onboarding variants user/31 + consent guard user/32), **CG-8 (PWA SW registration — user/33)**, CG-10 (daily session spec exists, red on PF-5), CG-11 partial (scripted simulator user/29), CG-12 (response speed), CG-14 (unlock submit), CG-15 (voice limit), CG-16 read-path, **CG-17 (mobile viewport — user/28 smoke)**. Admin queue actions + requests-visibility + content-studio load/publish-guard all covered.

### GA-1 · PRODUCT — offline write-queue covers ONLY mastery_items (mirrors PF-10)
The §10 design promise ("offline write queue syncs on reconnect") is implemented solely for mastery grades. Verified zero `enqueue` usage in: missions server writes (`missionsStore.ts` — has a device-local fallback but never syncs it), simulator completions (`progress.ts`), pronunciation attempts (`attempts.ts`), quiz `completed_lessons` (PF-7), and profile prefs (`scheduleProfileWrite` direct). Offline, these are lost with only a log. **Biggest remaining logical gap — product work, then one e2e per write path.**

### GA-2 · Logical gaps (no spec exercises these behaviors)
- **Error-surface contract:** builder added `tests/e2e/user/37-tutor-error-ref-toast.spec.ts` to inject a tutor edge failure and assert the calm toast WITH `Ref`. Status: **pending live runner execution**; the broader contract still needs at least one non-tutor surface.
- **RLS negative via UI:** admin/01 covers UI gating; no spec proves user A cannot see user B's data through any UI surface (probes did it manually).
- **Session expiry / re-auth:** token expires mid-session → expected recovery flow never exercised.
- **Voice-usage increment accuracy:** user/27 covers the blocked state; the counting path (A5 counter-concurrency concern) unverified.
- **Streak/XP mechanics:** streak-freeze effect (useHome) and any XP change have zero coverage (note: quizzes award no XP — PF-9).
- **Pack refresh on reconnect:** contentRepository.refresh after a drain (§10 versioning) unasserted.
- **PWA UPDATE cycle:** user/33 covers registration; new-SW-waiting → refresh behavior (the owner's "hard refresh" pain) uncovered.
- **Accessibility pass:** roles are used implicitly everywhere, but no axe-core smoke or keyboard-only journey exists.

### GA-3 · User-flow (journey) gaps — each is a chain of existing covered fragments
- **Support round-trip as ONE journey:** builder added `tests/e2e/user/34-support-ticket-roundtrip.spec.ts`. Status: **pending live runner execution**.
- **Video suggestion lifecycle:** builder added `tests/e2e/user/35-video-suggestion-roundtrip.spec.ts`. Status: **pending live runner execution**.
- **Path switching journey:** builder added `tests/e2e/user/36-path-switch-home-cta.spec.ts`. Status: **pending live runner execution**.
- **Coach feedback LOOP closure:** grade weak item → Focus suggestion updates/disappears — only the one-shot render/route is covered.
- **Admin content lifecycle:** draft→validate→publish→learner sees new content. Publish intentionally unexercised (CG-6 decision still open: scratch pack vs out-of-scope).
- **AI free-form paths:** tutor chat round-trip reply rendering and simulator FREE (non-scripted) conversation — need a Gemini edge mock or tolerance-based asserts; only deterministic halves covered.
- **Multi-day journeys** (streak day-2, SRS next-day due): blocked on clock control — document as wont-cover-live, candidate for unit/integration with fake timers instead.

### Recommended priority (Lane A unless marked)
1. GA-1 product work (Lane B/product) — then per-table offline e2e.
2. Runner validation of `user/34..37` plus the updated touch-claim specs (`user/08`, `user/10`, `user/14`, `user/17`, `admin/05`).
3. Finish inventory migration (remaining 46 legacy claims) and eliminate the last rendered-only control (`tutor.model.listen`).
4. PWA update-cycle spec. 5. axe smoke. 6. CG-6 publish decision (owner).

## Bucket 2 — COVERAGE GAPS (not yet exercised)

> Reviewed 2026-07-13 ~08:15 against the CURRENT tree (spec set grew to **51 tests / 41 files** while the test agent works — items marked "in progress by test agent" have new specs whose first live execution is pending). App interactive surface for scale: ~235 button JSX sites + ~40 input/textarea/select sites across 49 components; inventory = 99 controls.

- **CG-1 · Speaking/pronunciation STT path** — `10-speaking-stt.spec.ts` intentionally skipped (needs mocked STT; TEST-VERTICAL-SLICES G6). Also uncovered for the same reason: `RecordCompare` mic flows and Simulator dictation. Owner: harness. Status: **closed run 2** — `support/mockSpeechRecognition.ts` landed; 10-speaking-stt + user/26 response-speed run and PASS.
- **CG-2 · Feedback forms — TYPE-and-submit regression class (LT1/LT2/LT5)** — user/04 types + asserts rows persist ✅ for correction/suggest-video/request-theme. Vocab-lookup TYPING still blocked by EF-5's selector fix. Status: vocab-lookup typing still blocked, now by EF-16 (helper flow), not the selector.
- **CG-3 · Audio playback state** — still no spec asserts a phrase-audio icon transitions idle→loading→playing (LT3 surface). Status: **closed run 2** — user/22-audio-state-surfaces passes (Listen→Playing toggle + Hear-it pulse asserted).
- **CG-4 · Quiz full flow** — `user/21-quiz-full-flow.spec.ts` now exists (answering, progression, scoring toast, close). Status: spec exists; failing on EF-23 (overlay-scoped clicks). Product flow unproven until it passes.
- **CG-5 · Coach Focus card actions** — `user/20-home-coach-focus-actions.spec.ts` now exists (seeded due review → suggestion → why-panel → Practice routing). Status: spec exists; why-panel + suggestion pass, routing assert failing (EF-22 — may be a real app gap).
- **CG-6 · Admin content studio deep flows** — admin/04 + new admin/06 (load existing). Publish/checksum-reconcile still unexercised (arguably right — publish mutates the live pack; if covered, needs a scratch pack + cleanup). Status: open (needs a decision: cover with scratch pack, or declare out-of-e2e-scope and note it).
- **CG-7 · Onboarding variants** — user/12 covers the goal-path happy flow ✅ (passed run 1); user/17/18 add auth-mode transitions + consent links. Builder has now added `tests/e2e/user/31-onboarding-path-variants.spec.ts` for the remaining Structured-course and Just-start-talking choice flows, with durable `paths:selection.type` assertions plus touch-evidence for the new controls. Still uncovered: declining consent and reload-mid-onboarding resume. Status: mostly closed; rerun pending.
- **CG-8 · PWA/service-worker reload behavior** — all specs unregister the SW by design, so the "stale SW serves old bundle after deploy" class (owner hit this live) has zero coverage. Suggest ONE dedicated spec that does NOT unregister the SW: load, assert SW controls the page, reload, assert fresh content. Status: open.
- **CG-9 · iOS Capacitor shell** — out of e2e scope (manual/Xcode). Status: wont-fix here; tracked in REQUIREMENTS-TRACKER cross-platform section.
- **CG-10 · Daily Session loop (NEW)** — `DailySessionView` (6 interactive sites) + `useDailySession` + `SessionRecap`: ZERO spec references, yet it's the adaptive-guided path's core loop, wired from Home's pathNextAction (App.tsx mount). Highest-value uncovered surface in the app. Status: spec user/24 now reaches the session shell after the IndexedDB read fix; rerun pending on EF-25's heading scoping before closure can be claimed.
- **CG-11 · Situation Simulator ONLINE conversation (NEW)** — only the offline panel (EF-1, currently broken) and tile render are attempted. The actual roleplay (pick difficulty → converse via options/text → hint toggle → end/replay) — 14 interactive sites — is untested. AI replies make it nondeterministic; the deterministic parts (difficulty pick renders nodes, hint toggles, end/replay controls) can still be asserted. Status: spec added — `tests/e2e/user/29-practice-simulator-scripted.spec.ts` now covers deterministic scripted L1 and L3 branches plus `user_situation_progress` DB evidence; first live runner execution still pending.
- **CG-12 · Speaking Response-Speed drill** — Status: **closed run 2** — user/26 passes with the STT mock.
- **CG-13 · Progression/gamification writes (NEW)** — nothing asserts streak increments, XP awards, or `completed_lessons` writes after finishing a lesson/quiz ("Mark Complete"/completion CTA unexercised; grep finds no spec touching streak/XP). This is the retention loop — a silent write failure here would be invisible to the suite. Status: spec user/25 now drives the pass path using pack-sourced answers and polls `profiles.completed_lessons`; first live rerun still pending before closure.
- **CG-14 · Level-unlock key submit (NEW)** — user/01 opens the unlock modal; no spec SUBMITS the key and asserts `unlocked_level` increments (M1 in the deferred list — server-side decision pending; the e2e would pin current behavior). Status: **closed run 2** — user/24-unlock-level-submit passes (unlocked_level increments).
- **CG-15 · Voice-limit enforcement (NEW)** — no spec exercises the daily voice-usage limit path (voice_usage_today increment, limit-hit UX in tutor). Status: **closed run 2** — user/27-tutor-voice-limit passes (blocked with clear toast at limit).
- **CG-16 · Offline WRITE queue (NEW)** — user/19 covers offline pattern-drill (read path). The sync-queue (queue writes offline → reconcile on reconnect, last-write-wins) has no e2e; it also has no unit tests (deferred item). One e2e: go offline (via `page.context().setOffline` — EF-1 fix prerequisite), perform a queued write (e.g. complete a drill), go online, assert the row lands. Status: spec added — `tests/e2e/user/30-offline-mastery-queue.spec.ts` now grades a vocabulary item offline, proves no DB row exists yet, reloads offline, then reconnects and polls `mastery_items`; first live runner execution still pending.
- **CG-17 · Mobile viewport layout (NEW)** — config pins 1280×900 desktop (sidebar nav); the mobile bottom-bar layout — the PRIMARY form factor for this product — is never rendered in any spec. Suggest a small `@mobile` project (`devices['iPhone 14']`) running the smoke set. Status: **closed run 16** — batch a7089e2 added the mobile-viewport project; user/28-mobile-home-profile-smoke runs it and passes.
- **CG-18 · Audio PLAYBACK triggers — per-site TTS "Play" buttons (NEW, owner-asked 2026-07-13)** — audio coverage today is by STATE and by ONE playback path, not per control:
  - **Covered:** audio-state transitions Listen→Playing→back + "Hear it" pulse (user/22, outcome-asserted, TTS stubbed with silent PCM); Quiz "Play audio" asserts a real `action:'tts'` request to the gemini edge (user/25); tutor mute/unmute audio toggle (user/08); listening-mode speed/reveal/dictation (listening specs); Audio-Speed slider persists (user/09); Save-audio-on-device switch + Clear-cache (settings specs).
  - **NOT covered (gap):** the discrete per-site **"Play pronunciation"** buttons in `VocabLookupModal`, `LessonDetailModal`, `PhraseLibraryView` (0 specs), **"Play line"** in `ListeningView` (0 specs), and **"Play the word"** in `RepeatAfterMe` (referenced in 1 spec but not asserted-to-fire). None of these 5 sites are in `control-inventory.json` by name, so the coverage gate does not flag them — they are invisible orphans (the CS "gate can't see uninventoried controls" limitation, made concrete). No spec asserts these buttons issue a TTS request or drive the audio element.
  - **Suggested fix (Lane A):** add the 5 play-triggers to the inventory; add one deterministic assertion per site using the existing `page.route('**/functions/v1/gemini')` TTS-capture pattern (from user/25) or the silent-PCM stub (user/22) — click → assert `action:'tts'` request with the expected text. Cheap now that both patterns exist. Status: **open**.
- **CG-19 · Tabs / primary navigation (NEW, owner-asked 2026-07-13)** — the 6 primary nav destinations (Home/Learning/Practice/Tutor/Profile + Admin) are `activeTab`-state buttons on BOTH the mobile bottom-bar and desktop Sidebar; **all 6 are exercised** (7–24 clicks each across specs, outcome-asserted via destination-heading checks), and the two admin sub-tabs (Review Queues / Content Studio) are both covered (admin/03–08). Practice-hub mode routing (`activeMode`) covered (user/07/08). **Coverage of tab NAVIGATION is comprehensive.** One a11y gap (not a functional gap): tabs are plain buttons with no `role="tab"`/`role="tablist"`/`aria-selected` (grep: 0 ARIA tab roles) — a screen-reader user gets no tab semantics. Fold into the a11y remediation (PF-11/PF-12 family). Status: functional **closed**; a11y-semantics **open** (design/app).

## Coverage-SYSTEM improvements (how the gate itself must get stronger)

> **Formalized globally (2026-07-13):** this methodology is now the cross-repo skill **`test-coverage-governance`** (`~/.claude/skills/test-coverage-governance/SKILL.md`, Codex mirror included; ai-dev-dotfiles commit `80bfef3`). The CS items below are this repo's instance of that skill's gate checks 1–4 + process rules — test agent: read the skill for the full contract (inventory schema with `depth` field, defect-item schema, role rules) before implementing CS-1..4, so the implementation matches the generic shape. Playwright-specific pitfalls behind EF-1/2/5/6/8/9/11 are now documented in `~/.ai-dev-dotfiles/repo-specs/testing/playwright/CLAUDE.md` § Known Pitfalls.

- **CS-1 · The gate cannot see uninventoried controls (structural).** `check-interactive-coverage.mjs` fails only when an INVENTORIED control lacks a spec; controls absent from the hand-maintained inventory are invisible — the gate can be green with most of the app uncovered (evidence: 99 inventoried vs ~235 button sites). Suggest an inventory-drift check: a runtime crawl step (after landOnHome, walk each nav tab/modal and collect visible `role=button/textbox/...` accessible names via `page.getByRole(...)`… or `aria-snapshot`), diff against the inventory, and fail on unknown controls. A static JSX scan is a weaker but cheaper alternative. This single change converts the gate from "claims are consistent" to "coverage is complete". Owner: test agent. **Status: in progress** — builder added `scripts/crawl-interactive-controls.mjs`, a runner-executable crawl scaffold that snapshots visible controls across the major user/admin surfaces into `artifacts/control-crawl-*.json`, plus `scripts/check-control-crawl-drift.mjs` to diff a crawl artifact against inventory needles. Runner still needs to execute the crawl against a live preview and decide how hard to gate unknown controls. HIGH confidence.
- **CS-2 · `covered_by` is claim-based, never verified.** Nothing checks the claiming spec actually TOUCHES the control (only that the file exists). Cheap first step: checker greps the claiming spec for the control's selector name and warns on miss. Full fix: a `touch(controlId)` helper specs call at interaction points, emitting a run artifact the checker cross-references. Owner: test agent. **Status: fixed-pending-rerun (touch seam landed)** — `scripts/check-interactive-coverage.mjs` still does the structured-selector grep, and builder has now added the first real touch-evidence seam: `tests/e2e/support/controlCoverage.ts` + the shared fixture recorder in `tests/e2e/support/fixtures.ts` emit per-test `artifacts/control-touches/*.json`, and the checker now rejects unknown touched ids and compares observed touch depth against the claimed depth whenever a migrated spec emits evidence. The migrated set expanded again in this batch (`user/22` audio-state controls and `user/31` onboarding path variants); checker output is now **135** mapped controls with **66** legacy claims remaining (down from 69). Runner now needs to exercise the migrated specs so the artifact-backed verification path gets live confirmation.
- **CS-3 · Interaction depth is not tracked — and T-COV2 (AUDIT-FIX-TRACKER) explicitly requires OUTCOME assertions, not presence.** Run-1 evidence that presence-level coverage masks real breakage: tutor switching was "covered" and green as a render assert while 100% broken in prod (EF-10). Suggest adding `depth: rendered | clicked | value-changed | outcome-asserted` per inventory control; gate warns on `rendered`-only. Owner: test agent. HIGH confidence.
- **CS-4 · Ambiguous inventory selectors.** The two onboarding consent checkboxes share the identical `input[type="checkbox"]` css selector — indistinguishable entries. Selectors in the inventory should uniquely identify the control (accessible name or a stable test id). Owner: test agent. HIGH confidence.
- **CS-5 · e2e is not in the ship gate.** `scripts/preflight.sh` contains no playwright step, so a deploy can ship with the suite red (it was 12/38 red at v1.0.0+). Suggest: preflight runs at least `npx playwright test --grep @smoke` when the environment can bind ports (skip-with-loud-warning otherwise), and the `@smoke` set gets curated to the always-green core. Owner: runner/product session (script) — needs owner sign-off since it lengthens deploys. HIGH confidence.
- **CS-6 · One suite runner at a time (formalize E-1).** Concurrent runs share live DB + `.auth/` files and cross-contaminate (observed: global-setup re-ran mid-triage and swapped the throwaway user under my probes). Suggest: runner reserves a `queuectl` token named "e2e-suite-run" for the duration; both agents honor it. Owner: both agents + operator convention. HIGH confidence.
- **CS-7 · Reproducibility protocol.** Local `retries: 0` + live backend means occasional network flakes will file false defects. Convention: before filing an EF item, re-run the single failing spec once (`npx playwright test <file> --repeat-each=2` for suspicion of flake); record "deterministic" vs "flaky (1/3)" in the reproducibility field. Owner: runner (adopted as of this review). MEDIUM confidence — revisit when flakes actually appear (run 1 had zero).
- **CS-8 · Seed/teardown hygiene for queue specs.** admin/03/05 seed pending rows with nonce text but (as read) don't delete them; the live review queues accumulate `Admin queue …` junk across runs, and the owner's real admin view shows test garbage. Suggest afterEach cleanup via evidence clients (delete by nonce), or a dedicated tag prefix + periodic sweep script. Owner: test agent. **Status: fixed-pending-rerun** — builder added finally-block cleanup deletes to `tests/e2e/admin/03-admin-review-queues.spec.ts` and `tests/e2e/admin/05-admin-queue-actions.spec.ts`; runner should confirm the seeded rows no longer remain after execution. HIGH confidence.

## Coverage-governance program — "true 100%" closure plan

> Added 2026-07-13 so the test-building agent and the live runner work against the same definition of completion. This section is the anti-drift program, not a one-off spec list.

### Definition of done

- `100%` means every user-visible page, modal, tab, route, screen, and stateful surface is rendered at least once.
- Every interactive control must be exercised at a declared depth: `rendered` · `clicked` · `value-changed` · `outcome-asserted`.
- Critical controls are not done at `rendered`; they must end at `outcome-asserted`.
- Every DB-backed workflow must prove its outcome with a readback path when one exists (`profiles`, `mastery_items`, `user_situation_progress`, queue tables, etc.).
- Audio/voice surfaces are done only when the seam we actually control is asserted: STT mock, audio-state UI, TTS success/failure handling, voice-limit handling.
- Coverage must include both desktop and mobile primary layouts.
- New interactive controls must fail the gate if they are not inventoried or not touched by a claiming spec.

### Program phases

1. **Harden the gate itself first**
   - Implement CS-1 inventory-drift detection against the running app.
   - Implement CS-2 touch verification so a spec cannot claim a control it never exercises.
   - Finish migrating `covered_by` from legacy strings to `{ spec, depth }`.
   - Escalate `rendered`-only claims from soft warning to fail/warn-by-tier once critical domains are migrated.

2. **Close product domains systematically**
   - Domains: auth/onboarding, home/progression, learning, practice hub, each practice engine, tutor, settings, admin, offline/PWA, account lifecycle, mobile layout.
   - Each domain is only closed when all known controls are inventoried, each control has a spec, and each critical path has outcome evidence.

3. **Promote high-risk flows from surface checks to evidence checks**
   - Priority order: simulator, daily session/progression, offline write queue, speaking capability fallbacks, admin deep flows, PWA/service-worker drift, mobile sweep.

4. **Add environment variants deliberately**
   - Desktop.
   - Mobile viewport.
   - Offline / reconnect.
   - STT available / unavailable.
   - Recording supported / unsupported.
   - Voice-limit exhausted.
   - Admin and regular user.

5. **Enforce in the ship gate in layers**
   - Keep `npm run test:e2e:coverage` in preflight.
   - Add curated Playwright `@smoke` only when the runner confirms it is stable enough to gate deploys.
   - Full regression remains the live runner's job outside the sandbox.

### Domain closure checklist

- `render`: every page/modal/screen/state in the domain is reachable and asserted.
- `controls`: every button/field/link/toggle/input in the domain is inventoried.
- `depth`: every control has a declared depth; critical controls end at `outcome-asserted`.
- `evidence`: DB/API/state readback exists for each persistence-bearing workflow.
- `desktop`: domain passes in the desktop layout.
- `mobile`: domain passes in the mobile layout if the domain is user-facing.
- `degraded`: offline/capability-limit behavior is covered when relevant.

### Current highest-priority remaining gaps after the latest buildout

- **Simulator core loop** — still the largest uncovered real product surface; close scripted deterministic flow first, then free-roleplay seam coverage.
- **Coverage-system truthfulness** — CS-1 and CS-2 remain the main structural blockers to trusting green status.
- **Offline write queue** — read-path coverage exists; queued-write reconcile path still open.
- **Daily session progression evidence** — entry/recap UI exists, but the strongest write/readback proof still needs expansion.
- **Admin deep flows + cleanup hygiene** — selector anchoring and seeded-row cleanup remain open.
- **PWA/service-worker reload behavior** — still untested.

### Working rule for both agents

- Do not call a domain `closed` because a spec file exists.
- A domain closes only when the runner has executed it live, the tracker has no open EF/CG items for that surface, and the inventory/gate reflects the real control set.

### Active lane split

#### Lane A — Builder lane (Codex test-building agent)

- Owns spec authoring, spec refactors, helpers, inventory, selectors, harness fixes, and coverage-gate implementation.
- Current priorities:
  - CS-1 inventory-drift detection.
  - CS-2 control-touch verification.
  - migrate legacy `covered_by` strings to structured `{ spec, depth }`.
  - convert the final rendered-only control (`tutor.model.listen`) into an outcome/asserted interaction.
  - close CG-11 simulator core loop.
  - close CG-16 offline write queue reconcile path.
  - close CS-8 seed/teardown hygiene for admin queue specs.
- Must not mark product surfaces closed without live runner verification.

#### Lane B — Runner lane (live execution / unsandboxed validation)

- Owns all live Playwright execution, reruns, DB/product verification requiring unsandboxed access, and tracker truth.
- Immediate worklist:
  - rerun the current suite or targeted failed specs for EF-13…EF-24.
  - update each item with `verified`, `reopened`, or narrowed owner (`selector` / `harness` / `data` / `app` / `environment`).
  - confirm whether EF-22 is a real app bug or a wrong test expectation.
  - keep run artifacts and reproducibility notes current.
  - confirm newly-added specs (user/24…28) against live behavior after each builder batch.
- Should not edit `tests/e2e/**` unless explicitly taking over a builder-owned fix.

#### Lane C — Subagent discovery lane (parallel read-only support)

- Owns bounded discovery/mapping tasks with no shared writes unless explicitly assigned a disjoint slice.
- Best uses:
  - map simulator deterministic selectors + evidence paths.
  - map offline write queue persistence path and readback seam.
  - map PWA/service-worker reload testability.
  - map admin queue cleanup strategy + stable card anchors.
  - map remaining mobile-only controls not yet inventoried.
- Output should be implementation briefs, not tracker truth changes.

### Handoff protocol between lanes

- Builder finishes a batch and names the affected specs/helpers/inventory entries.
- Runner executes live, records EF/CG/CS outcomes, and feeds failures back through this tracker.
- Subagents support whichever next batch is not on the immediate critical path.
- No lane should infer closure from code alone; only the runner can confirm closure status here.

## Environment / process notes

- **E-1 · Two agents ran the suite concurrently** — during triage, `tests/e2e/.auth/*.json` was regenerated by another process (new throwaway user; a probe mid-analysis briefly chased the wrong user). Shared live DB + shared `.auth/` files make concurrent runs cross-contaminating. **Rule proposal: one suite runner at a time**; the test agent should signal runs (or the runner claims a queue token for "suite execution").
- **E-2 · test-results/ is ephemeral** — every run overwrites it. The runner snapshots failing runs under `artifacts/e2e-run-<stamp>/` (tgz). Reference those in items, not live test-results paths.
- **E-3 · Suite runtime** — 3.8 min for 38 tests (serial, live backend). Fine for now; revisit sharding only if the suite triples.
