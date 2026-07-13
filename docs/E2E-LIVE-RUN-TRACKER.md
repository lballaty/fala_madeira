# E2E Live-Run Findings Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/E2E-LIVE-RUN-TRACKER.md
**Description:** Live defect queue from executing the Playwright e2e suite (T-COV mandate, commit 662541b). The test-building agent authors specs but cannot bind ports in its sandbox; the runner session executes the suite (local `vite preview` + LIVE Supabase) and records every discrete failure here. Two buckets: EXECUTION FAILURES (tests that exist but fail) and COVERAGE GAPS (surfaces/flows not yet exercised). Owners — **app** (product code, runner/product session fixes, mirrored to REQUIREMENTS-TRACKER), **harness** (fixtures/setup/technique), **selector** (locator defects), **data** (seed/state assumptions), **environment** (runner env / concurrency noise). Harness/selector/data items belong to the test-building agent.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-13
**Last Updated:** 2026-07-13 (coverage review: Bucket 2 expanded CG-10…17, new CS-1…8 coverage-system section)
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

> Reviewed 2026-07-13 ~08:15 against the CURRENT tree (spec set grew to **51 tests / 41 files** while the test agent works — items marked "in progress by test agent" have new specs whose first live execution is pending). App interactive surface for scale: ~235 button JSX sites + ~40 input/textarea/select sites across 49 components; inventory = 99 controls.

- **CG-1 · Speaking/pronunciation STT path** — `10-speaking-stt.spec.ts` intentionally skipped (needs mocked STT; TEST-VERTICAL-SLICES G6). Also uncovered for the same reason: `RecordCompare` mic flows and Simulator dictation. Owner: harness (mock design — suggest a `page.addInitScript` stub of `platform.speech.recognize` returning a canned transcript; the platform seam exists precisely for this). Status: open.
- **CG-2 · Feedback forms — TYPE-and-submit regression class (LT1/LT2/LT5)** — user/04 types + asserts rows persist ✅ for correction/suggest-video/request-theme. Vocab-lookup TYPING still blocked by EF-5's selector fix. Status: mostly closed; verify after EF-5.
- **CG-3 · Audio playback state** — still no spec asserts a phrase-audio icon transitions idle→loading→playing (LT3 surface). Suggest asserting a `data-state`/aria attr or the spinner element once the LT3 spinner lands (coordinate: product adds the state attr, spec asserts it). Status: open.
- **CG-4 · Quiz full flow** — `user/21-quiz-full-flow.spec.ts` now exists (answering, progression, scoring toast, close). Status: in progress by test agent — pending first live run.
- **CG-5 · Coach Focus card actions** — `user/20-home-coach-focus-actions.spec.ts` now exists (seeded due review → suggestion → why-panel → Practice routing). Status: in progress by test agent — pending first live run.
- **CG-6 · Admin content studio deep flows** — admin/04 + new admin/06 (load existing). Publish/checksum-reconcile still unexercised (arguably right — publish mutates the live pack; if covered, needs a scratch pack + cleanup). Status: open (needs a decision: cover with scratch pack, or declare out-of-e2e-scope and note it).
- **CG-7 · Onboarding variants** — user/12 covers the goal-path happy flow ✅ (passed run 1); user/17/18 add auth-mode transitions + consent links. Still uncovered: Structured-course and Just-start-talking path choices, declining consent, reload-mid-onboarding resume. Status: partially closed.
- **CG-8 · PWA/service-worker reload behavior** — all specs unregister the SW by design, so the "stale SW serves old bundle after deploy" class (owner hit this live) has zero coverage. Suggest ONE dedicated spec that does NOT unregister the SW: load, assert SW controls the page, reload, assert fresh content. Status: open.
- **CG-9 · iOS Capacitor shell** — out of e2e scope (manual/Xcode). Status: wont-fix here; tracked in REQUIREMENTS-TRACKER cross-platform section.
- **CG-10 · Daily Session loop (NEW)** — `DailySessionView` (6 interactive sites) + `useDailySession` + `SessionRecap`: ZERO spec references, yet it's the adaptive-guided path's core loop, wired from Home's pathNextAction (App.tsx mount). Highest-value uncovered surface in the app. Status: open.
- **CG-11 · Situation Simulator ONLINE conversation (NEW)** — only the offline panel (EF-1, currently broken) and tile render are attempted. The actual roleplay (pick difficulty → converse via options/text → hint toggle → end/replay) — 14 interactive sites — is untested. AI replies make it nondeterministic; the deterministic parts (difficulty pick renders nodes, hint toggles, end/replay controls) can still be asserted. Status: open.
- **CG-12 · Speaking Response-Speed drill (NEW)** — `ResponseSpeed.tsx`: zero references (user/08 covers repeat + shadowing only). Status: open.
- **CG-13 · Progression/gamification writes (NEW)** — nothing asserts streak increments, XP awards, or `completed_lessons` writes after finishing a lesson/quiz ("Mark Complete"/completion CTA unexercised; grep finds no spec touching streak/XP). This is the retention loop — a silent write failure here would be invisible to the suite. Suggest: complete one lesson end-to-end, then assert the profiles row deltas (xp, completed_lessons, streak/last_active) via evidence client. Status: open.
- **CG-14 · Level-unlock key submit (NEW)** — user/01 opens the unlock modal; no spec SUBMITS the key and asserts `unlocked_level` increments (M1 in the deferred list — server-side decision pending; the e2e would pin current behavior). Status: open.
- **CG-15 · Voice-limit enforcement (NEW)** — no spec exercises the daily voice-usage limit path (voice_usage_today increment, limit-hit UX in tutor). Needs a seeded near-limit profile. Status: open.
- **CG-16 · Offline WRITE queue (NEW)** — user/19 covers offline pattern-drill (read path). The sync-queue (queue writes offline → reconcile on reconnect, last-write-wins) has no e2e; it also has no unit tests (deferred item). One e2e: go offline (via `page.context().setOffline` — EF-1 fix prerequisite), perform a queued write (e.g. complete a drill), go online, assert the row lands. Status: open (blocked by EF-1 fix).
- **CG-17 · Mobile viewport layout (NEW)** — config pins 1280×900 desktop (sidebar nav); the mobile bottom-bar layout — the PRIMARY form factor for this product — is never rendered in any spec. Suggest a small `@mobile` project (`devices['iPhone 14']`) running the smoke set. Status: open.

## Coverage-SYSTEM improvements (how the gate itself must get stronger)

- **CS-1 · The gate cannot see uninventoried controls (structural).** `check-interactive-coverage.mjs` fails only when an INVENTORIED control lacks a spec; controls absent from the hand-maintained inventory are invisible — the gate can be green with most of the app uncovered (evidence: 99 inventoried vs ~235 button sites). Suggest an inventory-drift check: a runtime crawl step (after landOnHome, walk each nav tab/modal and collect visible `role=button/textbox/...` accessible names via `page.getByRole(...)`… or `aria-snapshot`), diff against the inventory, and fail on unknown controls. A static JSX scan is a weaker but cheaper alternative. This single change converts the gate from "claims are consistent" to "coverage is complete". Owner: test agent. HIGH confidence.
- **CS-2 · `covered_by` is claim-based, never verified.** Nothing checks the claiming spec actually TOUCHES the control (only that the file exists). Cheap first step: checker greps the claiming spec for the control's selector name and warns on miss. Full fix: a `touch(controlId)` helper specs call at interaction points, emitting a run artifact the checker cross-references. Owner: test agent. HIGH confidence on the grep step; the helper is a design suggestion.
- **CS-3 · Interaction depth is not tracked — and T-COV2 (AUDIT-FIX-TRACKER) explicitly requires OUTCOME assertions, not presence.** Run-1 evidence that presence-level coverage masks real breakage: tutor switching was "covered" and green as a render assert while 100% broken in prod (EF-10). Suggest adding `depth: rendered | clicked | value-changed | outcome-asserted` per inventory control; gate warns on `rendered`-only. Owner: test agent. HIGH confidence.
- **CS-4 · Ambiguous inventory selectors.** The two onboarding consent checkboxes share the identical `input[type="checkbox"]` css selector — indistinguishable entries. Selectors in the inventory should uniquely identify the control (accessible name or a stable test id). Owner: test agent. HIGH confidence.
- **CS-5 · e2e is not in the ship gate.** `scripts/preflight.sh` contains no playwright step, so a deploy can ship with the suite red (it was 12/38 red at v1.0.0+). Suggest: preflight runs at least `npx playwright test --grep @smoke` when the environment can bind ports (skip-with-loud-warning otherwise), and the `@smoke` set gets curated to the always-green core. Owner: runner/product session (script) — needs owner sign-off since it lengthens deploys. HIGH confidence.
- **CS-6 · One suite runner at a time (formalize E-1).** Concurrent runs share live DB + `.auth/` files and cross-contaminate (observed: global-setup re-ran mid-triage and swapped the throwaway user under my probes). Suggest: runner reserves a `queuectl` token named "e2e-suite-run" for the duration; both agents honor it. Owner: both agents + operator convention. HIGH confidence.
- **CS-7 · Reproducibility protocol.** Local `retries: 0` + live backend means occasional network flakes will file false defects. Convention: before filing an EF item, re-run the single failing spec once (`npx playwright test <file> --repeat-each=2` for suspicion of flake); record "deterministic" vs "flaky (1/3)" in the reproducibility field. Owner: runner (adopted as of this review). MEDIUM confidence — revisit when flakes actually appear (run 1 had zero).
- **CS-8 · Seed/teardown hygiene for queue specs.** admin/03/05 seed pending rows with nonce text but (as read) don't delete them; the live review queues accumulate `Admin queue …` junk across runs, and the owner's real admin view shows test garbage. Suggest afterEach cleanup via evidence clients (delete by nonce), or a dedicated tag prefix + periodic sweep script. Owner: test agent. HIGH confidence.

## Environment / process notes

- **E-1 · Two agents ran the suite concurrently** — during triage, `tests/e2e/.auth/*.json` was regenerated by another process (new throwaway user; a probe mid-analysis briefly chased the wrong user). Shared live DB + shared `.auth/` files make concurrent runs cross-contaminating. **Rule proposal: one suite runner at a time**; the test agent should signal runs (or the runner claims a queue token for "suite execution").
- **E-2 · test-results/ is ephemeral** — every run overwrites it. The runner snapshots failing runs under `artifacts/e2e-run-<stamp>/` (tgz). Reference those in items, not live test-results paths.
- **E-3 · Suite runtime** — 3.8 min for 38 tests (serial, live backend). Fine for now; revisit sharding only if the suite triples.
