# Tester Feedback & Support Workstream Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/TESTER-FEEDBACK-TRACKER.md
**Description:** Durable tracker for tester-reported bugs, the support-ticket workstream, and every deferred item in it. Standing rule (owner directive 2026-07-14): nothing is closed by declaring it "not our lane" — every deferral is logged here with owner + next action so it cannot get buried.
**Author:** Lane B (with assistant)
**Created:** 2026-07-14
**Last Updated:** 2026-07-14
**Last Updated By:** Lane B (with assistant)

---

## Status legend
`OPEN` active · `IN PROGRESS` being worked · `DEFERRED` parked-but-tracked (never "dropped") · `DONE` complete/verified · `NEEDS DECISION` blocked on a product/owner call

---

## Tester-reported bugs

### TB-1 — Placement level not reflected + not changeable (reporter: dancingtoothbrush) — `NEEDS DECISION`
- **Report:** "It says I'm Absolute Beginner even though I said I could have a simple conversation, but I can't seem to change it."
- **Root cause (confirmed, code-read 2026-07-14):**
  - Onboarding `complete()` persists placement (`placementLevel` 0/1/2 from "Complete beginner / A few words / Basic conversation") **only to `platform.storage`** (`useOnboarding.ts` OnboardingRecord).
  - Onboarding's `profiles.update` (`useOnboarding.ts:142-148`) writes **only** `has_accepted_terms` + `has_accepted_ai_usage` — it **never writes a level**.
  - Home shows `getLevelName(profile?.unlocked_level || 1)` (`HomeView.tsx:151`) → with `unlocked_level` unset it defaults to **1 = "Absolute Beginner"**, regardless of placement.
  - No post-onboarding UI to change level; `unlocked_level` is access-key/paywall gated (`HomeView.tsx:358` "Enter your access key to unlock Month N+1").
- **Decision needed (owner):** the display conflates two concepts — **paywall `unlocked_level`** vs **proficiency/placement level**. Options:
  - (A) onboarding placement sets `profile.unlocked_level` — simplest, BUT `unlocked_level` also gates paid content, so a free placement choice could unlock paid months. *(verify gating first)*
  - (B) add a separate proficiency/practical-level field driven by placement; Home label reads that; keep `unlocked_level` for the paywall. Cleanest, small migration.
  - (C) keep as-is but add a Settings "change my level" control + write placement→display level.
- **Owed:** decision → fix → **e2e test** (owner asked explicitly for a test). Branch: `develop`. Likely DB touch (coordinate).
- **Status:** OPEN, root cause confirmed, awaiting decision.

### TB-2 — First-words screen speaker/audio button does nothing (reporter: owner) — `DONE (fixed + verified; edge deployed)`
- **Report:** "In the first words screen the speaker button doesn't seem to work when I click it."
- **Root cause (empirical, via the new observability + probes 2026-07-14):** a self-inflicted `obs-trace` regression. The client now sends a W3C `traceparent` request header on every `functions.invoke` (OBSERVABILITY-CONTRACT §8), but `_shared/http.ts` CORS `Access-Control-Allow-Headers` did **not** list `traceparent`. A custom request header triggers a browser CORS **preflight**; the missing allow-entry made every preflight fail → the browser blocked **EVERY edge call** with `FunctionsFetchError` (tts/chat/translate/delete-account/log-sink), not just audio. node/curl were unaffected (no CORS enforcement), which masked it in tests.
- **Evidence:** `public.logs` showed repeated `speech_playback_failed` + `edge_fn_failed {action:tts, FunctionsFetchError}`; a fresh-token node probe returned HTTP 200 + audio (function healthy, ~6.2s); an OPTIONS preflight sending `traceparent` was rejected (allow-headers omitted it).
- **Fix (commit `4fdebc4`, `develop`):** added `traceparent` to `Access-Control-Allow-Headers`; redeployed gemini/delete-account/log-sink to prod. Preflight now echoes `traceparent` (verified live).
- **Follow-up (minor):** the first-words handler swallows a TTS failure as a toast-less WARN — consider a user-visible retry/hint when audio genuinely fails. Tracked as a small nice-to-have.
- **Owed to reach testers:** merge `develop`→`main` + web deploy (edge already live in prod).
- **Status:** DONE (root cause fixed + preflight verified; edge deployed).

### TB-3 — Onboarding resets to step 1 ("Bem-vindo") on browser tab switch (reporter: Nadia Laabs, Chrome) — `DONE (fixed + regression test, on develop)`
- **Report:** "Just by switching tabs on my browser. Then when I go back to the page, it's reset to the beginning." Browser: Chrome.
- **Root cause (confirmed, code-read 2026-07-14):** `useOnboarding`'s hydration effect depended on the **`user` object** (`useOnboarding.ts` `}, [user]`) and calls `setIsLoaded(false)` on every re-run. supabase-js/gotrue refreshes the session on tab-focus (`TOKEN_REFRESHED`) and hands back a **new `user` object** → the effect re-ran → the gate `isLoaded && !isComplete` toggled → the lazy `OnboardingFlow` **remounted to step 1**. Storage read/write (`coerceRecord`, IndexedDB) were correct — it was object-dependency churn (EF-33 family). Not Chrome-specific (standard tab-focus refresh).
- **Fix (commit `b5fd30d`, `develop`):** key the effect on the stable `user?.id` string, not the object — re-hydrate only on real sign-in / user switch.
- **Test (regression, so it can't recur):** `src/features/onboarding/__tests__/useOnboarding.test.ts` — a same-id new `user` object must NOT trigger a second storage read (would fail on the old `[user]` dep); a real id change still does. 2/2 green.
- **Owed to reach testers:** merge `develop`→`main` + web deploy.
- **Status:** DONE (fixed + regression-tested on develop; awaiting promotion).

### TB-4 — Mobile: stuck on first screen after password login, can't scroll (reporter: mobile tester) — `DONE (fixed on develop; regression test owed)`
- **Report:** "Normal process with PW works but then I am stuck on first screen and can't scroll further." **Env: Android 14 (Brave + Chrome, both Chromium) AND a laptop after installing (likely Windows/installed PWA). Fine in a tall macOS browser window.** The cross-platform + installed reproduction ruled out a pure mobile-URL-bar cause.
- **Root cause (confirmed, code-read 2026-07-14) — two compounding issues:**
  1. **PRIMARY (cross-platform flexbox trap):** the onboarding `StepShell` scroll region (`OnboardingFlow.tsx:137`) was `flex-1 overflow-y-auto` **without `min-h-0`**. A flex child defaults to `min-height:auto`, so it grew to its content height instead of scrolling — pushing the `shrink-0` footer (Continue / "Let's go") **below the fold** on ANY short/installed window, every OS. `overflow-y-auto` never engaged. This is why it hit Android AND the installed laptop app but not a tall macOS browser window.
  2. **SECONDARY (mobile only):** the app shell used `h-screen` = `100vh`, which on Chromium/Android includes the URL-bar area, making the shell taller than the visible viewport and worsening (1).
- **Fix (`develop`):** (1) `OnboardingFlow.tsx:137` `flex-1 overflow-y-auto` → `flex-1 min-h-0 overflow-y-auto` (commit `822feb6`) — the real cross-platform fix; (2) app shell `h-screen` → `h-dvh` (commit `9c73629`) — mobile viewport correctness. Both verified: `min-h-0` + `.h-dvh`/`100dvh` generated in the built CSS; build green.
- **Regression test (DELIVERED, commit `03b98d8`):** `tests/e2e/user/52-onboarding-footer-reachable-short-viewport.spec.ts` (`@mobile`, 390×560) asserts the onboarding footer CTA `toBeInViewport()` and advances the flow. `toBeVisible()` would not catch the bug (button stays in DOM, below the fold); `toBeInViewport()` fails pre-fix / passes post-fix. GREEN in e2e Run 22.
- **Owed:** promote (deploy) `develop`→`main` to reach the tester.
- **Status:** DONE (fixed + regression-tested on develop; awaiting promotion).

### TB-5 — Tutor practice session auto-reads every message aloud (reporter: owner) — `OPEN (root cause confirmed; owner decision on default)`
- **Report:** "When I go to the tutor practice session it reads all out loud regardless if I want to or not."
- **Root cause (code-read 2026-07-14):** `isSoundEnabled` defaults to **true** (`useSettings.ts:64` — no saved pref → true). The practice session auto-plays the seeded first message (`useTutorSession.ts:362`) + every AI reply (`:232`, `:393`) via `playMessageInChunks` whenever sound is on. Opt-OUT: a fresh user is read to until they hit Mute (persists in `localStorage.is_sound_enabled`).
- **Fix options (owner decision):** (A) default `isSoundEnabled` false (opt-in); (B) keep mute but STOP auto-reading the transcript — rely on the existing per-message play buttons ("help on demand"); (C) first-run audio choice. Recommend A or B.
- **Owner:** Agent S (`fix/*`). **Status:** OPEN (needs owner default decision).
- **Status:** DONE (fixed on develop; @mobile regression test + deploy owed).

### TB-6 — Onboarding "Say it back" (first-words screen) doesn't listen to what I say (reporter: owner) — `DONE (fixed + regression test on develop, commit a5c9d00; owner picked "make it work")`
- **FIX (2026-07-14, commit `a5c9d00`):** `handleSayItBack` now uses the recognized transcript instead of discarding it. Success echoes what it heard ("Nice — I heard you!" + the transcript) so the learner sees it genuinely listened; `no-speech`/`timeout` offers a **Try again** (not a fake success); `unavailable`/`permission-denied`/`not-implemented` (e.g. Brave/permission) offers an honest **"I said it"** self-confirm. Regression: `src/features/onboarding/__tests__/FirstWinStep.test.tsx` mocks `platform.speech.recognize` and asserts all three outcomes (transcript echoed / retry / honest self-confirm; and NOT the old unconditional "Nice!"). vitest GREEN.
- **Owed:** promote (deploy) to reach testers. (A live-mic manual check on Brave/iOS still worthwhile to confirm the unavailable-path copy.)
- **Report (owner 2026-07-14):** "the 'say it back' button on the your first words screen doesn't really listen to what I say."
- **Root cause (confirmed, code-read — `src/features/onboarding/OnboardingFlow.tsx` `FirstWinStep`/`handleSayItBack` L514):** the say-it-back is **by design a no-op on content** — it calls `platform.speech.recognize({ language:'pt-PT', timeoutMs:6000 })` and **discards the transcript**. On success it does `setSayState('done')`; on **any** error (`no-speech`, `timeout`, `unavailable`, mic-permission) the catch **also** does `setSayState('done')` (comment: "the point is the try, not the score"). Either way it shows *"Nice! You just said your first Madeiran words."* It never compares your speech to "Bom dia!", never echoes what it heard, and never signals failure → so whatever you say (or if nothing is captured) you get the same success message. That is exactly why it "doesn't really listen."
- **Likely compounding (needs live-mic confirm):** on **Brave** (an earlier tester's browser) the Web Speech API is **disabled by default** (Brave blocks Google's speech endpoint), and iOS Safari/WebView `webkitSpeechRecognition` is intermittent (noted in `speech.web.ts` header). In those cases recognition never starts/returns — but the unconditional "Nice!" masks it. `pt-PT` also depends on the browser's server-side model + network + mic permission.
- **Decision needed (product):**
  - (A) **Make it actually listen:** compare the final transcript to the phrase (fuzzy/loose match), echo *"I heard: …"* + a match indicator. Real feedback; heavier (STT reliability varies by browser).
  - (B) **Keep it low-stakes but honest:** if a transcript comes back, show *"I heard: …"*; if recognition is unavailable/empty, say so gently (e.g. *"Couldn't hear that — tap I said it"*) instead of a blanket "Nice!". Copy stops over-promising.
  - (C) Leave behavior, but only show "Say it back" when `platform.speech.isAvailable()` AND a transcript is likely (hide on Brave/unsupported) so it never appears to listen when it can't.
  - Recommend **B** (honest, low effort) as a first step; **A** if we want genuine pronunciation feedback (ties the broader speaking-practice STT).
- **Owed:** decision → fix → regression test (onboarding say-it-back: transcript echoed on success; graceful "couldn't hear" on `no-speech`/`unavailable`, mocking `platform.speech`). Owner: Agent S (`fix/*`) + product decision.
- **Status:** OPEN (root cause confirmed by code-read; a live-mic repro would confirm the Brave/STT-availability angle).

### SW-1 — Admin "all tickets" triage console — `DONE (on develop, unverified in full suite)`
- Built on `develop`, commit `b439439`: admin sees ALL tickets (all statuses), status filter + text search, submitter/date, Reopen for closed. `resolveTicket` widened to accept `open`. tsc + lint clean. e2e `tests/e2e/admin/10-admin-all-tickets.spec.ts` added.
- **Owed before it reaches testers:** full regression (SW-5) → merge `develop`→`main` → deploy (SW-6).

### SW-2 — Data lands in DB (submit + Send Logs) — `DONE (verified by design + e2e)`
- Ticket → `tickets` on submit; diagnostics → `logs` (`event='user_report'`) only on separate "Send Logs" click; the two rows are **not linked**. (Linking is SW-3 scope.)

### SW-3 — Submission enrichment — `DEFERRED (designed, DB-coordinate)`
- Reuse modal + **category** field; **contextual "Report a problem"** entry (pre-fill route + recent errors + correlation_id); structured **environment** capture (browser + device_type — mobile/tablet/desktop — via a `platform.diagnostics.getContext()` adapter). Owner decisions recorded: reuse+category+contextual; global affordance + error-state; single `resolution_note` (not threaded).
- **DB (one batched migration, coordinate with DB/PF-13 agent):** `category`, `updated_at`, `device_type`, `browser_name`, `environment` (jsonb), `resolution_note`.

### SW-4 — Agent skill to view/update tickets — `DEFERRED (design point open)`
- A slash-command/skill so an agent can list + update tickets. **Design point:** needs a DB-access path — no service-role key in local env today (only anon + DB password; cloud psql blocked). Options: mint an admin session (as e2e does), or add a service-role secret path. Decide before building.

### SW-5 — Full regression suite before promotion — `DEFERRED (owed now)`
- Owner asked to run the full suite "once ready." SW-1 is ready; run `npm run test:e2e` on `develop`, triage, before merging to `main`.

### SW-6 — Promote develop→main + deploy — `DEFERRED (after SW-5)`
- Deploy ONLY from the release worktree/main (see INFRA-1). Testers get it after regression is green.

### SW-7 — Support design doc — `DEFERRED (owed)`
- `docs/SUPPORT-TICKETS-DESIGN.md` + `REQUIREMENTS-TRACKER.md` entry capturing SW-1..SW-4, per methodology. Deferred while shipping the critical console first.

---

## Infra / process deferrals

### INFRA-1 — Release WORKTREE (not just branch) + agent instructions — `OPEN (owed this session)`
- Owner directive: use a **release worktree** (separate checkout on `main`, deploys run only there) vs. a shared-branch model, so feature WIP on `develop` can never leak into a deploy. **Owed:** create the worktree + add agent instructions to `AGENTS.md`.

### INFRA-2 — Coverage-inventory the new admin-ticket controls — `DEFERRED (coverage owner)`
- The all-tickets search / status-filter / reopen controls are not in `tests/e2e/control-inventory.json`. Not blocking the current gate (it only fails on inventoried-but-uncovered controls), but they should be inventoried so the crawl-drift check stays honest.

### INFRA-3 — dotfiles template fix push — `DEFERRED (owner/dotfiles)`
- `commit-and-sync` co-author-trailer fix committed locally in `~/.ai-dev-dotfiles` (`238bb82`), unpushed (6 local commits, only 1 mine).

### INFRA-4 — Staging / pre-release deploy — `OPEN (coordinate with other agent)`
- **Staging URL confirmed: `testfalamadeira.searchingfool.com`** (owner, 2026-07-14). Pre-release verify step before prod (`falamadeira.searchingfool.com`).
- Slotted into the release flow (`MULTI-AGENT-WORKFLOW.md` §3/§7): `develop`→`main` → deploy to `testfalamadeira` (staging) → verify → deploy to prod. Runs from the release worktree (on `main`).
- **Owed:** get the deploy mechanism from the other agent (how staging is targeted — flag/`VERPEX_REMOTE_PATH`/separate `.env`); wire `scripts/deploy-verpex.sh` to support both targets; finalize the workflow doc §8. Supabase Auth Site/Redirect URLs must include the staging origin.

---

## Enhancements (future releases — backlog)

### EN-1 — Audio buttons need immediate click feedback (loading/playing state) — `OPEN (backlog, future release)`
- **Report (owner):** clicking any audio icon gives no feedback, so if playback takes a moment a user clicks repeatedly instead of waiting. Add an immediate visual state (spinner / pulsing / disabled-while-loading) on tap.
- **Scope:** app-wide — every audio play control (phrases speaker, Vocabulary "Play the word", Simulator "Play line", Listening, speaking reference, drill audio, tutor/coach TTS). Today playback is fire-and-forget with no DOM "playing" indicator (confirmed in e2e specs 44/45 + `usePractice`/vocab `playText`).
- **Implementation hint:** centralize at the shared audio seam — `src/hooks/useSpeechPlayback.ts` / `geminiService.playSpeech` (resolves when playback STARTS, `onEnded` when it stops) — expose a `status: idle|loading|playing` and a shared `AudioButton` that reflects it + guards double-taps. One change covers all call sites.
- **Owner:** Agent E (`feat/*`). Priority: future release (not blocking). **Status:** OPEN (backlog).

### EN-2 — Local-data transparency + "clear my local data" — `OPEN (backlog, future release)`
- **Report (owner):** a user has no way to see what's stored locally on their device, or to clear/delete it.
- **What exists today:** Settings shows **audio-cache** usage ("Used: X of Y MB") + a **"Clear cache"** button (`handleClearAudioCache`) + a save-audio-on-device toggle. That's the ONLY local data surfaced/clearable.
- **Gap:** the rest of local storage is invisible + unclearable — IndexedDB `KV_STORE` (onboarding record, path selection, mastery/SRS + progress cache, offline sync queue, settings), `localStorage` (prefixed keys), and PWA service-worker caches. No "what's stored" view beyond audio; no "clear all local data / reset device data."
- **Feature:** a "Local data" settings section listing categories + sizes (use `navigator.storage.estimate()` for the total) and a **"Clear local data"** action. **Must warn** that the offline **sync queue** may hold *unsynced* writes (lost on clear); progress/mastery are server-backed (safe to clear when signed in). Keep the existing audio "Clear cache" as one row.
- **Implementation:** `platform.storage` needs `enumerate`/`clear` helpers over `KV_STORE` + `BLOB_STORE` + the `localStorage` prefix + SW `caches`. Fits the "calm, honest, real consent" principle (data transparency).
- **Owner:** Agent E (`feat/*`). Priority: future release. **Status:** OPEN (backlog).

### EN-3 — In-app PWA "update available" prompt — `OPEN (backlog; offered, not yet confirmed)`
- PWA is `registerType: 'autoUpdate'` with no in-app prompt → new versions land silently on next relaunch; testers must fully close/reopen to get a fix. Add a `needRefresh` toast ("New version available — reload") via `useRegisterSW` so updates are visible/one-tap. Owner: Agent E (`feat/*`). Priority: future release.

### EN-4 — In-app "About": release version + release notes — `DONE (built on develop, commit 5f75fc8; awaiting release cut)`
- **DONE (2026-07-14, commit `5f75fc8`):** built per owner ask ("fold it in now"). Settings → **About** shows app name + tagline, running version (`__APP_VERSION__` injected from root `VERSION` via vite `define`), **per-version release notes** parsed from canonical `CHANGELOG.md` (`?raw`), links to Terms/Privacy/AI-Disclosure/Support, credits. Files: `src/features/about/{AboutModal.tsx,changelog.ts,index.ts}`, `vite.config.ts`, `src/vite-env.d.ts`, `SettingsView.tsx`. Regression: vitest parser test + e2e `user/53` (both GREEN, Run 22). **Release-cut still MUST bump `VERSION` + add the `CHANGELOG.md` entry** (hard gate, §7) so About shows the shipped version's notes.
- **Report (owner):** users need to see the release version + release notes in the app (an "About" link or similar).
- **Report (owner, 2026-07-14):** the **macOS window menu-bar "About FalaMadeira" is empty** — owner wants version there + a link to release notes **for each version** (history, not just current).
- **CONSTRAINT / finding (2026-07-14):** on macOS this app is an **installed PWA** — packaging is Capacitor **iOS/Android + web only** (`@capacitor/ios`, no `@capacitor/electron`, no Tauri/Electron macOS target). The native macOS menu-bar "About" is **provided by the browser/PWA shell and CANNOT be populated by our web code.** So the owner ask is delivered as an **in-app About surface**, not the native menu item. (On iOS Capacitor, native app-info is settable separately, but that is iOS, not the macOS menu.) Do **not** promise native-menu content for the PWA.
- **Sources exist:** `VERSION` (CalVer `2026.07.14.1`) + `CHANGELOG.md` are the version + release-notes sources. Version is **not yet exposed to the client at runtime** (vite has a `define:` block but no version define); no About/version UI exists.
- **Feature:** inject the version at build (vite `define` `__APP_VERSION__` from `VERSION`), add an "About" entry in Settings showing version/build + release notes. Render **per-version** history from `CHANGELOG.md` entries (each version's notes), not only the current version, to satisfy the "release notes for each version" ask.
- **Deployment-workflow tie-in (owner ask):** the release cut MUST bump `VERSION` + add a `CHANGELOG.md` entry (release notes) — already in the MULTI-AGENT-WORKFLOW §7 release checklist; About surfaces exactly those. Make the CHANGELOG entry a **hard release gate** so About always shows current notes. (Cross-refs the versioning rollout, TODO #122.)
- **Regression (per §3 methodology):** vitest for the version-define/CHANGELOG parser + an e2e opening Settings → About asserting the current version string + at least one release-notes entry render.
- **Owner:** Agent E (`feat/*`) + release-workflow. Priority: future release (owner may pull into the imminent release — small: vite define + Settings About + CHANGELOG render). **Status:** OPEN (backlog).

### EN-5 — Quiz results: persist + admin visibility + regression — `OPEN (backlog; owner-identified gap)`
- **Gap (confirmed 2026-07-14):** quiz **scores/results are NOT stored** — only pass/fail survives as `profiles.completed_lessons` (score ≥ 3). No score value, per-question data, attempt history, or timestamp; the score doesn't feed the SRS/mastery engine.
- **What IS covered:** completion persistence is regression-tested against the DB — `user/25-learning-quiz-progression-write.spec.ts` asserts `profiles.completed_lessons` is written after a passing quiz; `user/21-quiz-full-flow` covers the UI/scoring flow.
- **No admin visibility:** there is NO admin view of quiz results/scores/completions (admin has only moderation queues + Content Studio).
- **Feature:** (1) store quiz results in a new table (score, lesson/situation id, timestamp, optional per-question) — small DB migration, **coordinate with DB agent**; (2) add an **admin learner-progress / quiz-results view**; (3) e2e asserting the result row is written AND shown in admin; (4) fix the hardcoded `score >= 3` threshold → relative to `questions.length` (a pass ratio); (5) consider feeding results into `applyGrade`/mastery.
- **Owner:** Agent E (`feat/*`) + DB agent (migration) + admin UI. Priority: future release. **Status:** OPEN (backlog).

---

## Cross-references (owned elsewhere, not buried)
- **Versioning rollout** → `aidevops/plans/plan-2026-07-14-versioning-rollout.yaml` (TODO #122).
- **PF-13 schema drift, observability** → other agent (DB).
- **EF-34/35 (Lane A specs), EF-36 (WS2 test-user isolation)** → `docs/E2E-LIVE-RUN-TRACKER.md`.
- **DF1–DF10** (translation slices, gamification celebrate-layer, place-graphics extension) → `REQUIREMENTS-TRACKER.md` §"Deferred/open follow-ups (2026-07-14)".

---

## Compliance / legal notices

### COMP-1 — Data-security, privacy (GDPR) & EU AI Act notices — `OPEN (owner/legal review; owed pre-beta)`
- **Owner directive (2026-07-14):** ensure notices exist for **data security, privacy, and EU AI Act conformance** even where the build doesn't yet support everything (forward-honest; no over-claiming).
- **Foundation:** `src/features/legal/{terms,privacy,ai-use}.ts` + `LegalPage`; onboarding captures `has_accepted_terms` + `has_accepted_ai_usage`. A quick grep found NO explicit coverage of local caching, GDPR data-rights, or EU AI Act transparency — needs a proper read + drafting.
- **Required (careful drafting + likely legal review):** (1) **local-caching disclosure** (owner decided always-cache + inform) → privacy/storage notice + release notes/About (ties EN-2/EN-4); (2) **data security** (TLS, RLS, server-side secrets, retention, contact); (3) **GDPR** (data collected incl. logs w/ correlation IDs, lawful basis, retention, access/erasure — delete-account exists; processors Supabase + Google/Gemini; international transfer); (4) **EU AI Act transparency** — inform users they interact with an AI tutor + that lessons/corrections/chat are AI-generated (Art. 50); confirm risk class (likely limited-risk, confirm w/ counsel); extend `ai-use.ts`.
- **Owner:** owner/Agent D + legal. **Status:** OPEN (owed before real beta testers).

## QA / test hardening

### QA-1 — Offline-audio download tests — `OPEN (Agent T)`
- **(a) Download works:** `src/lib/__tests__/audio-download.test.ts` — mock synthesize + storage; `downloadForOffline(scope)` enumerates the scope's speakable lines, stores a clip each, reports `{synthesized, fromCache}`, respects storage-limit/abort.
- **(b) Survives an app/SW upgrade:** `src/platform/web/__tests__/storage.web.test.ts` — put blobs in the `audio` store at DB_VERSION, reopen at a HIGHER version through the real guarded `onupgradeneeded`, assert blobs persist. Locks the non-destructive migration. (Survival verified SAFE today: IndexedDB is a separate tier from the SW precache; `onupgradeneeded` is create-if-missing; `cleanupOutdatedCaches` sweeps only precache.)
- **Owner:** Agent T. **Status:** OPEN.

## Infra additions (Lane A, 2026-07-14)

### INFRA-4 UPDATE — staging target VERIFIED + gating decided
- **Verified (read-only SSH):** `/home/gomadeir/testfalamadeira.searchingfool.com` EXISTS (created 14:56), empty of app content (only cgi-bin + .well-known), same server/account as prod `/home/gomadeir/falamadeira.searchingfool.com`.
- **Gating decided (owner): SEPARATE APPROVE STEP** — `deploy --target staging` → `deploy --approve` (records approver+time, tied to the staged build hash) → `deploy --target production` (REFUSES without a fresh matching approval). Enforcement MUST live in `deploy-verpex.sh`, not just docs (a checklist is skippable) — so the pre-release step happens no matter which agent runs it.
- **Design:** `--target staging|production` selects `VERPEX_STAGING_REMOTE_PATH` vs `VERPEX_REMOTE_PATH`; guards — staging requires `*testfalamadeira*`, prod requires `falamadeira` AND NOT `testfalamadeira`; bare `deploy` errors (no default). Prereqs: set `VERPEX_STAGING_REMOTE_PATH` in `.env.deploy`; add `https://testfalamadeira.searchingfool.com/**` to Supabase Auth redirect URLs.
- **DONE (code, commit `57062fb` on develop):** `deploy-verpex.sh --target staging|production` + separate `--approve`; production REFUSES unless THIS git commit was staged+approved (enforced in-script, verified — refuses before the transport). npm scripts `deploy:staging`/`deploy:approve`/`deploy:production`; `.env.deploy.example` + `.gitignore` (`.deploy-state.json`) updated.
- **Still owed:** (1) plug staging→approve→prod into AGENTS.md + MULTI-AGENT-WORKFLOW §7/§8 (were locked); (2) operator prereqs — set `VERPEX_STAGING_REMOTE_PATH=/home/gomadeir/testfalamadeira.searchingfool.com` in `.env.deploy`, add `https://testfalamadeira.searchingfool.com/**` to Supabase Auth redirect URLs. **Status:** code DONE; docs + prereqs OPEN.

### INFRA-5 — Per-worktree agent profiles + selective secret provisioning — `DONE (2026-07-14)`
- Model B worktrees need config to "just work". The `.{claude,codex,agy}-w/profiles/falamadeira-dev.json` profiles are PATH-BOUND (startup_repo + scopes hardcode the base `fala_madeira` path), so a worktree at a different path isn't covered; git worktrees also don't carry gitignored files (`.env.local`, `.env.deploy`, `.claude/settings.local.json`, `node_modules`).
- **DONE — `scripts/setup-worktree.sh <role>`** (roles: `feat|support|content|release`). One command per role: creates the worktree on its allowed branch if missing → `npm install` → **generates a PATH-CORRECT `claude-w` profile** for that worktree (solves the path-bound problem generically — profiles are *generated per path*, not hand-maintained) → prints the operator-only secret-copy commands. Idempotent. Launch a role agent with `claude-w --profile falamadeira-<role>-dev`.
- **Profiles generated + verified (2026-07-14):** `falamadeira-{feat,support,content,release}-dev.json` in `~/.ai-dev-dotfiles/.claude-w/profiles/`; all 4 load via `claude-w --profile … --dry-run` and resolve `repo_path` to the correct worktree. Per-role write scopes: feat/support → `src public supabase/functions`; content → `src/content public`; release → worktree root (bump/merge/deploy). `README.md` + `AGENTS.md` edits denied in every role (canonical — edit on `develop` in base).
- **Secret provisioning is OPERATOR-ONLY by design:** the agent harness *hard-denies* agent `cp` of `.env*`. `setup-worktree.sh` therefore PRINTS the exact `cp` lines (`.env.local` to feat/support/content+release; `.env.deploy` to release ONLY — least-privilege) for the operator to run via `!`; it never copies secrets itself.
- **Decision (logged):** the generated profiles are **NOT committed** to `~/.ai-dev-dotfiles` — they are generated artifacts (`setup-worktree.sh` is the committed source of truth), the base `falamadeira-dev.json` was already untracked, and the dotfiles working tree holds other agents' uncommitted changes (not our lane to sweep). If the ai-dev-dotfiles owner later wants them tracked, that's a dotfiles-side task.
- **Deferred (not blocking):** codex-w/agy-w equivalents of the per-role profiles (script currently generates the `claude` platform profile only). Add `--platform` to `setup-worktree.sh` when a non-Claude agent needs a role worktree.
- **Status:** DONE (Claude platform). Committed with `setup-worktree.sh`.

### INFRA-6 — Instantiate the worktree fleet — `DONE (2026-07-14)`
- **Reality verified 2026-07-14 (before):** the fleet was **designed + documented (MULTI-AGENT-WORKFLOW) + enforced (branch guard, staged-deploy gate) but NOT stood up** — `git worktree list` showed ONLY the base `fala_madeira` on `develop`.
- **DONE 2026-07-14 — `git worktree list` now shows all 5:**
  ```
  fala_madeira          develop          # base — Agent D (docs) / T (tests)
  fala_madeira-feat     feat/scratch     # Agent E (rename per task)
  fala_madeira-support  fix/scratch      # Agent S
  fala_madeira-content  content/scratch  # Agent C
  fala_madeira-release  main             # Release (deploy ONLY)
  ```
  (topic branches renamed per task; base stays on `develop`.)
- **Provisioned:** `node_modules` installed in all four new worktrees (`npm install`, exit 0). `.env.local` copied into **feat/support/content AND release** — *refinement of the original line:* release needs `.env.local` because `deploy-verpex.sh` runs `npm run build` (bakes `VITE_SUPABASE_*`); `.env.local` also carries `SUPABASE_DB_PASSWORD`/`SUPABASE_ACCESS_TOKEN`/`GEMINI_API_KEY`. `.env.deploy` (Verpex SSH secret) copied into **`-release` ONLY** (least-privilege — only the release worktree deploys). All `.env*` remain gitignored in every worktree (no commit risk). *Secret copies were run by the operator via `!` — the harness hard-denies agent `cp` of `.env*`.*
- **Verified:** `npm run check:branch` = OK in base/feat/support/content. Release is on `main` and the guard *rule* is satisfied, but **`main` is stale** (at `1d16e6f`, behind `develop`) so it lacks the `check:branch` script + staged-deploy tooling. Those land on the **first `develop`→`main` release cut**, which happens *in* the release worktree before it deploys (MULTI-AGENT-WORKFLOW §7) — so the sequence is self-consistent; not a defect.
- **Still open (rolled into INFRA-5):** `scripts/setup-worktree.sh <role>` automation + per-role launcher profiles so an agent boots knowing its role.
- **Owner:** Lane A. **Status:** DONE (instantiation + provisioning + verification complete).

### EN-6 — Quiz checking: more flexible / AI-driven grading — `OPEN (backlog; owner wants to discuss)`
- **Report (owner 2026-07-14):** quiz checking is too strict. For a **listening** exercise, a missing exclamation mark (or other punctuation/case) should NOT be marked wrong — we're testing listening comprehension, not punctuation. Don't fixate on the wrong things. Wants more flexible matching, potentially **AI-driven**.
- **Direction (to discuss):** (1) **Normalize before compare** (cheap, deterministic, offline): lowercase, strip/relax trailing punctuation + diacritics-optional + collapse whitespace, per exercise type (stricter for spelling drills, looser for listening/meaning). (2) **Fuzzy match** (Levenshtein/token overlap) with a per-mode threshold. (3) **AI-driven semantic grade** (gemini) for open/meaning answers — highest quality, but adds cost/latency + needs the offline/degrade story (ties EN-8 audio-cache + EF-36 quota). Likely layer 1+2 first (covers the punctuation complaint immediately, offline), AI for genuinely open answers.
- **Scope note:** grading logic lives across the quiz/practice graders (`src/components/Quiz.tsx`, practice `speaking`/`vocabulary` accuracy). A shared, per-mode "answer match" policy would centralize this.
- **Owner:** Agent E (`feat/*`), product to define tolerance per mode. **Status:** OPEN (backlog; discuss).

### EN-7 — Offline/background downloads must be modular + resilient — `OPEN (backlog)`
- **Report (owner 2026-07-14):** downloads should be more modular, at least in the background — otherwise they "just totally fail all the time" (a single large/all-or-nothing download is fragile).
- **Direction:** chunk downloads into small independently-retryable units (per pack/lesson/asset), with per-unit progress + resume, exponential-backoff retry, and partial-success (a failed unit doesn't fail the whole batch); run in the background (service worker / Capacitor background) so a dropped connection resumes rather than restarts. Surface per-unit state in the offline UI. Ties EN-8 (audio assets are the bulk of download weight) and QA-1 (offline-audio tests).
- **Owner:** Agent E (`feat/*`). **Status:** OPEN (backlog).

### EN-8 — Pre-generate + server-host audio (cache tiers) to cut Gemini cost — `OPEN (backlog; investigate)`
- **Report (owner 2026-07-14):** rather than every user hitting Gemini TTS, pre-generate the audio for content phrases and **store it on our server** (Verpex), so the client only calls Gemini when the audio is missing from (a) device cache, then (b) our server. "Reduce cost — right?"
- **Assessment (yes, likely a large cost + reliability win):** content phrases are a FINITE, mostly-static set → generating each once and serving a static file is far cheaper than regenerating per user per play, and it removes the per-play Gemini dependency (directly mitigates the 429/503 quota pain behind EF-36 / user/47). Lookup order: **device cache → our server (CDN/static) → Gemini (generate, then persist to server + device)**. 
- **Design sketch:** a build/admin step renders TTS for every content phrase to audio files keyed by a stable hash (text+voice+lang), uploads to Verpex (or Supabase Storage) under a versioned path; client `playText` checks IndexedDB cache → fetches the hashed URL (200 → cache + play) → on 404 falls back to the gemini edge fn, then writes the result back. Ties EN-7 (these files are what gets downloaded for offline) + the audio-cache already in `src/lib/audioCache.ts`.
- **Trade-offs to investigate:** storage/CDN cost vs TTS savings (favorable for static content); cache invalidation on content/voice change (hash key handles it); which store (Verpex static vs Supabase Storage vs a CDN); pre-generation pipeline ownership.
- **Owner:** Agent E (`feat/*`) + ops (storage/pipeline). **Status:** OPEN (backlog; investigate).

## Auth & security backlog (owner-requested 2026-07-14)

### AUTH-1 — Stronger sign-in: MFA + magic link + human (bot) verification — `OPEN (backlog)`
- **Report (owner):** want MFA, magic-link sign-in, and a way to verify a human (not a machine) is signing up/in. Owner has **mail services on the Verpex server** (where the site is hosted) that "just need to get set up." Backlog for now; assemble suggestions.
- **Current state (verified in code, `src/features/auth/AuthScreen.tsx`):**
  - Password sign-in (`signInWithPassword`), signup with email-confirmation (`signUp`, `emailRedirectTo`), and a `skipVerification` fast-path. ✓
  - **Magic link ALREADY IMPLEMENTED** (`handleMagicLink` → `signInWithOtp`) and password-reset email-OTP (`resetPasswordForEmail` → `verifyOtp type:'recovery'`). ✓ — so magic link is not net-new; it is almost certainly **blocked on email delivery**: Supabase's built-in SMTP is heavily rate-limited (~a few/hour) and not production-grade, so links/OTPs are unreliable or land in spam.
  - **No MFA** (no `auth.mfa.enroll`). **No CAPTCHA / bot gate.** — both net-new.
- **Prerequisite (do first): custom SMTP = the Verpex mail server.** Configure it in Supabase → Auth → SMTP. Unblocks magic link, email OTP, signup confirmation, password reset at real volume. **Deliverability is the actual work:** set SPF + DKIM + DMARC for the sending domain or Gmail/Outlook will spam-folder or reject. Use a dedicated `no-reply@…` mailbox. This is a config/ops task (Supabase dashboard + Verpex DNS), not app code.
- **Suggestions (layered, defense-in-depth; all Supabase-native):**
  1. **Human verification → Cloudflare Turnstile** (free, privacy-friendly, often invisible) or hCaptcha — **both natively supported by Supabase Auth**. Enable in Auth settings + add the client widget on signup/sign-in/magic-link; Supabase verifies the token server-side. Recommend **Turnstile**. Lowest-friction bot gate; strongest single win against automated signup abuse. Email double-opt-in (already present) is a weak secondary filter.
  2. **Magic link / email OTP** — already coded; just needs SMTP (step above). Reduces password reuse / credential-stuffing. **PWA caveat:** a magic link opens in the default browser and may not return to the *installed* PWA/iOS Capacitor context — needs redirect/deep-link handling and testing on installed app + iOS (universal links). Prefer **6-digit email OTP** over click-link for installed apps to sidestep the deep-link problem.
  3. **MFA → TOTP (authenticator app)** via `auth.mfa.enroll({ factorType: 'totp' })` + challenge/verify. **Free, strongest, no SMS cost, no SMTP dependency.** Offer optional enrollment in Settings; generate recovery codes; define an admin reset path. (SMS/phone MFA needs a paid provider — Twilio/MessageBird — skip for now.) Email-OTP step-up is a lighter alternative for sensitive actions once SMTP is live.
- **Sequencing:** (0) Verpex SMTP + DNS auth records → (1) Turnstile bot gate → (2) magic-link/email-OTP usable → (3) optional TOTP MFA. Each independently shippable.
- **Cross-refs / considerations:** CAPTCHA vendor + email processor are new sub-processors → update GDPR/privacy disclosures (ties EN-4 legal/`ALL-COMP-1`). Turnstile is more privacy-friendly than hCaptcha for EU. Per §3 methodology each stage ships with tests (e2e: bot-gate present on auth; magic-link/OTP happy path against a test inbox; MFA enroll+challenge).
- **Owner:** Agent E (`feat/*`) + ops (SMTP/DNS). Priority: backlog. **Status:** OPEN.
