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

## Reconciliation notes
- Migrations on disk (`00001`–`00007`) exactly match `supabase/migrations/APPLIED.md`. ✅
- Plan-state statuses that were optimistic at pass 1 (steps marked succeeded while tsc failed) are now consistent — tsc is green at pass 2.
- Native platform adapters are honest Capacitor stubs with documented iOS Info.plist TODOs (`NSSpeechRecognitionUsageDescription`, `NSMicrophoneUsageDescription`, `AVAudioSession`) — to be handled in the `ios-build` step, not silent breakage.

## For the executing agent
Priority order for the remaining defects: **A3** (quick, correctness) → **A2/A4** (verify writes persist) → **A5** (counter RPC, before offline counter sync is trusted) → **A6** (observability). A7 is your `content-enrichment` step. Keep `tsc --noEmit` wired into `preflight-and-standards` so A1 cannot silently return.
