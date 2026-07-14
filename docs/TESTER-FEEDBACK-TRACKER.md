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
- **Report:** "Normal process with PW works but then I am stuck on first screen and can't scroll further." **Env: Android 14, reproduced on both Brave and Chrome** (both Chromium).
- **Root cause (confirmed, code-read 2026-07-14):** the app shell (`src/App.tsx` lines 222/247/272) used `h-screen` = `100vh`. On Chromium/Android, `100vh` **includes the area behind the URL bar**, so the shell is taller than the visible viewport. The onboarding `StepShell` footer holding the primary button (Continue / "Let's go") is a `shrink-0` region **outside** the `flex-1 overflow-y-auto` scroll area, pinned to the bottom of the 100vh shell → it sits **below the visible fold**, unreachable, while only the middle content scrolls. Brave + Chrome share this because both are Chromium.
- **Fix (commit `9c73629`, `develop`):** app shell `h-screen` → `h-dvh` (dynamic viewport height) on all three shell containers — matches the *visible* viewport so the footer stays on-screen. Shell-level, so it covers whichever first screen (onboarding welcome or Home). Verified: `.h-dvh`/`100dvh` generated in the built CSS; build green.
- **Owed:** an `@mobile` regression test asserting the onboarding primary button is within the viewport / clickable on a small viewport; then promote (deploy) to reach the tester.
- **Status:** DONE (fixed on develop; @mobile regression test + deploy owed).

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

### INFRA-4 — Staging / pre-release deploy (test URL) — `OPEN (coordinate with other agent)`
- Other agent is building a pre-release deploy to a **TEST URL (staging)** as a verify step before prod. Committed deploy scripts ship prod-only (`falamadeira.searchingfool.com`) today.
- Slotted into the release flow (`MULTI-AGENT-WORKFLOW.md` §3/§7): `develop`→`main` → deploy to test URL (staging) → verify → deploy to prod. Runs from the release worktree (on `main`).
- **Owed:** get the staging details from the other agent (test URL, deploy flag/target, branch/worktree); wire `scripts/deploy-verpex.sh` to support the target; finalize the workflow doc §7/§8.

---

## Cross-references (owned elsewhere, not buried)
- **Versioning rollout** → `aidevops/plans/plan-2026-07-14-versioning-rollout.yaml` (TODO #122).
- **PF-13 schema drift, observability** → other agent (DB).
- **EF-34/35 (Lane A specs), EF-36 (WS2 test-user isolation)** → `docs/E2E-LIVE-RUN-TRACKER.md`.
