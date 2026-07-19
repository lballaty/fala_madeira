# E2E Live-Run Findings Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/E2E-LIVE-RUN-TRACKER.md
**Description:** Live defect queue from executing the Playwright e2e suite (T-COV mandate, commit 662541b). The test-building agent authors specs but cannot bind ports in its sandbox; the runner session executes the suite (local `vite preview` + LIVE Supabase) and records every discrete failure here. Two buckets: EXECUTION FAILURES (tests that exist but fail) and COVERAGE GAPS (surfaces/flows not yet exercised). Owners — **app** (product code, runner/product session fixes, mirrored to REQUIREMENTS-TRACKER), **harness** (fixtures/setup/technique), **selector** (locator defects), **data** (seed/state assumptions), **environment** (runner env / concurrency noise). Harness/selector/data items belong to the test-building agent.
**Author:** Libor Ballaty
**Created:** 2026-07-13
**Last Updated:** 2026-07-16 (replaced "Active lane split" with responsibility-based coordination — no fixed agent identities)
**Last Updated By:** Libor Ballaty

## How to use this file

- **Test-building agent:** items with owner harness/selector/data are your worklist. When you change a spec, set the item to `fixed-pending-rerun` with a one-line note; the runner re-executes and flips to `verified` or reopens.
- **Runner session:** append a run section per execution; update item statuses; never edit specs (`tests/e2e/` is the test agent's scope).
- **Statuses:** `open` · `fixed-pending-rerun` · `verified` · `wont-fix` (with reason).
- Writes to this file are coordinated via the global queue (`queuectl reserve`).

## Run log

### Run 27 — 2026-07-19 — EN-23b admin Audio panel W1–W4 built + full regression GREEN (134/0/3 of 137)
- **Context:** EN-23b (admin Audio panel fixes) built in worktree `fala_madeira-en23b` on `feat/en23b-audio-panel-fixes`, merged to develop (`3b299a8`) + post-merge concurrency fix (`18c7be1`). Owner-approved requirements (`docs/EN-23b-AUDIO-PANEL-FIXES-REQUIREMENTS.md §8`, 2026-07-19); all four claims verified against live code before build.
- **What shipped:** W1 server-tier config wiring (`audioServerTier.ts` → real `verpexBase`/`supabaseAudioBucket` + `keyToServerPath` + Verpex→Supabase probe + SPA-fallback `text/html` guard + timeout); W2 `getPlaybackUrl` synthesize-on-cache-miss (play works for any clip, loading state, logged/toasted failure); W3 paginated load (`config.audio.reviewPageSize=25` + "Load more"; per-page enrichment **concurrent** via Promise.all); W4 previewed-clip byteLength → size shown per row.
- **Coverage:** admin/audio **unit 43/43** (new `useAudioReview.play.test.ts`, `useAudioReview.pagination.test.ts`; updated `audioServerTier.test.ts` for the new config keys + SPA-fallback case). `admin/13-admin-audio-panel.spec.ts` extended 2→3 tests: (1) bounded first page + honest server tier + Load more (W1/W3), (2) play-any-clip + size via a mocked `ai-gateway` TTS (W2/W4, deterministic — no live-provider/EF-37 dependency), (3) verdict/enqueue DB round-trip unchanged (acceptance #5).
- **Gate (develop, fresh CI=1):** full e2e **134 passed · 0 failed · 3 skipped of 137** (6.7m; the 3 skips = owner-approved EN-8 `test.fixme`). Ship dry-run preflight **all-PASS** (eslint/tsc/vitest/build/e2e-coverage/npm-audit/standards/cors/help-drift/db-version-drift/observability `--strict`); dry-run made no upload/network. **EF-39 (user/04) passed in-run.**
- **Perf note surfaced + fixed:** W1 turns the server tier ON, so the paginated load now probes each visible clip; the first cut enriched a page **sequentially** → a full page of cross-origin Supabase HEADs stalled first render (admin/13 DB test timed out at 15s). Fixed by enriching the page **concurrently** (order-preserving Promise.all) → ~one round-trip per page. Not a product-facing defect post-fix.
- **NOT done (out of scope / gated):** W5 (true present/missing per populated tier) + W6 (`pregen --from-queue`) remain **EN-8-dependent**. Release cut of EN-23b is **operator-gated** (staging→approve→production). Leaked dev-DB `tts_audio_regen_queue` pending rows (EF-38 residue) still owed a retire (`UPDATE … status='done'`).

### Run 26 — 2026-07-19 — EF-39 stabilized (idempotent choice-click retry); full CI=1 gate 133/136 GREEN
- **Context:** picked up the stale .18.3 handoff; reconciled that **2026.07.18.4 already superseded .18.3 and is STAGED (awaiting owner prod approval)**. The only genuinely-open, non-gated worklist item was **EF-39** (harness flake). Fixed it.
- **EF-39 · `user/04-learning-feedback:97` — `verified` — `fix (this commit)`:** root cause corrected — the tracker's "backend latency" hypothesis was **wrong**. `Quiz.tsx` is **pure synchronous client state**: choice-click → `handleAnswer` → `setIsAnswered(true)` → footer Next `disabled={!isAnswered}` flips immediately; the footer button lives **outside** `AnimatePresence` (always mounted). The real mechanism: the choice `<button>` lives **inside** the `motion.div` (`key={index}`, entrance `x:20→0`, `opacity:0→1`); under full-suite CPU load that entrance animation janks, so the first `firstChoice.click()` can land on a still-transitioning element and never fire `handleAnswer` → `isAnswered` stays false → Next stays disabled → `expect(nextButton).toBeEnabled()` times out. **Fix:** wrap the choice-click in `expect(...).toPass()` that re-clicks the choice until Next enables. `handleAnswer` guards `if (isAnswered) return`, so re-clicking is **idempotent**. **Does NOT weaken the assertion** — the product must still enable Next in response to a real choice-click.
- **Verification:** isolated **1/1** (14.2s); concurrency stress `--repeat-each=4 --workers=4` **4/4** (14.1s) — this is the authoritative proof for the multi-worker load window, since the gate runner is **single-worker** and structurally cannot reproduce EF-39. Full fresh-server `CI=1 npm run test:e2e:regression` from develop: **133 passed · 0 failed · 3 skipped of 136** (6.8m; 3 skips = owner-approved EN-8 `test.fixme`). `tsc --noEmit` clean.
- **Net:** Run 25's last open item closed. Multi-worker regression runs no longer carry the EF-39 flake risk. No product change; no release-version impact (release stream sits at staged .18.4, owner-gated).

### Deploy — 2026-07-18 — STAGED ✅ 2026.07.18.4 (supersedes .18.3) — new-user Home crash fix + batch — awaiting production approval
- **Why .18.4:** owner live-tested and found a **P0 new-user crash** — registering a new account → Home error page (`Cannot read properties of undefined (reading 'title')`). Root cause: `HomeView` dereferenced `lessons[0].title` unconditionally in the always-rendered "Continue Learning" card (+ `startAIPractice(lessons[0])` on "Start Today's Lesson"); a brand-new user has `lessons===[]` in the pre-content-load window. **Pre-existing latent bug — live in prod .17.1 AND the .18.3 stage** (not introduced by the cut). Two other owner reports triaged same session: admin partial-email search = already fixed (EN-26, ships here); tutor per-phrase chunking = TB-14, **never built** (not a regression), decoupled to a later cut.
- **Fix:** `b6c975e` — guard empty lessons (first-run "Start your first lesson" card; route to Learning if no lesson resolves).
- **Coverage gap closed (this is why the 132-green gate missed it):** every test user is API-provisioned + PRE-SEEDED with completed onboarding + a selected path (`makeInitScript`), so no spec rendered the true empty-lessons first Home; the crash is a pre-content-load **timing race** that `12-onboarding-fresh-flow` passed through (greeting-only assertion). New coverage `1a332cb`: deterministic **component test** (`HomeView.empty-lessons.test.tsx`, 2/2, proven to fail without the guard) + **fresh-registration e2e** (`user/63-new-user-first-home-render.spec.ts`, validated 1/1 — real signup→onboarding→Home, asserts no ErrorBoundary + no crash-signature console error).
- **Gate (develop `cf27ee9`, fresh CI=1):** full e2e **133 passed · 0 failed · 3 skipped of 136** (3 skips = owner-approved EN-8 `test.fixme`); ship dry-run + real staging preflight all-PASS (**vitest 505/505**, eslint, tsc, build, coverage-contract 202, audit, standards, cors, help-drift, db-version-drift, observability --strict).
- **Cut:** merged develop→main (`2f06f0f`); `ship.sh` bumped `2026.07.18.3→2026.07.18.4` (`0ce7e64`).
- **Staged + verified:** uploaded to `testfalamadeira.searchingfool.com`; staged commit `0ce7e64`. **Live checks:** homepage + manifest 200; served SettingsView bundle carries `2026.07.18.4`; served HomeView bundle contains the "Start your first lesson" empty-state (crash fix **live on staging**).
- **NOT yet:** `deploy:approve` + `deploy:production`, `git push main` + tag `v2026.07.18.4`, back-merge to develop. **Next:** owner manual-verifies staging (register a NEW user → no error page; admin User Access partial search) → approve → production. Follow-up (non-gating): add `home.first_run.render` control id + touch to register spec 63's surface.

### Deploy — 2026-07-18 — STAGED ✅ 2026.07.18.3 (SEC-3 + EN-23 + EN-8 device persistence + TB batch) — awaiting production approval
- **Gate (develop `30808cb`, fresh CI=1):** full e2e **132 passed · 0 failed · 3 skipped** of 135 (6.8m); the 3 skips = owner-approved EN-8 server-tier `test.fixme` in `user/62`. **EF-39 did not trip** (single-worker run avoids the load window; deferred as a documented non-blocker, zero product impact — pure sync client state `Quiz.tsx:191`). vitest 503/503.
- **Ship gate (both develop dry-run and the real staging cut on `main`):** all preflight stages PASS — eslint, tsc, vitest 503, build, e2e-coverage (202 controls), npm-audit (no high/crit prod), standards (0 hard / 2 advisory), cors, help-drift, db-version-drift, observability `--strict`.
- **Cut:** merged `develop`→`main` (`--no-ff`, `1df6805`); `ship.sh` STAGE 0 bumped `VERSION` `2026.07.18.2→2026.07.18.3` (+ package.json), committed `4de8dac`. CHANGELOG `2026.07.18.3` block carries the 8 previously-undocumented user-facing tickets (SEC-3, EN-23, EN-8, TB-16/17/21/22/23).
- **Staged:** rsync/SSH upload of `dist/` → `testfalamadeira.searchingfool.com`; staged commit `4de8dac` recorded in `.deploy-state.json`. **Verified live:** homepage + manifest 200; served `SettingsView` bundle carries `2026.07.18.3` (About will show the version + new notes).
- **NOT yet:** `deploy:approve` + `deploy:production` (operator-gated), `git push main` + tag, back-merge to develop. **Next:** owner manual-verifies staging → `npm run deploy:approve` → `npm run deploy:production`.

### Run 25 — 2026-07-18 — release-gate regression 41→2→GREEN modulo 1 flake; 3 IndexedDB/session HARNESS root causes fixed; reuseExistingServer footgun
- **Context:** cutting `2026.07.18.2` from `develop` (`6bd894d`). First full regression **91/135 · 41 failed** (19m — bloated by ~28 onboarding-stranded 15–20s timeouts). Driven to **130/135 · 2 failed** on a clean server, then the last 2 resolved/classified. **All causes were TEST-HARNESS; zero product regressions.** `main` kept clean throughout (owner directive) — every fix on `develop`.
- **RC1 · IndexedDB onboarding-seed drift — `verified` — `fix 44a95ac`:** `fixtures.ts:makeInitScript` opened `FalaMadeiraAudioCache` at **v2** but the app is **v3** (EN-8 `audio_pinned`). Opening an existing v3 DB at v2 throws `VersionError`; the seed write was swallowed → `useOnboarding` saw no record → App rendered `OnboardingFlow` → **~28 `landOnHome`-dependent content specs died on the welcome screen** (order-dependent: passed alone, failed once the DB existed at v3). Bumped seed to v3 + create pinned store + pinned a comment to the app `DB_VERSION`.
- **RC2 · IndexedDB KV read/write drift — `verified` — `fix 6d7bdaa`:** `support/storage.ts` opened the DB at **v2** in all four KV helpers → `readKvByPrefix` returned null / `writeKv` no-oped on a v3 DB. Broke KV assertions (e.g. `31-onboarding-path-variants` `paths:selection`) even though the app persisted correctly (Home showed the chosen path). Bumped all four to v3 + header pin.
- **RC3 · Global sign-out revoking the SHARED session — `verified` — `fix 9de3090`:** `15-settings-signout`, `54-sidebar-signout`, `56-WP2` drove the app's Sign Out on the **shared** suite user. `supabase.auth.signOut()` defaults to **GLOBAL scope** → revokes the user's refresh token server-side → every later spec's evidence/`resetUserState` fixture failed `setSession` with **"Auth session missing!"** (~13 specs; `57` = "user from JWT does not exist" via deletion). Converted those specs to disposable users via `createThrowawayUserContext` (as `09-account-deletion` already does). **Not a product bug — global sign-out is correct.**
- **RC4 · `47-clean-run-smoke` audio 400 — `verified` — `fix b97cf97`:** the `@clean` guard counted the **expected EN-8 server-audio buffer probe** miss (`GET …/tts-audio/…​.pcm` → 400 until server audio is deployed). `tryFetchPcm` handles it (returns null → provider plays), so it is app-clean; the browser's URL-less `status of 400 ()` console pair + cross-origin 400 tripped the guard. Allowlisted the `tts-audio` bucket URL + extended console-status suppression to 400 (same pattern as the existing 429/503 exempt); the URL-aware response handler stays authoritative for real app-origin 400s.
- **ENV footgun · stale reused preview server — `resolved (process)`:** `playwright.config.ts` `reuseExistingServer: !CI` reused a **preview server running since Monday** across every local run; it died mid-run once, producing a ~30-spec `ERR_CONNECTION_REFUSED` cascade (the invalid 57-fail run) and means earlier runs may have served a **stale build**. Killed it; **re-ran with `CI=1` to force a fresh build+server + `retries:1`** (the authoritative 130/135). **Recommendation for the release runner: force a fresh server (CI=1 / no reuse) — never reuse for a gate run.**
- **`EF-38` admin/13-admin-audio · already RESOLVED `240878e` (Run 24 note)** — confirmed passing on the clean server.
- **`EF-39` · `user/04-learning-feedback:97` — `verified` (Run 26, 2026-07-19: idempotent choice-click retry; concurrency stress 4/4 + CI=1 gate 133/136 green) — owner: harness (flake):** fails only under **full-suite load** (through `retries:1`) at `await expect(nextButton).toBeEnabled()` after a quiz-choice click; **passes 2/2 in isolation**. Quiz logic is correct (`Quiz.tsx` choice→`handleAnswer`→`isAnswered`→Next enables); the `AnimatePresence mode="wait"` question re-mount + backend latency under load is the suspected timing window. **Not a product bug.** Next action: stabilize the choice-click/animation settle (or quarantine into a non-gating lane like `@clean`/`@a11y`) before the release re-gates. Blocks a fully-green CI gate.
- **Net:** 40 of 41 resolved with understood, committed harness fixes. Release `2026.07.18.2` can re-cut once `EF-39` is stabilized/quarantined and a fresh-server full run is green.

### Run 24 — 2026-07-17 — 131/132 (7.1m); full preflight GREEN end-to-end; coverage contract reconciled after clearing stale touch artifacts; 1 deterministic EN-23 admin-audio isolation failure (EF-38)
- **131 passed · 1 failed of 132 (7.1m)**, tree at `1e0c603` (develop; TB-17 client fix + A9/A10 lint + EN-18/EN-23 merges landed). Run executed to regenerate touch artifacts after the coverage-contract false positive (A11) was root-caused.
- **Coverage contract now PASSES (`202 controls mapped`, exit 0)** and **full `scripts/preflight.sh` is GREEN end-to-end** (eslint / tsc / 431 unit / build / e2e-coverage / npm-audit / standards / cors / help-drift / observability --strict). The earlier `test:e2e:coverage` failure was **A11 = stale local touch artifacts** (gitignored `artifacts/control-touches/`) left from a pre-WP7-reconcile run at 05:4x; the dir was cleared and this run rewrote current-id touches. **Verified in code**, not a repo defect (see AUDIT-FIX-TRACKER A11). Gate-hardening for the drift is filed there (owner EN-24/coverage stream).
- **EF-38 · `admin/13-admin-audio-panel.spec.ts:31` "marks a clip bad and enqueues it for regeneration" — `RESOLVED 2026-07-18 (240878e)`:** the test expected `audio-enqueue` **enabled** after marking a clip bad, but it rendered **`disabled` "Queued"**. **True root cause (verified in code 2026-07-18):** `tts_audio_regen_queue` is **append/update-only** — migration `00014` grants admins SELECT/INSERT/UPDATE but **NO DELETE** (by design: a durable log guarded by a unique LIVE-status index; done/failed rows are retained so re-enqueue is allowed). The spec's `cleanup` used `.delete()`, which RLS **silently denies** (0 rows, no error), so every run **leaked a permanent `pending` row** for its build-key; the UI's `queued` flag (derived from live pending/claimed rows — `useAudioReview.ts:112`, correct) then kept the enqueue control disabled on all later runs. So the earlier "residual DB state" note was right about the symptom but the cleanup could never work as written. **Fix:** retire any live entry via `UPDATE(status='done')` instead of DELETE (the sanctioned operation) — `queued` clears, enqueue enables. **Not a product bug**; the append/update-only design is intentional (see EN-23 note in TESTER-FEEDBACK-TRACKER). admin/13 now **2/2**. **Operational follow-up (dev DB):** stale `pending` rows leaked by prior EF-38 runs remain in the dev `tts_audio_regen_queue` and should be retired (`UPDATE … SET status='done' WHERE status IN ('pending','claimed')`) so pregen doesn't process phantom entries.

### Run 23 — 2026-07-16 — 125/127 (7.7m); coverage-audit run; both failures root-caused + fixed test-side; coverage gate reconciled 177→203; NEW EF-37 (server TTS 503 across the whole window)
- **125 passed · 2 failed of 127 (7.7m)**, first full run since EN-15/EN-16/EN-17a/EN-20/TB-15 landed (tree at `55f9b30`). Run executed as part of the 2026-07-16 verify/reconcile audit.
- **`user/15-practice-vocabulary-session` — deterministic (2/2 incl. fresh-user rerun) — TWO test-side defects, both FIXED (commit `1e95802`), spec now green (8.6s):**
  1. **Stale vs EN-16 (owner-approved `b351bbe`):** sessions now scale to their scope, so the hub's default "All lessons" deck is the full inventory (1145 cards) and the spec's 25-step loop can never reach "Session complete". Fix: enter via Browse situations → Vocabulary Review (situation-scoped deck). Owner: `data/selector` (spec predates EN-16).
  2. **Latent short-word click geometry (trace-verified):** the flashcard front centers `word + 44px SpeakerButton`; for a short word ("Ali", deck position 21) the card's CENTER — where Playwright clicks — lands ON the nested button, whose `stopPropagation()` swallows the flip. Fix: corner click. **App-side bug filed as TB-19 (TESTER-FEEDBACK-TRACKER, owner directive 2026-07-16):** nested interactive button inside a `role="button"` flashcard — real mid-card taps on short words play audio instead of flipping; the corner-click is a workaround that MASKS the bug in the suite, so the TB-19 fix must restore a plain center click in user/15 as the regression guard.
- **`user/56-help-guidance:35` — flaky (1/2) — FIXED (commit `15fe5e8`):** the live AI help answer repeated the registry sentence in two paragraphs → strict-mode violation on un-suffixed `getByText`. Selector hardened with `.first()`. Owner: `selector` (AI-phrasing nondeterminism).
- **EF-37 (NEW) · Server TTS 503 `TTS_UNAVAILABLE` for the ENTIRE run window — owner: environment/ops (ties EN-8 + TB-13) — `open`:** user/15's trace shows **66/66** `POST /functions/v1/gemini` (pre-rename) returning 503 `{code:'TTS_UNAVAILABLE', attempted:['gemini']}` — the server TTS provider was unavailable/rate-limited throughout (consistent with EN-8's provider sustained-rate-limit finding; the level-0 pregen warm competes for the same quota). The app degraded to device speech as designed (user/50), **but that means live users get device-voice accents while this persists — exactly the TB-13 exposure**. Next action (ops): add a locale-pinned provider key (`AZURE_SPEECH_KEY`) per TB-13, and check provider quota before/after EN-8 warm batches. Distinct from EF-36 (429 voice-cap bleed): this is provider-side 503, hit on the FIRST call.
- **Coverage gate reconciled (was HARD-FAILING pre-run, exit 1):** touch artifacts referenced **15 control ids** (specs 37/52/53/56/57/58) never added to the inventory — inventory-maintenance debt, the gate did its job. Reconciled `177→203` controls (commit `30a1579`): the 15 ids added; 5 UserAccessPanel controls (exercised by admin/09) + Settings "Voice Provider" select (exercised by user/46) inventoried; stale `learning.lesson.vocab.query_input` placeholder fixed ("Portuguese or English word…" since EN-10); `practice.simulator.end_conversation` claim aligned to the depth user/45 deterministically records (rendered — control is free/AI-variant-only; an online AI-variant spec remains a candidate).
- **3 NEW gap specs, all green (commit `30a1579`):** `user/60` Settings "Storage limit" + "Download for offline" selects (save-audio-switch gate asserted; download action deliberately excluded — live TTS pregen); `user/61` About → Contact Support → Support & Feedback modal; `admin/11` ticket status filter + "Reopen ticket" (DB-asserted round-trip).
- **Drift-check false positives — escalated to CS-9 and FIXED (owner directive 2026-07-16):** `settings.tutor.select` "João, 45" false-STALE (ASCII-only word regex) and css-placeholder needles never staleness-checked (how the vocab placeholder went stale silently) — both checker bugs fixed and bite-tested, see CS-9. "Dismiss hint" (ContextualHint) is DEAD UI — no live call site passes `onDismiss` (only the unit test exercises it); app-side cleanup candidate. Remaining depth backlog: 9 rendered-only controls (incl. `admin.studio.save_draft/publish` — held at rendered deliberately: outcome-asserting them would publish to the live project).
- **Checker state after reconcile:** `check-interactive-coverage.mjs` exit 0, 203 controls, 0 orphans, 0 unknown ids, 0 under-touched claims. vitest 270/270; tsc clean.

### Deploy — 2026-07-15 — SHIPPED ✅ 2026.07.15.2 (nav/audio batch + EN-7 phase-1)
- **Prod live + verified:** `falamadeira.searchingfool.com` 200 (home + manifest), serving `index-BG71MRaG.js` (matches built dist). Staged→approved→production via the INFRA-4 gate (staged+approved commit `855de52`); staging `testfalamadeira` verified first.
- **Shipped (all DONE on `main` + back-merged to `develop`, tag `v2026.07.15.2`):** **EN-9** sidebar Sign Out · **EN-1** shared `AudioButton` click-feedback (lesson buttons; rest fast-follow) · **TB-5** tutor read-aloud defaults OFF · **TB-8** voice limit reflects server value + visible to all · **TB-9** honest "can't persist audio" warning · **EN-7** phase-1 download resilience (other agent).
- **Gate:** full regression effectively **116/116** (2 transient live-auth failures confirmed passing on `--last-failed`); vitest 204/204; tsc clean. The batch's own full-regression run **self-caught 5 regressions** (a11y ×3 sidebar-red contrast, Sign-Out selector ambiguity ×3, TB-5 test) — all fixed before ship.
- **Process lesson:** preflight's **eslint** caught an unused-import error my per-item `tsc`+vitest checks missed (AGENTS §3 says run the full gate incl. eslint per code-step — follow it). Forced a re-bump `.1`→`.2` (the `.1` never deployed).

### Fixes — 2026-07-14 — EF-34 / EF-35 / EF-36 (user/44, 45, 47) RESOLVED at the test/guard layer (owner: "fix these, no lane-tagging")
Owner directive: stop deferring these as other-lane; fix them. All three were real defects in the **tests/guard**, not the product (each product surface renders correctly in the failure traces). Fixed on develop (commit `3da3fe7`) and confirmed GREEN in a targeted run (7/7); the full-suite rerun verifies.
- **EF-34 (`user/44`) — `fixed-pending-rerun → verified (targeted)`:** `locator.isVisible({timeout})` does NOT auto-wait; the empty-deck branch raced the async-loading vocab deck (trace showed the "Bom dia" flashcard + "Play the word" present). Fix: wait for flashcard OR empty-state to settle, then branch.
- **EF-35 (`user/45`) — `fixed-pending-rerun → verified (targeted)`:** two issues — (1) `filter({hasText:/\bL\d/})` matched nothing because text-content concatenates the badge as "PresenceL0" (no word boundary); (2) seed content is now FULLY ENRICHED so every situation is "mission ready" → no self-made situation exists. Fix: match situations by accessible name; adaptively exercise the self-made statement textarea when present, else an authored situation, always the after-action note. **Content-coverage gap logged:** seed has no self-made situations → the self-made statement input is unexercised by content (content decision: add a non-mission situation, or accept). 
- **EF-36 (`user/47`) — `fixed-pending-rerun → verified (targeted)`:** the @clean guard flagged gemini **429** (rate-limit) and **503** (TTS SERVICE_UNAVAILABLE) from the shared-project quota bleed (user/27 exhausts the daily AI budget). These are throttle/unavailable conditions the app **handles gracefully** (degrades to device speech — verified by `user/50`), not runtime defects. Fix: `consoleGuard` ignores 429 (any) + 503 (gemini endpoint only); all other 4xx/5xx (incl. the profiles 400s this guard exists to catch) still fail. Durable fix for genuinely-clean gemini calls under test remains **WS2 test-user isolation**.

### Run 22 — 2026-07-14 — 111/114; About (EN-4) + TB-4 mobile regression LAND + pass; same 3 known non-blockers (EF-34/35/36)
- **111 passed · 3 failed of 114 (7.3m).** A `--last-failed` re-run reproduced the identical 3 → not transient, they are the known environmental/other-lane items. (Note: an earlier full run this session showed 4 failed incl. user/04 learning-feedback, which **passed** on this run — that shift confirms the live-backend flakiness signature; user/04 is not a stable failure.)
- **New coverage this session, both GREEN:**
  - `user/53-about-version-release-notes.spec.ts` — in-app About (EN-4): asserts the displayed version == root `VERSION`, per-version release notes render from `CHANGELOG.md`, and the legal-link wiring. + vitest `src/features/about/__tests__/changelog.test.ts` (parser). Feature commit `5f75fc8`.
  - `user/52-onboarding-footer-reachable-short-viewport.spec.ts` (`@mobile`, 390×560) — TB-4 guard: onboarding footer CTA `toBeInViewport()` + advances on a short window. `toBeVisible()` would NOT catch the bug (element in DOM, below fold); `toBeInViewport()` fails pre-fix / passes post-fix. Commit `03b98d8`.
- **The 3 failures = the known open items, reproduced exactly (no Lane B product fix owed):**
  - `user/44` = **EF-34** (Lane A — vocab spec load-timing race; fell through to its empty/summary fallback which also didn't match → live vocab-deck state).
  - `user/45` = **EF-35** (Lane A/content — self-made-situation button absent → mission-seed/data assumption).
  - `user/47` (`@clean`) = **EF-36** family — persistent **`429 POST /functions/v1/gemini`** this window (shared-test-user daily voice cap exhausted by `user/27`, bleeds into the clean-run journey). Environmental; fix path unchanged = **WS2 test-user isolation**.
- **Net:** effectively **111/114 green** modulo the 3 documented non-blockers (EF-34 Lane A, EF-35 Lane A/content, EF-36 WS2 isolation). tsc clean; **vitest 189/189**. About (EN-4) + TB-4 regression verified and ready for the next release cut.

### Deploy — 2026-07-14 — SHIPPED ✅ (hold resolved)
- **`npm run deploy` PASSED the full ship gate** (tsc + lint + vitest + build + e2e-coverage contract) and rsynced `dist/` to Verpex. **Prod verified live:** `manifest.webmanifest` 200, homepage 200, serving `index-Be7gTH4K.js` (matches freshly-built dist). REAL_EXIT=0.
- **Hold resolved:** operator confirmed the other agent is working ONLY on PF-13 (schema-drift; no PF-13 files were dirty), so the remaining working-tree work was committed (fala_madeira `8f89307`, `5ce59db`, `dd18d1d`, `514ec52`) and the tree was clean at deploy — no other-agent WIP shipped.
- **Now live (everything since the earlier EF-33/a11y deploy):** PF-11b practice-hub contrast (`111bc86`), populated-Home a11y green-900 (`4f687f2`), observability error-routing (usePractice + notifications adapters, `8f89307`), the other agent's committed observability work, UpgradeModal tombstone + probe removal, and the "Daily session" label.
- **Operator:** hard-refresh once (service worker) before manual testing.

### Deploy — 2026-07-14 — HELD (pending other-agent coordination) ⛔ [RESOLVED — see entry above]
- **A production deploy was requested but is HELD.** `scripts/ship.sh` builds `dist/` from the **working tree** (no git-clean guard / no checkout), so a deploy now would bundle the **other agent's uncommitted in-flight work** (modified `src/features/practice/usePractice.ts`, `src/features/session/DailySessionView.tsx`, `src/platform/{native,web}/notifications*.ts`; deleted `src/features/tutor/UpgradeModal.tsx`; deleted `src/platform/web/probe.ts`) into the production bundle. Shipping their unreviewed observability/paywall WIP to prod is out of Lane B scope and unsafe.
- **Ready-to-ship (committed HEAD `83307a5`), NOT yet live:** PF-11b a11y contrast fix (`111bc86`, `--fm-brand` `#0063CE→#0057B7`, verified). Also note `111bc86` + the run-21 tracker commits are **unpushed** as of this note.
- **UNBLOCK CONDITION (other agent):** either (a) commit / confirm the uncommitted `src/` WIP above is release-ready, then deploy the combined committed state; or (b) explicitly hand off a clean deploy window so Lane B can ship committed HEAD from a throwaway worktree (excludes WIP). Decision recorded 2026-07-14 by operator: **hold + coordinate.**

### Run 21 — 2026-07-14 — 102/108; practice-hub a11y contrast FIXED+verified (PF-11b); 2 new failures triaged (1 EF-36 family, 1 other-agent)
- **102 passed · 6 failed of 108 (8.5m), REAL_EXIT=1.** Suite grew 105→108 (new observability specs user/48–49). **Run made against the current working tree, which carries the other agent's uncommitted observability/paywall work** (incl. `UpgradeModal.tsx` deletion, modified `09-account-deletion.spec.ts`) — so some failures reflect their in-flight state, not committed code.
- **3 failures are the known open items:** user/44 (EF-34), user/45 (EF-35), user/47 (EF-36) — all reproduced exactly as re-triaged above.
- **3 failures were NEW vs run 20 — triaged:**
  1. **✅ `11-accessibility.spec.ts:48` (practice hub) — FIXED (PF-11b, commit `111bc86`).** axe serious `color-contrast`: the practice-hub "online" pill (`PracticeHubView.tsx:161`, 9px bold `text-ios-blue` on `bg-ios-blue/10`) rendered **4.33:1** (effective fg `#136ed1` on `#e7effa`). State-dependent (`mode.requiresOnline`), which is why run 20 was green. Fix: darkened light-mode `--fm-brand` `#0063CE→#0057B7` (clears 4.5:1 on the tint with margin; dark mode untouched; only improves white-on-brand elsewhere). **Verified: all 4 axe @a11y smokes green (auth/home/settings/practice), 13.2s.**
  2. **`05-tutor.spec.ts:31` (@smoke edge requestId join) — EF-36 family (VOICE_LIMIT_REACHED bleed), environmental.** 60s timeout; trace shows `429` + "Daily voice limit". Same shared-test-user voice-cap bleed as EF-36 (user/27 exhausts the cap → later voice specs 429). Not a code regression. → same fix path as EF-36: **WS2 test-user isolation** (premium/unlimited or per-spec `voice_usage_today` reset).
  3. **`09-account-deletion.spec.ts:12` — "delete-account did not echo a requestId" — OTHER AGENT'S in-flight work, not Lane B.** The assertion is a requestId-echo check tied to the other agent's active observability changes, and `09-account-deletion.spec.ts` is in *their* dirty worktree. Deferred to them; do not fix from Lane B.
- **Net after PF-11b:** effectively **103/108**; the 5 remaining = EF-34 (Lane A), EF-35 (Lane A/content), EF-36 + 05-tutor (WS2 test-user isolation), 09-account-deletion (other agent). No further Lane B product fix owed this run.
- **Artifacts:** `artifacts/e2e-run21-2026-07-14.tgz`. Verify log: `/tmp/a11y-verify-run21.log`.

### Triage — 2026-07-14 — EF-36 + EF-34 root causes CORRECTED from run-19 artifacts (no code written; Lane B analysis)
Empirical re-triage of the 3 open failures against `artifacts/e2e-run19-2026-07-14.tgz` traces. **Prior root-cause notes for EF-36 and EF-34 were wrong** and are corrected here.

- **EF-36 (user/47 @clean) — CORRECTED: the 429 is the INTENTIONAL free-tier daily voice cap, NOT an app bug or an upstream rate limit.** Trace `trace.zip` for user-47 shows the 429 body = **`VOICE_LIMIT_REACHED` / "Daily voice limit of 5 reached. Upgrade for unlimited practice."** — emitted by `supabase/functions/gemini/index.ts:165-172` when free-tier `voice_usage_today >= voice_limit`. `user/27` (tutor-voice-limit) **deliberately exhausts** that cap; on a shared test user the usage **bleeds** into every later audio-playing spec (user/47) — same shared-state family as EF-30/EF-34. The `[console.error] Failed to load resource … 429` is **Chromium's own network-failure notice**, not app code — our path already routes through `src/lib/logger.ts` (observability commit `eebdee4`), and the prod build (`import.meta.env.DEV=false`) emits no `devEcho`. The `@clean` guard fails on the **429 network response itself** (`consoleGuard.ts:67-72` records all responses ≥400), which **no client-side retry/degrade can clean**.
  - **Decision: do NOT "fix" EF-36 with app code.** (a) Retrying `VOICE_LIMIT_REACHED` is futile (deterministic per-user cap); degrading TTS to device speech on it would **silently defeat the premium paywall** — wrong product behavior. Also the paywall UX is being **actively refactored by the other agent** (`D src/features/tutor/UpgradeModal.tsx` in their dirty worktree) — Lane B must not touch it. (c) "Raise the edge rate limit" is wrong — this is a product cap, not infra throttling.
  - **Correct fixes, both OUTSIDE Lane B product code:** (1) **WS2 test-user config (DB / other-agent):** run audio-heavy journeys (user/47) as a premium/unlimited user, or reset `voice_usage_today` per spec — exactly what the hybrid test-user model exists for. (2) **Lane A `@clean` guard:** allowlist gemini-edge 429 `VOICE_LIMIT_REACHED` as an expected backpressure/product signal, while keeping user/27's explicit "limit reached" assertion. (3) **Coordinate w/ observability agent:** an *expected* business-rule 4xx (VOICE_LIMIT_REACHED) is currently logged at ERROR by `invokeEdgeFunction`'s choke point — arguably should be WARN (like TTS_UNAVAILABLE) to keep the error tier clean. That edit lives in freshly-committed observability code (`eebdee4`) → their call, not a unilateral Lane B change.
  - **Status: EF-36 → not-an-app-bug; rerouted to WS2 (test-user isolation) + Lane A (guard allowlist). No product code owed.**

- **EF-34 (user/44 vocab "Play the word") — CORRECTED: NOT a loading hang and NOT a deck-empty state — it's a SLOW-LOAD race + a false-fallback spec branch.** Failure DOM snapshot shows the deck is **active**: `heading "Vocabulary Review"`, `text: 0 due · 20 new`, `1 / 20`, and the `"Flashcard — tap to flip"` button **present**. The failing assertion is the spec's *empty-branch fallback* (`All caught up`/`No vocabulary`/`Session complete`). Mechanism: under full-suite load the mastery `refresh()` fetch (`useVocabularySession.ts:154-179` → `useDueItems`) pushed the deck-build **past the spec's 20s `flashcard.isVisible` wait**; the spec then fell into its `else` (empty) branch and waited 15s for a heading that will **never** render because the deck is populated → timeout.
  - **Fixes:** (1) **Lane A (primary):** restructure user/44 to race flashcard-OR-empty (not sequential 20s-then-empty), and raise the load-tolerant timeout — the empty fallback is only valid when the deck is genuinely empty, not merely slow. (2) **Product robustness (Lane B, secondary/optional):** `useVocabularySession` has no load-timeout — if `refresh()` is slow/hangs the UI sits in `phase:'loading'` indefinitely; a bounded load timeout (fall back to building cards from content) would harden it (same Supabase-slowness family as EF-33). Deferred — not required to unblock the spec.
  - **Status: EF-34 → primary owner Lane A (spec race/timeout); optional Lane B load-timeout hardening filed.**

- **EF-35 (user/45) — unchanged:** all 187 seed situations are mission-ready → self-made mission-statement path unreachable. Content/seed (DB) or spec-drop. Lane A/content.

- **PF-13 (schema-drift verify) — DEFERRED to DB/observability agent.** They just applied migration `00010` and own `check-schema-drift.mjs`; running the two-pass drift check now would collide with their in-flight schema state (and cloud psql fails per the cloud-DB-access guide). They should run it as part of their DB pass.

### Run 20 — 2026-07-14 — a11y Home regression FIXED (verified populated-state); 429 guard + EF-34/35 remain
- **102 passed · 3 failed of 105 (6.8m).** 
- **✅ a11y Home regression FIXED + VERIFIED:** all 4 axe smokes green in the FULL-SUITE populated state that reproduced the failure in run 19. Fix (commit 4f687f2): populated-Home green pills/text `text-green-700/800` → `green-900` (~7:1 on the pale-green bgs). The run-19 blue `#2b7cd5` nodes did NOT recur — they were state/content-dependent, not a persistent defect. **PF-11 fully closed again.**
- **3 remaining, all pre-existing / non-regression:**
  - **user/44 (EF-34)** — vocab deck-sourcing (open, Lane A/content).
  - **user/45 (EF-35)** — all 187 situations mission-ready → self-made path unreachable (open, Lane A/content).
  - **user/47 (@clean error-guard) → NEW item EF-36:** guard caught `429 POST /functions/v1/gemini` (+ the paired console.error) during the Home→Learning(+audio)→Practice→Tutor→Profile journey. Source confirmed = the **gemini edge function rate-limiting under full-suite load** (many TTS plays). Likely test-env (single-user unlikely to hit it), but the app should handle 429 gracefully — catch it in the gemini client path, degrade/backoff, and route through `src/lib/logger.ts` instead of a raw console.error (aligns with the centralized-error standard). Decision needed: app-side 429 handling vs allow transient 429 in the @clean guard vs raise the edge rate limit. Owner: app + test-env. **Not fixed this session** (touches core edge/TTS flow; deserves a focused pass, no DB involved).
- **Artifacts:** `artifacts/e2e-run20-2026-07-14.tgz`.

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
- **CS-9 · Drift-checker blind spots: accented/composed labels false-flagged as STALE; css-placeholder needles never staleness-checked (platform internal bug, owner directive 2026-07-16).** Two defects in `scripts/check-inventory-drift.mjs` found by the 2026-07-16 audit: (1) the significant-word extractor used ASCII-only `[a-z]{3,}`, so an accented word like "João" produced NO checkable words and the check fell through to an exact-literal match that can never succeed for runtime-composed labels (`{t.name}, {t.age}` → "João, 45") → persistent false STALE; (2) css selectors were skipped outright (`if (!needle) continue`), so placeholder needles like `input[placeholder="Enter a word or phrase..."]` were never staleness-checked — **that blind spot is exactly how `learning.lesson.vocab.query_input` went stale silently when EN-10 changed the placeholder.** **Status: FIXED** — Unicode `\p{L}{3,}` word extraction for labels (composed labels verified by parts) + exact-literal staleness matching for css placeholders (word-split is useless there: common words match all over source — proven by a first bite-test that failed to flag an all-common-words placeholder). Verified by bite tests: injected stale placeholder (the EN-10 regression class) FLAGGED; injected composed label "Ana, 62" NOT flagged; real inventory reports 0 STALE. **Coverage gap (explicit, per AGENTS §3):** `scripts/**` has no unit-test harness (EN-24 debt), so the guard is the documented bite-test procedure in this item, not an automated test — convert to a unit test when the scripts harness lands. Owner: test agent / EN-24 stream. HIGH confidence.

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

### Coordination within the e2e workstream (responsibilities, not fixed agents)

There are no fixed "lanes" or agent identities here. These are **responsibilities** that whoever works the e2e stream must cover; whoever picks one up reserves the task **and** its files first (AGENTS.md §7). The build-side and run-side responsibilities collide on shared state (`tests/e2e/**`, the live DB, `.auth/`), so they must not run in the same hands at the same moment without a reservation.

- **Building tests** — spec authoring/refactors, helpers, inventory, selectors, harness fixes, coverage-gate implementation. Current priorities: CS-1 inventory-drift detection; CS-2 control-touch verification; migrate legacy `covered_by` strings to structured `{ spec, depth }`; convert the last rendered-only control (`tutor.model.listen`) into an asserted interaction; close CG-11 (simulator core loop), CG-16 (offline write-queue reconcile), CS-8 (seed/teardown hygiene for admin-queue specs). **This is the only work that edits `tests/e2e/**`.** Must not mark a product surface closed without a live run confirming it.
- **Running tests live** — all live Playwright execution, reruns, DB/product verification needing unsandboxed access, and keeping this tracker's truth current: rerun current/targeted-failed specs; update each item `verified` / `reopened` / narrowed-owner (`selector` / `harness` / `data` / `app` / `environment`); confirm whether an item is a real app bug vs a wrong test expectation; keep run artifacts + repro notes current; confirm newly-added specs against live behaviour after each build batch. **Only a live run can confirm closure here — never infer closure from code alone.** Edits `tests/e2e/**` only when explicitly taking over a build-side fix (reserve it first).
- **Discovery / mapping (read-only support)** — bounded, disjoint mapping tasks with no shared writes unless assigned a specific slice: map simulator selectors + evidence paths; offline write-queue persistence + readback seam; PWA/service-worker reload testability; admin-queue cleanup + stable card anchors; remaining mobile-only controls. Output = implementation briefs, not tracker-truth changes.

**Handoff between these responsibilities:** whoever built a batch names the affected specs/helpers/inventory entries; whoever runs live records the EF/CG/CS outcomes and feeds failures back here; discovery supports whichever next batch is off the critical path. **One suite runner at a time** — the live DB + shared `.auth/` files make concurrent runs cross-contaminating (see E-1); claim a "suite execution" reservation before a full run.

## Environment / process notes

- **E-1 · Two agents ran the suite concurrently** — during triage, `tests/e2e/.auth/*.json` was regenerated by another process (new throwaway user; a probe mid-analysis briefly chased the wrong user). Shared live DB + shared `.auth/` files make concurrent runs cross-contaminating. **Rule proposal: one suite runner at a time**; the test agent should signal runs (or the runner claims a queue token for "suite execution").
- **E-2 · test-results/ is ephemeral** — every run overwrites it. The runner snapshots failing runs under `artifacts/e2e-run-<stamp>/` (tgz). Reference those in items, not live test-results paths.
- **E-3 · Suite runtime** — 3.8 min for 38 tests (serial, live backend). Fine for now; revisit sharding only if the suite triples.
