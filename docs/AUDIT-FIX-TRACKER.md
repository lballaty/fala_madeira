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
| A3 | Floating `.then()` promise (not awaited) | MED | 🔲 open | `src/features/practice/usePractice.ts:82` | Convert to `await` + `handleSupabaseError`, or `void`+`.catch` through the logger — for consistency + no unhandled rejection. |
| A4 | Profile update — confirm awaited & error-handled | LOW | 🔎 verify | `src/features/tutor/useTutorSession.ts:184` | Confirm the write is awaited and routes errors to the logger. |
| A5 | Counter writes (`voice_usage_today`, streaks) via last-write-wins sync are not concurrency-safe | MED | 🔲 open | `src/lib/sync-queue.ts` COUNTER SEAM note | Add a server-side increment RPC; route counter writes through it before enabling offline counter sync. |
| A6 | Some platform-adapter `catch` blocks don't route through the centralized logger | LOW | 🔲 open | `src/platform/{web,native}/*` | Route adapter errors through `src/lib/logger.ts` for observability (per ENGINEERING-STANDARDS error-handling rule). |
| A7 | Seed situations carry no `dialogues`/`roleplay`/`mission`/`review_items` (engines run on fallbacks) | INFO | ⏳ planned | 0 matches in `src/content/packs/seed-course.ts` | Covered by the `content-enrichment` plan step — expected, not a defect. Engines degrade gracefully today. |
| A8 | Confirm vitest pass count | — | ✅ resolved | 154 passed / 14 files (pass2) | none |

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
- Migrations on disk (`00001`–`00007`) exactly match `supabase/migrations/APPLIED.md`. ✅
- Plan-state statuses that were optimistic at pass 1 (steps marked succeeded while tsc failed) are now consistent — tsc is green at pass 2.
- Native platform adapters are honest Capacitor stubs with documented iOS Info.plist TODOs (`NSSpeechRecognitionUsageDescription`, `NSMicrophoneUsageDescription`, `AVAudioSession`) — to be handled in the `ios-build` step, not silent breakage.

## For the executing agent
Priority order for the remaining defects: **A3** (quick, correctness) → **A2/A4** (verify writes persist) → **A5** (counter RPC, before offline counter sync is trusted) → **A6** (observability). A7 is your `content-enrichment` step. Keep `tsc --noEmit` wired into `preflight-and-standards` so A1 cannot silently return.
