# FalaMadeira — Audit Fix Tracker

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/AUDIT-FIX-TRACKER.md
**Description:** Shared defect/finding tracker from the verification/reconciliation/drift/standards audit passes. Both the executing agent and reviewers work from this. Status reflects the re-verified snapshot; update the Status column (and re-run the pass) as items close. Coordinate edits via queuectl (this file may be reserved).
**Author:** Libor Ballaty (via main audit session)
**Created:** 2026-07-10
**Last Updated:** 2026-07-10
**Last Updated By:** claude-main-audit (pass 2)

## Snapshot (pass 2 — 2026-07-10 ~12:25 UTC)
- Plan progress: **51/56 steps succeeded**, 5 pending (see `plans/.plan-state.yaml`).
- Typecheck: **`npx tsc --noEmit` = 0 errors** (was 14 at pass 1 — fixed by the agent).
- Tests: **154 passed / 14 files** (vitest).
- Security: **clean** — no key material (`AIzaSy`/`AQ.`/`sbp_`/`service_role`) in `src` or `dist`.
- Build: Vite build green.
- Design drift: code strongly ALIGNED with CONTENT-ARCHITECTURE/PRODUCT-DESIGN-TARGET (content-as-data, 4 path types, voice-first engines, 7-provider TTS, 4-dim SRS + Coach, offline all realized).

## Findings

Status: ✅ resolved · 🔲 open · 🔎 verify · ⏳ planned (expected pending step, not a defect)

| ID | Finding | Sev | Status | Evidence / file:line | Action |
|----|---------|-----|--------|----------------------|--------|
| A1 | 14 `tsc` errors (ValidationResult union not narrowing on `.reason`; TS2739 Promise-vs-builder) blocked `npm run lint` | HIGH | ✅ resolved | pass2 `npx tsc --noEmit` = 0 | Keep `tsc --noEmit` in preflight so it can't regress silently (Vite build skips typecheck). |
| A2 | Un-awaited Supabase `.update()/.upsert()` in `useSettings.ts` (settings may not persist / errors swallowed) | HIGH | 🔎 verify | tsc now clean at useSettings.ts:270,282; was TS2739 | Runtime spot-check: change playback speed / sound toggle → confirm the `profiles` row updates. |
| A3 | Floating `.then()` promise (not awaited) | MED | ✅ resolved | `src/features/practice/usePractice.ts:82` | Replaced with a `void` async IIFE that awaits the profile update and routes both Supabase + thrown errors through `handleSupabaseError`. |
| A4 | Profile update — confirm awaited & error-handled | LOW | 🔎 verify | `src/features/tutor/useTutorSession.ts:184` | Confirm the write is awaited and routes errors to the logger. |
| A5 | Counter writes (`voice_usage_today`, streaks) via last-write-wins sync are not concurrency-safe | MED | 🔲 open | `src/lib/sync-queue.ts` COUNTER SEAM note | Add a server-side increment RPC; route counter writes through it before enabling offline counter sync. |
| A6 | Some platform-adapter `catch` blocks don't route through the centralized logger | LOW | ✅ resolved | `src/platform/{web,native}/notifications.*` | Web/native notifications adapters now log permission/cancel/unsupported paths through `src/lib/logger.ts`; keep sweeping remaining adapters opportunistically if more are found. |
| A7 | Seed situations carry no `dialogues`/`roleplay`/`mission`/`review_items` (engines run on fallbacks) | INFO | ⏳ planned | 0 matches in `src/content/packs/seed-course.ts` | Covered by the `content-enrichment` plan step — expected, not a defect. Engines degrade gracefully today. |
| A8 | Confirm vitest pass count | — | ✅ resolved | 154 passed / 14 files (pass2) | none |
| A9 | `jsx-a11y/no-autofocus` error blocks a green `preflight` eslint stage | LOW | ✅ resolved | `src/features/practice/vocabulary/VocabularyView.tsx` `PromptStep` | Removed the `autoFocus` attribute; the answer field now focuses programmatically post-mount via a `useRef`+`useEffect` keyed on `card.entry.word` (re-focuses on each new prompt), preserving the type-straight-away UX. tsc clean, eslint clean on the file, 55 vocabulary unit tests pass. Fixed 2026-07-17. **FOLLOW-UP (deferred, owner: EN-18/coverage stream):** a dedicated `PromptStep` focus-on-mount unit test was NOT added with the fix — the cleanest form (export `PromptStep` + RTL render) needs an edit to `VocabularyView.tsx`, which was **locked by `claude-en8-merge`** (active EN-8 merge) at push time. The push was therefore taken with an audited `[skip-coverage: …]` tag (`8db9c52`/`a3f70e6` are behavior-preserving lint-only changes covered by the 55 existing vocab tests). **Next action:** once the EN-8 merge lands, export `PromptStep` and add `__tests__/PromptStep.test.tsx` asserting the answer input is focused on mount + re-focuses on a new prompt word; then no future skip is needed. |
| A10 | Unused `eslint-disable` directive (warning) | INFO | ✅ resolved | `src/hooks/useFocusTrap.ts:115` | Removed the now-unused `// eslint-disable ... react-hooks/exhaustive-deps` line (kept the explanatory comment). `npx eslint src` now fully clean (0 errors, 0 warnings). Fixed 2026-07-17 (`a3f70e6`). |
| A11 | `preflight` e2e-coverage stage fails on STALE local touch artifacts (false positive) — and the gate trusts them blindly | MED | 🔲 open | `scripts/check-interactive-coverage.mjs` reads `artifacts/control-touches/*.json` (gitignored, local-only); vs `tests/e2e/user/{30,40,57}` | **Verified in code 2026-07-17:** the stale artifacts (generated 05:46–05:49) predate EN-18's WP7 quiz-reconcile which edited those specs at 08:31–09:08. They record dead ids (`practice.vocab.scope_selector`, `practice.vocabulary.flashcard`/`grade_good`, `practice.vocabulary.grade_again/easy/hard`); the CURRENT specs touch inventory-present ids (`practice.vocab.focus_picker`, `practice.vocabulary.tile`/`.check`, `practice.pattern_builder.grade_almost/missed` — the vocab self-grade UI was REMOVED for the objective quiz). **Not a repo defect** (CI regenerates artifacts fresh). **Real gate weakness (owner: EN-24/coverage stream):** the check consumes gitignored local artifacts that drift from specs → false positives (and, symmetrically, stale artifacts could mask a real gap = false negative). Harden: regenerate/clear touch artifacts as part of the gate, or key each touch to the current spec's mtime/hash, or fail if any artifact is older than its spec. Local fix meanwhile: clear `artifacts/control-touches/` and re-run the e2e suite. |

## HIGH PRIORITY — Testing coverage (operator directive 2026-07-11)

**T-COV1 — e2e is smoke/render-level, not functional.** Verified 2026-07-11: 13 specs, ~59 assertions, but **41 presence (`toBeVisible`) vs 8 correctness** assertions. Screens mount and controls exist, but features aren't validated end-to-end. Last run "passed" but that mostly means "renders". This is why manual testing finds broken features while e2e is green. `vertical-slice-e2e` was marked succeeded but NOT to the plan's stated depth ("drive REAL UI + assert backend evidence per slice") → **REOPEN it.**

**T-COV2 — REQUIREMENT: every button, field, and link must be exercised by the full test suite.** Not presence-only — each interactive element must have a test that drives it and asserts the *outcome*:
- **Buttons/controls:** click → assert the effect (navigation, modal open/close, state change, DB row + edge `correlation_id` where a backend write occurs).
- **Fields/inputs:** type valid + invalid → assert validation message, persistence, and error handling.
- **Links/nav:** click → assert destination/route.
- **Toggles/sliders/selects:** change → assert persisted state.

**Mechanism to make it enforceable (not aspirational):**
1. **Convention:** every interactive element carries a stable `data-testid` (or an accessible role+name). Add an ESLint/jsx-a11y rule + review check so new controls can't ship without one.
2. **Inventory:** a script enumerates every interactive element rendered per screen (crawl the running app / scan components for buttons/inputs/links/testids) → the authoritative control list.
3. **Coverage gate:** `scripts/check-interactive-coverage.mjs` diffs the rendered-control inventory against the set of testids/roles exercised by specs, and **fails** if any control is untested (an "orphan control" check). Wire it into `scripts/preflight.sh` / `check-standards.sh` so coverage can't regress.
4. **Per-slice functional specs:** rewrite `tests/e2e/*` so each core journey asserts outcomes + backend evidence, and add a per-screen "exercise every control" spec.
Acceptance: coverage gate reports 100% of interactive elements exercised with at least one outcome assertion; e2e correctness-assertion ratio no longer presence-dominated.

**Status 2026-07-13 (first live execution + coverage review):** the suite now RUNS on the runner machine — run 1: 25 passed / 12 failed / 1 skipped of 38 tests (spec set has since grown to 51/41 and expansion continues). Every failure is triaged as a discrete item, and the coverage review (gaps CG-1…17 + gate-hardening items CS-1…8 — including "the gate cannot see uninventoried controls" and "covered_by is never verified") lives in **`docs/E2E-LIVE-RUN-TRACKER.md`** — the live worklist for T-COV1/T-COV2 from here. Three REAL product bugs found by the suite are mirrored as LT6–LT8 in REQUIREMENTS-TRACKER (tutor switching broken in prod: `profiles.selected_tutor_id` column missing; admin Requests queue always empty: `lesson_requests` RLS lacks `OR is_admin()`; latent voice-limit clobber race). T-COV1's central claim is now empirically confirmed: the tutor-switch control was "covered" green at render level while 100% broken in production.

## Reconciliation notes
- Migrations on disk (`00001`–`00015`) match `supabase/migrations/APPLIED.md`. ✅ (Extended in the 2026-07-19 reconciliation pass, which added the previously-missing `00010`/`00011` rows to APPLIED.md.)
- Plan-state statuses that were optimistic at pass 1 (steps marked succeeded while tsc failed) are now consistent — tsc is green at pass 2.
- Native platform adapters are honest Capacitor stubs with documented iOS Info.plist TODOs (`NSSpeechRecognitionUsageDescription`, `NSMicrophoneUsageDescription`, `AVAudioSession`) — to be handled in the `ios-build` step, not silent breakage.

## For the executing agent
Priority order for the remaining defects: **A3** (quick, correctness) → **A2/A4** (verify writes persist) → **A5** (counter RPC, before offline counter sync is trusted) → **A6** (observability). A7 is your `content-enrichment` step. Keep `tsc --noEmit` wired into `preflight-and-standards` so A1 cannot silently return.

## Reconciliation pass 2026-07-19 (claude-reconcile)
Full verification/reconciliation of docs, trackers, and artifacts against shipped reality (git-verified). Executed via `plans/plan-2026-07-19-repo-reconciliation-remediation.yaml`. All changes doc/archive-only; develop verified green (preflight all hard gates + e2e regression **138/141**, 0 failed) before push.

- **Ticket status headers reconciled (8):** EN-25 (→ SHIPPED prod 2026.07.17.1), SEC-2 (→ SHIPPED 2026.07.15.5), TB-1 (→ SHIPPED, 00015 live), EN-23b (→ W1–W4 SHIPPED), EN-23 (→ MVP SHIPPED), EN-15 (added missing header, SHIPPED), EN-17/18 (→ BUILT+SHIPPED), EN-34 (fixed DRAFT/APPROVED header contradiction).
- **APPLIED.md gap closed:** added previously-missing `00010`/`00011` rows — both **verified present live** 2026-07-19 via read-only Supabase Management API (logs +7 cols; profiles +4 cols); original apply date/method was unrecorded (noted honestly).
- **STANDARDS-COMPLIANCE-REPORT refreshed:** retracted the false "no e2e suite" claim (item 44 not-yet → met); counts updated (vitest 154→616, config.ts 369→432, pure-logic 14→87 files).
- **Minor doc updates:** DATABASE_DESIGN (+proficiency_level), README (test counts), ENGINEERING-STANDARDS (§9 preflight gate inventory), REQUIREMENTS-TRACKER + APPLIED.md headers, TESTER-FEEDBACK-TRACKER (TB-1 label + gemini→ai-gateway historical-ref note).
- **Archived (history-preserving git mv):** 7 completed plans + 3 checkpoints → `plans/archive/`; 2 session-handoffs → `docs/archive/handoffs/`; 3 UI mockups + EN-21 mockup → `docs/archive/mockups/`; stale `APPLICATION_DOCUMENTATION.html` → `docs/archive/`.
- **Incidental fixes (NAV-1, found by the green-gate):** eslint `set-state-in-effect` in `SettingsView.tsx` (NAV-1c About deep-link) and 2 e2e specs (01/11) with ambiguous "Settings" selectors after the Profile→Settings relabel (NAV-1a).
- **Operator-gated (surfaced, NOT executed):** per-file `rm` manifest for stale one-offs + `.admin-temp-credentials.txt` (rotate password first) — see `docs/TESTER-FEEDBACK-TRACKER.md` "Reconciliation 2026-07-19 — operator-gated removals".
