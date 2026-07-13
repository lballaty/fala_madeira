# E2E Live-Run Findings Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/E2E-LIVE-RUN-TRACKER.md
**Description:** Live defect queue from executing the Playwright e2e suite (T-COV mandate, commit 662541b). The test-building agent authors specs but cannot bind ports in its sandbox; the runner session executes the suite (local `vite preview` + LIVE Supabase) and records every discrete failure here. Two buckets: EXECUTION FAILURES (tests that exist but fail) and COVERAGE GAPS (surfaces/flows not yet exercised). Owners — **app** (product code, runner/product session fixes, mirrored to REQUIREMENTS-TRACKER), **harness** (fixtures/setup/technique), **selector** (locator defects), **data** (seed/state assumptions), **environment** (runner env / concurrency noise). Harness/selector/data items belong to the test-building agent.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-13
**Last Updated:** 2026-07-13
**Last Updated By:** e2e runner session

## How to use this file

- **Test-building agent:** items with owner harness/selector/data are your worklist. When you change a spec, set the item to `fixed-pending-rerun` with a one-line note; the runner re-executes and flips to `verified` or reopens.
- **Runner session:** append a run section per execution; update item statuses; never edit specs (`tests/e2e/` is the test agent's scope).
- **Statuses:** `open` · `fixed-pending-rerun` · `verified` · `wont-fix` (with reason).
- Writes to this file are coordinated via the global queue (`queuectl reserve`).

## Run log

### Run 2026-07-13 07:35 CEST — full suite, local preview (127.0.0.1:4173) + live Supabase
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
- **Status:** open

### EF-2 · Global Voice Limit panel — locator resolves to the whole page
- **Spec:** `tests/e2e/admin/02-admin-global-settings.spec.ts:21`
- **Test:** admin global settings › Global Voice Limit writes to global_settings and can be restored
- **Failure type:** poll mismatch — expected 5 (DB initial), extracted 30
- **Reproducibility:** deterministic
- **Likely owner:** **selector** — `adminPage.locator('div').filter({ hasText: 'Global Voice Limit' }).first()` matches the OUTERMOST ancestor div (whole page), so `extractFirstInteger(panel.textContent())` grabs the first integer anywhere on the page (30 = likely admin's personal `profiles.voice_limit` display), not the global control. Runner verified live `global_settings.voice_limit` = "5" (updated_at 2026-07-10 — untouched, so the app did NOT clobber it).
- **Suggested fix (test agent):** anchor on the control itself, e.g. `getByText('Global Voice Limit').locator('xpath=ancestor::div[1]')` or a tight `.filter({ has: … })` on the innermost card; or read the value node directly.
- **Related product finding:** PF-3 below (mount-time write-back race in the same control — separate item, did not fire this run).
- **Artifacts:** `admin-02-admin-global-sett-90145-…/`
- **Status:** open

### EF-3 · Admin Review Queues never shows users' lesson requests — live RLS gap
- **Spec:** `tests/e2e/admin/03-admin-review-queues.spec.ts:11`
- **Test:** admin review queues › admin can read seeded pending items and resolve queue actions
- **Failure type:** assertion timeout — seeded request theme not visible (correction WAS visible)
- **Reproducibility:** deterministic
- **Likely owner:** **app** (live DB schema/RLS) — **REAL PRODUCT BUG.** The test is correct.
- **Evidence (runner, pg-direct + REST):** seeded row EXISTS in `lesson_requests` (RLS-bypassed count = 1). Live SELECT policy is `auth.uid() = user_id` with **no `OR is_admin()`** — unlike `lesson_corrections` (`… OR is_admin()`), `tickets` (has it), `video_suggestions` (has it). Admin REST probe: 0 rows from `lesson_requests`, 1 row from `lesson_corrections`. So the Requests queue in Admin Review is permanently empty for other users' rows in production.
- **Fix (runner/product session):** migration 00009 — recreate the `lesson_requests` SELECT policy as `((auth.uid() = user_id) OR is_admin())`; log in `supabase/migrations/APPLIED.md`. Test should pass unchanged afterward (later assertions on tickets/videos already have working policies).
- **Artifacts:** `admin-03-admin-review-queu-777b3-…/`
- **Status:** open (product fix owned by runner session)

### EF-4 · Home "Continue Learning" — button is named by the lesson title, not the heading
- **Spec:** `tests/e2e/user/01-home-navigation.spec.ts:11`
- **Test:** home navigation surfaces › Home opens settings, unlock modal, and Continue Learning routes into a lesson detail
- **Failure type:** click timeout — `getByRole('button', { name: /Continue Learning/i })` not found
- **Reproducibility:** deterministic
- **Likely owner:** **selector** — "Continue Learning" is a sibling `h2` (`HomeView.tsx:304`); the actual card IS a `<button>` but its accessible name is the lesson title + "Month N • category". Optional app improvement: add `aria-label="Continue Learning: {title}"` to the card button, but the selector fix is sufficient.
- **Suggested fix (test agent):** locate the card via the section, e.g. `page.getByRole('heading', { name: 'Continue Learning' })` then the adjacent button, or `getByRole('button', { name: /Month \d/ }).first()`.
- **Artifacts:** `user-01-home-navigation-ho-d3659-…/`
- **Status:** open

### EF-5 · Lesson-detail modals — `Close` strict-mode violation (parent + child dialogs)
- **Spec:** `tests/e2e/user/03-learning-detail-surfaces.spec.ts:11` (line 24)
- **Test:** learning detail surfaces › Vocabulary Lookup and Start Practice Quiz open their real modal surfaces
- **Failure type:** strict-mode violation — `getByRole('button', { name: 'Close' })` resolves to 2 (Lesson Details dialog + Vocabulary Lookup dialog)
- **Reproducibility:** deterministic
- **Likely owner:** **selector**
- **Suggested fix (test agent):** scope to the child: `page.getByRole('dialog', { name: 'Vocabulary Lookup' }).getByLabel('Close')`. (Positive signal: both dialogs render with proper roles/names — the focus-trap stack works.)
- **Artifacts:** `user-03-learning-detail-su-08a1c-…/`
- **Status:** open

### EF-6 · Practice browse — `Culture` matches 6 buttons
- **Spec:** `tests/e2e/user/05-practice-browse-and-quiz.spec.ts:11` (line 24)
- **Test:** practice browse and quiz entry › Browse situations expands a real situation and routes into Culture mode
- **Failure type:** strict-mode violation — mode chip + 5 situation titles containing "Culture"
- **Reproducibility:** deterministic (content-dependent: pack situations contain the word)
- **Likely owner:** **selector**
- **Suggested fix (test agent):** `getByRole('button', { name: 'Culture', exact: true })` (element #1 in the violation list is exactly that).
- **Artifacts:** `user-05-practice-browse-an-e03a7-…/`
- **Status:** open

### EF-7 · Practice mode routing — sidebar "Practice" does not close an active mode
- **Spec:** `tests/e2e/user/07-practice-mode-routing.spec.ts:11` (line 20)
- **Test:** practice mode routing › Vocabulary Review, Phrase Library, and Speaking open their real mode bodies
- **Failure type:** click timeout — `Phrase Library` tile never visible after finishing Vocabulary Review
- **Reproducibility:** deterministic
- **Likely owner:** **selector/data (navigation assumption)** — clicking the sidebar Practice nav only switches tabs; it does NOT reset the active mode route (documented in `08-offline.spec.ts:46-48`). The page was still inside Vocabulary Review, so the tile grid never rendered.
- **Suggested fix (test agent):** exit each mode via the mode-chrome back button (chevron-left) before opening the next tile — same pattern 08-offline uses.
- **Artifacts:** `user-07-practice-mode-rout-1b86d-…/`
- **Status:** open

### EF-8 · Tutor practice modal — "Type in Portuguese..." matches 2 inputs
- **Spec:** `tests/e2e/user/08-tutor-practice-modal-controls.spec.ts:11` (line 35)
- **Test:** tutor practice modal controls › Start Today's Lesson opens the tutor modal and local controls respond
- **Failure type:** strict-mode violation — main tutor chat input + modal dialog input share the placeholder
- **Reproducibility:** deterministic
- **Likely owner:** **selector**
- **Suggested fix (test agent):** scope to `getByRole('dialog', { name: /Tutor/ }).getByPlaceholder('Type in Portuguese...')` (the violation output shows the dialog is named "AI Maria Tutor" — consider `/Tutor/` since tutor name varies).
- **Artifacts:** `user-08-tutor-practice-mod-ff2c9-…/`
- **Status:** open

### EF-9 · Playback-speed slider — direct `input.value=` is swallowed by React
- **Spec:** `tests/e2e/user/09-settings-persistence.spec.ts:11` (line 26)
- **Test:** settings persistence › playback speed change persists to the profile row
- **Failure type:** assertion timeout — UI never shows "1.3x"
- **Reproducibility:** deterministic
- **Likely owner:** **harness (technique)** — the spec sets `input.value = '1.3'` then dispatches `input`/`change`. React's controlled-input value tracker dedupes direct value writes, so the state never changes (`SettingsView.tsx:241` renders `{playbackSpeed}x` from React state).
- **Suggested fix (test agent):** use the native setter trick inside `evaluate`: `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, '1.3')` then dispatch `input` (bubbles) — or drive the slider with keyboard (`slider.focus()` + ArrowRight presses), which is closer to real usage. Also verify `input[type="range"]` `.first()` is actually the playback slider.
- **Artifacts:** `user-09-settings-persisten-4b019-…/`
- **Status:** open

### EF-10 · Switch AI Tutor — `profiles.selected_tutor_id` column DOES NOT EXIST in live DB
- **Spec:** `tests/e2e/user/10-settings-readwrite.spec.ts:11` (line 34)
- **Test:** settings read/write coverage › Switch AI Tutor persists to profiles and can be restored
- **Failure type:** assertion timeout — "Choose Your Tutor" modal never closes after picking a tutor
- **Reproducibility:** deterministic
- **Likely owner:** **app** (live DB schema drift) — **REAL PRODUCT BUG, prod-affecting.** The test found it correctly.
- **Evidence (runner):** PATCH `profiles.selected_tutor_id` as the e2e user → `400 PGRST204 "Could not find the 'selected_tutor_id' column"`. Live `profiles` columns verified: no `selected_tutor_id`. App code writes it (`useSettings.ts:332`) and only closes the modal on success (`:338`) — so every tutor switch fails for every user, the error is logged but the modal just sticks open. This exactly matches the "modal seems stuck" class the owner saw in live testing.
- **Fix (runner/product session):** migration 00009 — `ALTER TABLE profiles ADD COLUMN selected_tutor_id text` (nullable; app defaults to Maria when null); log in APPLIED.md. Optional hardening: on update error show the Ref-carrying toast instead of a silent stuck modal.
- **Artifacts:** `user-10-settings-readwrite-29368-…/`
- **Status:** open (product fix owned by runner session)

### EF-11 · Terms of Service — `/Version/i` strict-mode violation
- **Spec:** `tests/e2e/user/11-settings-static-surfaces.spec.ts:10` (line 36)
- **Test:** settings static surfaces › User Manual, App Tutorial, and legal documents open and navigate
- **Failure type:** strict-mode violation — matches the version stamp AND body copy "We may update these terms. The version and date…"
- **Reproducibility:** deterministic
- **Likely owner:** **selector**
- **Suggested fix (test agent):** `getByText(/Version \d/)` or `.first()`.
- **Artifacts:** `user-11-settings-static-su-ce3f6-…/`
- **Status:** open

### EF-12 · Settings path control — "Learn by goal" is the ONBOARDING label, not Settings'
- **Spec:** `tests/e2e/user/14-settings-local-controls.spec.ts:11` (line 24)
- **Test:** settings local controls › theme, path type, and offline-audio controls respond and persist locally
- **Failure type:** click timeout — `button "Learn by goal"` not found on the Settings screen
- **Reproducibility:** deterministic
- **Likely owner:** **selector/data** — "Learn by goal" exists only in `OnboardingFlow.tsx:92`. The Settings path selector uses the path-policy names (comment at `SettingsView.tsx:193`: "Structured course / Goal track / Adaptive guided / Free"). Check the rendered button labels in SettingsView and target those.
- **Artifacts:** `user-14-settings-local-con-49ca6-…/`
- **Status:** open

---

## Product findings (mirrored to REQUIREMENTS-TRACKER; runner/product session owns)

- **PF-1 (= EF-10):** `profiles.selected_tutor_id` missing in live DB → tutor switching broken in production; silent stuck modal. Fix: migration + optional error toast.
- **PF-2 (= EF-3):** `lesson_requests` SELECT RLS lacks `OR is_admin()` → Admin Review "Requests" queue permanently empty for user submissions. Fix: policy migration.
- **PF-3 (latent, found during EF-2 triage):** `useSettings.ts:289-300` — the admin global-voice-limit write-back effect runs whenever `profile` loads; if it fires before the run-once `fetchGlobalSettings` resolves, an admin's mount can upsert the localStorage/default value (30) OVER the DB value (5), silently reconfiguring production. Did NOT fire this run (`global_settings.updated_at` still 2026-07-10) but the race is real. Fix: skip the write-back until the fetched value has been applied (dirty-flag), or write only on explicit +/- interaction.
- **PF-4 (a11y, minor, from EF-4):** the Continue Learning card button's accessible name is just the lesson title; consider `aria-label` including its function.

## Bucket 2 — COVERAGE GAPS (not yet exercised)

- **CG-1 · Speaking/pronunciation STT path** — `tests/e2e/10-speaking-stt.spec.ts` intentionally skipped (needs mocked STT; docs/TEST-VERTICAL-SLICES.md G6). Owner: harness (mock design).
- **CG-2 · Lesson-detail feedback forms typed via focus-trap fix** — user/04 passes (writes persist), but LT1/LT2/LT5 regression coverage should assert TYPING into each form (correction / suggest-video / vocab-lookup / quiz text fields) — the exact live-bug class from 2026-07-11.
- **CG-3 · Audio playback icons** — no spec asserts the phrase-audio icons produce a playing state (LT3 surface; assert loading→playing state transitions, not sound itself).
- **CG-4 · Quiz full flow** — answering (typing + selecting), scoring, and completion surface: not yet covered end-to-end.
- **CG-5 · Coach Focus card actions** — 06-coach asserts render only; acting on a suggestion (rankFocus → practice route) unexercised.
- **CG-6 · Admin content studio deep flows** — admin/04 covers select/draft/validate; publish + checksum reconcile flows unexercised.
- **CG-7 · Onboarding un-preseeded variants** — user/12 now covers the fresh signup happy path (PASSED ✅); declines/partial-consent branches and the "resume after reload mid-onboarding" case are not covered.
- **CG-8 · PWA/service-worker behavior** — all specs unregister the SW by design; no spec asserts SW-cached reload behavior (the "hard refresh needed after deploy" class).
- **CG-9 · iOS Capacitor shell** — out of e2e scope entirely (manual/Xcode).

## Environment / process notes

- **E-1 · Two agents ran the suite concurrently** — during triage, `tests/e2e/.auth/*.json` was regenerated by another process (new throwaway user; a probe mid-analysis briefly chased the wrong user). Shared live DB + shared `.auth/` files make concurrent runs cross-contaminating. **Rule proposal: one suite runner at a time**; the test agent should signal runs (or the runner claims a queue token for "suite execution").
- **E-2 · test-results/ is ephemeral** — every run overwrites it. The runner snapshots failing runs under `artifacts/e2e-run-<stamp>/` (tgz). Reference those in items, not live test-results paths.
- **E-3 · Suite runtime** — 3.8 min for 38 tests (serial, live backend). Fine for now; revisit sharding only if the suite triples.
