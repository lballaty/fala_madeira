# Tester Feedback & Support Workstream Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/TESTER-FEEDBACK-TRACKER.md
**Description:** Durable tracker for tester-reported bugs, the support-ticket workstream, and every deferred item in it. Standing rule (owner directive 2026-07-14): nothing is closed by declaring it "not our lane" — every deferral is logged here with owner + next action so it cannot get buried.
**Author:** Lane B (with assistant)
**Created:** 2026-07-14
**Last Updated:** 2026-07-14
**Last Updated By:** Lane B (with assistant)

---

## Status legend
`OPEN` active · `IN PROGRESS` being worked · `DEFERRED` parked-but-tracked (never "dropped") · `DONE` complete/verified · `NEEDS DECISION` blocked on a product/owner call · `NEEDS REQUIREMENTS` captured from feedback but **not buildable** until a written spec is drafted AND owner-approved (AGENTS §3 requirements gate — no coding before then)

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

### TB-7 — App restarts onboarding (and re-asks Terms) on every login instead of continuing (reporter: owner, staging 2026-07-14) — `FIXED on develop (092605b); staged in 2026.07.14.3 — awaiting owner staging-verify + prod approve`
- **Report (owner, verifying staging `2026.07.14.2`):** "why does it start all over every time you log in even if you have already been signed up… where you were last time should persist… it asks again for terms of service which you already answered." Broadened by owner to a general app requirement: returning users must continue, not restart; config/choices/progress/results must persist and be recalled; expect interruptions mid-flow.
- **Root cause (confirmed by code-read):** the onboarding gate in `src/App.tsx:244` renders `OnboardingFlow` whenever `onboarding.isLoaded && !onboarding.isComplete`. `isComplete` comes from `useOnboarding` (`src/features/onboarding/useOnboarding.ts`), which reads the completion flag + placement level **only** from client `platform.storage` (`storageKeyFor(userId)` → `onboarding:record:<userId>`, `useOnboarding.ts:57,113`). **This flag is never written to the DB** (the hook's own header, L4-9, documents that `profiles` has no onboarding-complete/placement column). So on any context where that client record is absent — **new device/browser, cleared site data, private/incognito, or IndexedDB+localStorage unavailable → in-memory fallback lost on reload** — `isComplete=false` and the FULL first-run flow re-runs. Consent is re-asked because the flow is gated by this client-only flag and never consults `profiles.has_accepted_terms` (already `true` in the DB) to skip the consent step. `signOut`/`onLogoutCleanup` (`src/App.tsx:207`) does NOT wipe the record, so same-device logout→login *should* persist — **needs empirical confirmation** whether staging hits the IndexedDB→memory fallback (which would explain "every login").
- **Broader interruption gap (same requirement, from the flow map):** Daily Session (`useDailySession`), every Practice engine, Quiz (`PracticeQuiz`), Tutor free-chat + AI-Practice (`useTutorSession`), and Learning modal drafts hold progress in **component memory only** → lost on tab-switch/reload. Last-active tab is not persisted (always boots to Home, `App.tsx:79`).
- **Fix direction (see DF11 + docs/USER-WORKFLOWS-AND-STORIES.md):** persist onboarding-complete + placement to a `profiles` column and gate on the DB signal (client mirror as fallback); short-circuit already-answered steps from existing DB state (consent, active track); restore last route on login; persist resumable state for interruptible flows.
- **Owner:** Agent S / E (`fix/*` for the gate; broader persistence is an E feature). **Severity:** HIGH — re-consent-every-login is also a consent-integrity smell.
- **FIX (2026-07-14, commit `092605b` on `develop` via merge `b6fcde3`; staged in release `2026.07.14.3`, commit `6d1ece9`):** `useOnboarding.isComplete` now = `record.complete || (profile.has_accepted_terms && profile.has_accepted_ai_usage)`. Consent is the terminal onboarding step, so the DB consent flags prove prior completion — a returning user skips the ENTIRE first-run flow on any device and is never re-asked Terms. A heal effect writes the local mirror once so it never flashes again on that device. Regression tests added in `useOnboarding.test.ts` (skip-with-consent + heal; still-gate-genuine-new-user); 194 unit tests green; lint + build clean.
- **Scope of this fix vs DF11:** this closes the "restart + re-consent every login" symptom (the reported bug). The BROADER continuity work stays open under **DF11**: persist onboarding-complete/placement to a `profiles` column (so placement survives too — ties TB-1), restore last-active tab/route, and make interruptible flows (Daily Session, Practice engines, Quiz, Tutor) resumable. Also still worth an empirical check whether same-device re-login was hitting the IndexedDB→memory fallback.
- **Status:** FIXED on develop, staged in 2026.07.14.3. **OWNER-CONFIRMED on staging 2026-07-14** ("TB-7 seems to be fixed"). Awaiting prod promotion (bundled with the rest of `2026.07.14.3`).

### TB-8 — Daily voice/audio limit shows the default (5), not the configured global (20); config is hard to find; must persist (reporter: owner, staging 2026-07-14) — `OPEN (partially diagnosed)`
- **Report (owner):** "can't find where to configure the max per-user audio limit — it seems to be set to 5 but I recall setting it to 20 — this must also persist."
- **Verified in the live DB (2026-07-14, pg direct):** `global_settings.voice_limit = "20"` — **the setting DID persist server-side.** `profiles.voice_limit` is NULL for all users (no per-user override).
- **Enforcement path (code):** `useTutorSession.ts:247` `const limit = profile?.voice_limit ?? globalVoiceLimit` — with per-user null, the effective limit is `globalVoiceLimit`, which `useSettings.ts:304-321` loads from `global_settings.voice_limit` on mount. RLS is not the blocker (`global_settings` SELECT policy = "readable by all", `qual: true`, verified). So a correctly-loaded client should show/enforce **20**.
- **The "5" is the client-side default** (`config.voice.defaultDailyVoiceLimit: 5`), used as the initial state before the async fetch resolves (`useSettings.ts:70-73`, seeded from `localStorage` or 5). Suspected causes (need a repro on the owner's session): (a) the mount fetch not populating/overwriting before the value is read/displayed (timing), or (b) a stale `localStorage 'global_voice_limit'` = 5 shown first. Persistence server-side is fine; the **client load/reflection** is the bug.
- **Discoverability:** the only UI to change it is the "Global Voice Limit" +/- control in Settings, gated behind **admin mode** (`SettingsView` `isAdminMode && profile?.role === 'admin'`). That is why it's "hard to find." Also note it's a **global** (all-users) limit despite reading like a per-user one — the label/UX should clarify.
- **UPDATE (2026-07-14): client data path VERIFIED WORKING.** Querying `global_settings?key=eq.voice_limit` with the **anon key exactly as the app does** returns `HTTP 200` + `value:"20"`. So the fetch/RLS/data are fine — the "shows 5" the owner saw was most likely a **pre-fetch flash** (initial state seeds from localStorage-or-default 5 before the async fetch applies 20) or a **stale/older build** (owner first hit this on `2026.07.14.2`). **Action:** owner to re-check the limit on the current staged `2026.07.14.3` — it should read 20.
- **Fix direction (hardening, small):** (1) make the fetch observability-compliant — it currently swallows errors (`const { data } = …`, no logging, doctrine violation); switch to `.maybeSingle()` + log failures with correlation, and seed initial state from the fetched value rather than a localStorage-first default so a stale local 5 can't mask the server value; (2) surface the effective limit read-only to ALL users (discoverability — see EN-11). Ties DF11.
- **Superseded/expanded by owner (2026-07-14):** the limit must be **per-user (primary) + global default**, plus **rate limiting for DoS protection** — see **EN-11** (limit tiers) and **SEC-1** (rate limiting). Those are the substantive work; TB-8 itself is now just the minor client-hardening above.
- **Owner:** Agent E/S. **Status:** OPEN — data path verified; only client hardening + re-verify remain here (the real feature is EN-11 + SEC-1).

### TB-9 — Offline audio doesn't appear to be saved (reporter: owner, staging 2026-07-14) — `OPEN (needs repro)`
- **Report (owner):** "it doesn't appear that audio is saved."
- **Code facts (verified):** playback goes through `synthesizeCached` (`geminiService.ts:309-335`), which on a cache miss **always** writes the clip to the IndexedDB bounded-LRU (`audioCache.set`) — there is **no** gate on the "Save audio on device" toggle (matches the owner "always cache" decision). So under normal conditions audio *is* persisted on play. `saveAudioOnDevice` defaults ON (`useSettings.ts:96-99`); turning it OFF clears the cache (`useSettings.ts:138`).
- **Suspected causes (need a repro on the owner's browser):** (a) the Settings "Used: X MB" display refreshes only after cache-mutating *actions*, not after ordinary plays (`useSettings.ts` `refreshCacheUsage`), so it can read 0/stale → *looks* unsaved though it isn't; (b) IndexedDB unavailable on the test browser (private mode / storage blocked) → `platform.storage` falls back to **in-memory** (lost on reload) — the same fallback flagged for TB-7; (c) the "Download all for offline" action failing. 
- **Diagnostic plan:** repro on the owner's browser; check `public.logs` for `tts_cache_*` / storage errors; confirm whether the browser has IndexedDB; verify the usage display updates after a play and after a download. Ties **QA-1/QA-1b** (download + survive-SW-upgrade tests) and the caching disclosure (COMP-1). Owner: Agent E/T. **Status:** OPEN (needs repro to localize display-vs-persistence).

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

### SW-8 — Lesson-correction review queue: low-value rows, approve/reject is a no-op, no format guidance, no bulk actions — `OPEN (owner-reported 2026-07-14)`
- **Report (owner):** correction review items give very little info; unclear what checking approved vs not-approved does; the submission modal needs format guidance ("has … xyz but should have zdef …"); need **bulk approve + bulk reject**. **Approve semantics (owner): approving a correction should end up as a support ticket to be followed up.**
- **Findings (code-read 2026-07-14):**
  - **Data model** (`src/types.ts:134`): `lesson_corrections` = a single free-text `correction_text` + `lesson_id` / `user_id` / `status` / `created_at`. No structured "current vs should-be" → that's why rows carry so little.
  - **Approve/reject** (`useAdminQueues.ts` `resolveCorrection`): ONLY flips `status` → `approved`/`rejected` via an RLS `UPDATE`. **No** content change, **no** ticket, **no** notification. That is the entire effect — hence "unclear what happens": functionally almost nothing.
  - **Submission** (`src/features/learning/CorrectionModal.tsx`): placeholder is just "Describe the correction needed…" — no format guidance.
- **Scope to build:**
  1. **Approve → create a support ticket (owner-defined follow-up):** on approve, insert a `tickets` row (category=content/correction; body = the correction text + lesson reference + submitter; status=open) so it lands in the all-tickets triage console (SW-1) and gets followed up. Set correction `status=approved`. Reject → `status=rejected` (+ optional reason; consider notifying the submitter). **Confirmation + explanatory copy** so the admin knows what each button does.
  2. **Richer queue rows:** resolve `lesson_id`→lesson **title**, show submitter, timestamp, the full `correction_text`, and a deep-link to the lesson.
  3. **Submission format guidance:** structured prompt — "What does it say now?" + "What should it say?" with an example ("e.g. shows 'bom dia' but should be 'Bom dia!'"). Cheap: two client-side fields + example placeholder. Richer: add `original_text` / `suggested_text` columns (DB migration).
  4. **Bulk approve / bulk reject:** multi-select checkboxes + bulk actions on the corrections queue (extend the pattern to the other queues).
- **Constraints:** the approve→ticket insert and any schema change are **DB writes** → coordinate with the DB-owning agent (Lane B does not write DB). The admin-UI rows/bulk-actions and the submission-modal guidance are client-side.
- **Owner/lane:** Agent S/E (admin + submission UI) + DB agent (ticket-on-approve + optional structured columns) + content (what "followed up" resolves to). Priority: owner to sequence. **Status:** OPEN.

### CS-1 — Content Studio is unexplained: jargon, no purpose, raw-JSON editing — `NEEDS REQUIREMENTS (then owner approval before any coding)`
- **Report (owner 2026-07-14):** not clear what Content Studio does / what it's for / what to expect; **"nobody knows what a content pack is"** (same for *situation*, *track*, *enrichable field* — unexplained jargon); "and so on". Raw-JSON editing is opaque.
- **Findings (code-read):** Content Studio (`src/features/admin/ContentStudio.tsx` + `useContentStudio.ts`) is the admin authoring loop over the modular content model (**packs → situations → tracks**): load packs incl. drafts → edit scalar fields + nested enrichable fields (`phrase_patterns`/`vocabulary`/`cultural_notes`) as **JSON textareas** → validate (schema) → **publish** (upserts the versioned pack + re-projects `situations`/`tracks`, migration 00006, stamps version/checksum/status). Ref `docs/CONTENT-ARCHITECTURE.md §8`. There is **no in-tool explanation** and domain terms are undefined in the UI.
- **Direction (NOT a build order yet):** in-tool purpose/explainer + a plain-language **glossary** of domain terms; friendlier **structured editing** instead of raw JSON; empty-state guidance. → Needs a **written spec + owner approval before coding** (AGENTS §3 requirements gate).
- **Owner/lane:** Agent D/E (spec) → owner approval → Agent E build. **Status:** NEEDS REQUIREMENTS.

### CS-2 — Wire Content Studio into the correction follow-up (SW-8) — `NEEDS REQUIREMENTS (then owner approval before any coding)`
- **Gap:** the correction approve→ticket flow (SW-8) has no link to *where the fix is actually applied* (Content Studio). Define how an approved correction/ticket routes an editor to the relevant situation in Content Studio and back to closing the ticket. Depends on SW-8. → Needs a written spec + approval before coding.
- **Owner/lane:** Agent E + content, after SW-8. **Status:** NEEDS REQUIREMENTS.

---

## Infra / process deferrals

### INFRA-1 — Release WORKTREE (not just branch) + agent instructions — `OPEN (owed this session)`
- Owner directive: use a **release worktree** (separate checkout on `main`, deploys run only there) vs. a shared-branch model, so feature WIP on `develop` can never leak into a deploy. **Owed:** create the worktree + add agent instructions to `AGENTS.md`.

### INFRA-2 — Coverage-inventory the new admin-ticket controls — `DEFERRED (coverage owner)`
- The all-tickets search / status-filter / reopen controls are not in `tests/e2e/control-inventory.json`. Not blocking the current gate (it only fails on inventoried-but-uncovered controls), but they should be inventoried so the crawl-drift check stays honest.

### INFRA-3 — dotfiles template fix push — `DEFERRED (owner/dotfiles)`
- `commit-and-sync` co-author-trailer fix committed locally in `~/.ai-dev-dotfiles` (`238bb82`), unpushed (6 local commits, only 1 mine).

### INFRA-4 — Staging / pre-release deploy — `DONE (2026-07-14) — first live run needs the develop→main release cut`
- **Staging URL confirmed: `testfalamadeira.searchingfool.com`** (owner, 2026-07-14). Pre-release verify step before prod (`falamadeira.searchingfool.com`).
- Slotted into the release flow (`MULTI-AGENT-WORKFLOW.md` §3/§7): `develop`→`main` → deploy to `testfalamadeira` (staging) → verify → deploy to prod. Runs from the release worktree (on `main`).
- **DONE:** deploy code (staged two-target + approve gate, `57062fb`); workflow docs §3/§7/§8 (`a876082`); deploy mechanism (`deploy-verpex.sh --target staging|production`, reads `VERPEX_STAGING_REMOTE_PATH`, validates the dir contains `testfalamadeira`).
- **DONE — Supabase Auth redirect URLs (via Management API, 2026-07-14, verified):** `uri_allow_list` now = `https://testfalamadeira.searchingfool.com/**,https://falamadeira.searchingfool.com/**`.
  - **Discovery (logged):** before this change `uri_allow_list` was **empty** — so **production was ALSO not allow-listed**. Added prod alongside staging (its own origin — clearly correct, non-destructive). Current email/password auth uses no redirect, which is why the empty list never surfaced; magic-link/OAuth (AUTH-1) on any env would have failed.
  - **DONE — `site_url` set to `https://falamadeira.searchingfool.com`** (owner decision 2026-07-14; was `http://localhost:3000`). To preserve local-dev auth after moving `site_url` off localhost, `http://localhost:3000/**` was added to `uri_allow_list`. Final `uri_allow_list` = `https://testfalamadeira.searchingfool.com/**,https://falamadeira.searchingfool.com/**,http://localhost:3000/**`. All verified via read-back.
- **DONE — `VERPEX_STAGING_REMOTE_PATH`** appended to base `.env.deploy` (operator, via `!`) and copied into the release worktree's `.env.deploy` (both verified present).
- **DONE — pipeline verified end-to-end via dry-run (2026-07-14):** `deploy-verpex.sh --target staging --dry-run` resolves to `…/testfalamadeira.searchingfool.com`; `--target production --dry-run` resolves to `…/falamadeira.searchingfool.com` (target/dir guards correct); dry-run is credential-free + no network. Production-gate ordering confirmed in code — the "not staged+approved" `die` (lines ~200-210) fires **before** the rsync transport (~238), so a real prod deploy refuses before any upload.
- **⚠️ First LIVE staged deploy requires the first `develop`→`main` release cut.** `main` (release worktree) is stale (`1d16e6f`) and still has the OLD `deploy-verpex.sh` with no `--target` (verified: 0 refs on main vs 12 on develop; `57062fb` not yet an ancestor of `main`). The new script reaches `main` when the Release role merges `develop`→`main` in the release worktree (MULTI-AGENT-WORKFLOW §7) — which is the step *before* it deploys, so the sequence is self-consistent. Until that cut, dry-run/verify from the base worktree (on `develop`) only.

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

### EN-7 — Offline/background downloads must be modular + resilient (granular chunks) — `OPEN (HIGH PRIORITY — owner escalated 2026-07-14)`
- **Report (owner 2026-07-14):** downloads should be more modular, at least in the background — otherwise they "just totally fail all the time" (a single large/all-or-nothing download is fragile).
- **Report (owner, escalation 2026-07-14):** the current download granularity is **per-level (the 7 levels)**, and "the downloads are too big this way and they timeout and fail." Wants **more granular parts** than whole-level. High priority.
- **Current state (verify in code):** the Settings offline download offers "Download all" / per-track(level) downloads (`SettingsView` offline section + `src/lib/audio-download.ts`). Each level bundles all its situations' audio → large payload → single long-running fetch that times out on slower connections with no resume.
- **Direction:** chunk downloads into small independently-retryable units — **finer than a level** (per situation / per lesson / per asset), with per-unit progress + resume, exponential-backoff retry, and partial-success (a failed unit doesn't fail the whole batch); run in the background (service worker / Capacitor background) so a dropped connection resumes rather than restarts. Surface per-unit state + let the user pick sub-level scopes. Ties EN-8 (pre-generated/server-hosted audio is the bulk of weight — hashed per-asset URLs make per-asset download natural) and QA-1/QA-1b (offline-audio + survive-upgrade tests). Directly reduces timeout/failure risk the owner is hitting.
- **Owner:** Agent E (`feat/*`). **Status:** OPEN (HIGH PRIORITY — timeouts are actively failing for the owner).

### EN-8 — Pre-generate + server-host audio (cache tiers) to cut Gemini cost — `OPEN (backlog; investigate)`
- **Report (owner 2026-07-14):** rather than every user hitting Gemini TTS, pre-generate the audio for content phrases and **store it on our server** (Verpex), so the client only calls Gemini when the audio is missing from (a) device cache, then (b) our server. "Reduce cost — right?"
- **Assessment (yes, likely a large cost + reliability win):** content phrases are a FINITE, mostly-static set → generating each once and serving a static file is far cheaper than regenerating per user per play, and it removes the per-play Gemini dependency (directly mitigates the 429/503 quota pain behind EF-36 / user/47). Lookup order: **device cache → our server (CDN/static) → Gemini (generate, then persist to server + device)**. 
- **Design sketch:** a build/admin step renders TTS for every content phrase to audio files keyed by a stable hash (text+voice+lang), uploads to Verpex (or Supabase Storage) under a versioned path; client `playText` checks IndexedDB cache → fetches the hashed URL (200 → cache + play) → on 404 falls back to the gemini edge fn, then writes the result back. Ties EN-7 (these files are what gets downloaded for offline) + the audio-cache already in `src/lib/audioCache.ts`.
- **Trade-offs to investigate:** storage/CDN cost vs TTS savings (favorable for static content); cache invalidation on content/voice change (hash key handles it); which store (Verpex static vs Supabase Storage vs a CDN); pre-generation pipeline ownership.
- **Owner:** Agent E (`feat/*`) + ops (storage/pipeline). **Status:** OPEN (backlog; investigate).

### EN-9 — Sign out must be in the nav sidebar (always available), not only on the Profile page — `OPEN (HIGH PRIORITY, owner-requested 2026-07-14)`
- **Report (owner, staging 2026-07-14):** "Sign out should be available in the navigation sidebar near the bottom at all times, not just in the Profile at the bottom of the page." High priority.
- **Current state (verified in code):** the only Sign Out control lives in **`src/features/settings/SettingsView.tsx:616`** (a red "Sign Out" button at the bottom of the Profile tab). To sign out, a user must navigate to Profile and scroll to the bottom. The desktop sidebar (`src/components/Sidebar.tsx`, `hidden md:flex md:flex-col`, L52) renders nav items in a `flex-1` `<nav>` and does **not** currently receive or render a logout control.
- **Fix direction:** add a persistent Sign Out control pinned at the **bottom of the desktop sidebar** (below the `flex-1` nav, above `safe-area-bottom`), wired to the existing `handleLogout` — thread `handleLogout` into `SidebarProps` from `App.tsx` (already available there, `App.tsx:88`). Keep the Profile-page control too (or make the sidebar one the primary). **Mobile note:** the sidebar is desktop-only (`md+`); the mobile bottom tab bar has no room for a sign-out — decide the mobile affordance separately (e.g., a small header action, or keep Profile-page sign-out on mobile). Reuse the same red-text styling + confirmation behavior as the current button; no new logout logic.
- **Owner:** Agent E (`feat/*`) or S. Small, self-contained UI change + prop threading + a test asserting the sidebar sign-out calls `handleLogout`. **Status:** OPEN (HIGH PRIORITY).

### EN-10 — Vocab lookup: bidirectional (PT↔EN) + diacritic-insensitive/fuzzy + inventory-first search — `OPEN (owner-requested 2026-07-14)`
- **Report (owner):** the vocab link/modal should accept **either** a Portuguese **or** an English word and translate in **either direction** (not just a Portuguese-only field); search should **not fixate on diacritics** (find close matches, not only exact); and — the open question — should the search be AI-driven, or do we have the app's vocabulary inventoried and searchable somewhere?
- **Answer to the question (investigated 2026-07-14):**
  - **Current lookup is purely AI-driven, one-directional.** `handleVocabLookup` (`useLessonModals.ts:153`) → `geminiService.translateWord` → `gemini` edge `action:translate`, whose prompt is hardcoded **PT→EN** (`supabase/functions/gemini/index.ts:131`). No fuzzy/diacritic handling (free-text LLM call). Modal is a single field, copy says "Type any Portuguese word…" (`VocabLookupModal.tsx:80,139`).
  - **The vocabulary IS inventoried as structured data.** Situations (and lessons) carry `vocabulary: VocabularyItem[]` = `{ word: PT, translation: EN }` (`src/content/schema.ts:234`; e.g. `{word:'café',translation:'coffee'}`), stored BOTH bundled client-side (`src/content/packs/*`) AND in the DB content model (`situations.vocabulary` jsonb, migration `00006`; `lessons.vocabulary` jsonb, `00001`). It's a **finite curriculum set** — it does NOT cover arbitrary words or dynamic tutor-generated text.
- **Recommended design — HYBRID, inventory-first:**
  1. **Build a searchable vocab index** from the inventoried `{word, translation}` pairs (bundled content is enough for offline; optionally union with DB content for authored packs). Both directions indexed.
  2. **Bidirectional:** accept either language; match against PT `word` OR EN `translation`; return the other side + example. Relabel the modal field ("Portuguese or English word") and drop the PT-only copy.
  3. **Diacritic-insensitive / fuzzy:** normalize query + keys (lowercase, strip diacritics via `NFD`+combining-mark removal, collapse whitespace); match on normalized equality first, then a bounded Levenshtein/token-overlap threshold (per length) for "close" hits. Cheap because the set is finite + offline.
  4. **AI fallback (misses only):** for words not in the inventory, call Gemini — but update the edge `translate` prompt to **auto-detect input language** and translate the appropriate direction (today it assumes PT input). Online-only; inventory search works offline.
- **Open decisions:** index source (bundled-only vs union with DB content); whether to add a dedicated searchable `vocabulary` view/table for server-side search (vs client-side over bundled content); fuzzy threshold tuning. Ties DF2–DF5 (translation strategy), EN-8 (audio hosting), and the shipped `TranslatableText` primitive.
- **Owner:** Agent E (`feat/*`). Test: unit-test the normalize+fuzzy matcher (diacritics, either-direction, close-but-not-exact) + AI-fallback-on-miss. **Status:** OPEN.

### EN-11 — Voice-practice limit: per-user (primary) + global default, configurable & visible — `OPEN (owner-requested 2026-07-14)`
- **Report (owner):** "the limit should be a per-user limit not just global, but global can also be there."
- **Current state (code):** enforcement already supports the precedence — `useTutorSession.ts:247` `const limit = profile?.voice_limit ?? globalVoiceLimit`. So **per-user overrides global** already at the enforcement layer. What's missing: (a) `profiles.voice_limit` is NULL for everyone and there is **no UI to set a per-user limit**; (b) the only editable control is the **global** limit, hidden behind admin mode (`SettingsView`); (c) users can't see their own effective limit.
- **Direction:** (1) admin UI to set a **per-user** `voice_limit` override (e.g. from the admin console / a user's profile), falling back to the global default when null — the enforcement precedence is already correct; (2) surface the **effective** limit (per-user if set, else global) read-only to each user; (3) clarify labels ("your daily voice limit" vs the admin "global default"); (4) keep `subscription_tier==='unlimited'` and `role==='admin'` bypasses as-is. Ties TB-8 (client hardening) + AUTH/monetization (tiers). 
- **Owner:** Agent E (`feat/*`) + admin console. Test: enforcement precedence (per-user beats global; null falls back), effective-limit display. **Status:** OPEN.

### EN-12 — Admin log viewer: CLI / in-app admin page / separate admin subapp over `public.logs` — `OPEN (owner-requested 2026-07-14)`
- **Report (owner):** view logs via a CLI interface (not the normal UI) — in admin mode click a link to open a CLI-type, menu-driven (or agent-assisted) interface to examine logs; alternatively a web page in admin mode, or a separate admin subapp accessible via the admin login. "The logs are in the database so it should be possible."
- **Feasibility (thought through):** a browser/PWA **cannot spawn the OS terminal** (sandbox) — so "click a link → opens macOS Terminal" isn't directly possible from the web app. Realistic forms, best-first:
  - **(a) In-app admin log viewer (web, admin-mode)** — a page/subapp querying `public.logs` with filters (level, category, `correlation_id`/`session_id`/`request_id`/`trace_id`, time range, user), full-text search on message/details, auto-refresh/tail, and **drill-down by `correlation_id`** (pivot to every event in one request). No extra infra; ships on-device. Most feasible.
  - **(b) Repo CLI (`scripts/logs-cli.mjs`)** — a Node CLI (menu-driven or query-args) that connects to the DB and prints/queries logs, for use in a real terminal by an admin or an agent. Matches the "CLI in a terminal" intent; pair with an **agent skill** for natural-language log triage ("show me errors for correlation X").
  - **(c) Separate admin subapp** — a distinct admin route/build gated by admin login hosting (a)/(b).
- **Recommendation:** ship (a) first (in-app admin viewer), add (b) the repo CLI + optional agent skill for terminal/AI-assisted analysis; document the CLI command in place of the (infeasible) "open Terminal from a link." 
- **Access/RLS:** `public.logs` must be **admin-readable** (verify/add an RLS policy) and the viewer must use an admin-authenticated path; the CLI uses a service-role/DB path (same DB-access design point as **SW-4** agent-ticket skill). Ties the observability contract (correlation IDs are the pivot key).
- **Owner:** Agent E (in-app viewer) + tooling (CLI/skill) + ops (RLS). **Status:** OPEN.

## Security backlog (owner-requested 2026-07-14)

### SEC-1 — Rate limiting on edge functions (DoS / abuse protection) — `OPEN (HIGH — security, owner-requested 2026-07-14)`
- **Report (owner):** "there should also be some kind of rate limiting config as well to avoid DoS attacks."
- **Why this is distinct from the voice limit:** the daily voice limit (TB-8/EN-11) is a **fair-use quota** enforced **client-side** (`useTutorSession`) against `profiles.voice_usage_today` — it is NOT abuse protection (a malicious client bypasses client checks and can hammer the edge functions directly). Need **server-side rate limiting** on the edge functions (`gemini` tts/chat/translate/generate-lesson, `log-sink`, `delete-account`) to cap request rate per IP and per authenticated user.
- **Current state:** `log-sink` already has a **per-IP throttle** (pattern to reuse); the `gemini` edge fn enforces the daily voice count server-side but has no general rate limit. No centralized limiter.
- **Direction:** a shared `_shared/rateLimit.ts` (token-bucket / fixed-window) keyed by IP + user_id, with per-action configurable limits sourced from `global_settings` (so limits are tunable without redeploy); return `429` + a structured `RATE_LIMITED` error via the canonical `errorResponse`/observability path (correlation IDs). Consider Supabase/Postgres-backed counters or an edge KV. Config lives in `global_settings` (e.g. `rate_limit_*`). Ties the observability contract (structured errors) + AUTH-1 (bot/human verification reduces abuse surface).
- **Owner:** Agent E / ops (security). Before any wide/public beta. Test: e2e/integration that N rapid calls get `429` with the structured code. **Status:** OPEN (HIGH — security).

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
