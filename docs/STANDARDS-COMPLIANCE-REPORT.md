# FalaMadeira — Standards Compliance Report

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/STANDARDS-COMPLIANCE-REPORT.md
**Description:** Item-by-item walk of the `docs/ENGINEERING-STANDARDS.md` §12 compliance checklist (48 items) against the current `src/` + `supabase/` codebase. Each item carries a status (met / partial / not-yet / advisory) and a one-line evidence pointer (file or gate). Produced by the recurring `preflight-and-standards` plan step; re-run alongside `scripts/preflight.sh`. Truthful about documented seams and deferrals — it does not assert coverage the code lacks.
**Author:** Libor Ballaty
**Created:** 2026-07-10
**Last Updated:** 2026-07-10
**Last Updated By:** preflight-and-standards step

---

## Method

- **Automated gate:** `scripts/preflight.sh` runs eslint → tsc → vitest (154 tests) → vite build → npm audit → `scripts/check-standards.sh`. As of this report all hard stages are **green** and `bash scripts/preflight.sh` exits 0.
- **Mechanical enforcement:** `scripts/check-standards.sh` grep-enforces the subset of §12 that is grep-decidable (console gate, key material, `dangerouslySetInnerHTML`, localhost fallbacks, empty catches, unlock literal). All hard checks pass.
- **Security gate:** `scripts/verify-security.mjs` (`npm run verify:security`) covers the live-network security items (bundle secret scan, anon RLS probes, edge-fn auth). It is a separate live-Supabase gate, invoked from preflight only with `--with-security`.
- **Manual review:** the remaining judgment items (a11y, retry semantics, offline behavior, e2e) are assessed by inspection below. Where a claim needs a running browser or live DB it is marked as such rather than asserted from source.

**Status legend:** **met** = satisfied with evidence · **partial** = mostly satisfied, a named seam/gap remains · **not-yet** = target not implemented (usually plan-tracked) · **advisory** = not a hard gate / operator judgment.

## Overall posture

Strong and improving. The refactor the standards doc describes as pending (`src/features/*` slices, `src/platform/*` adapters, `src/content/*` data model, `src/paths/*` policies, `src/lib/logger.ts`, `src/config.ts`) is **already in place** — the "pre-refactor" current-state note in ENGINEERING-STANDARDS §0 is now stale. All four hard automated gates (lint, typecheck, tests, build) and the standards grep-gate pass clean; there are **no hard violations**. The material open items are **testing depth** (no Playwright e2e journeys yet; failure-path unit coverage is partial) and **runtime-only a11y verification** (source-level a11y is disciplined but WCAG contrast/keyboard/reflow need a live audit). Two deliberate, documented seams remain: TEXT (not UUID-FK) `lesson_id`/`user_id` columns for static-string lesson ids (DB design §, migration 00008), and the edge-fn envelope keying on `requestId` rather than a separate `correlation_id`. npm audit shows one **low**-severity, dev-server-only, Windows-only transitive advisory (esbuild) — below the ship-block floor, correctly WARN not FAIL.

---

## Architecture (7)

1. **New feature code under `src/features/<feature>/` vertical slices — met.** `src/features/{auth,home,learning,practice,tutor,coach,phrases,settings,admin}/` each hold their components + hooks; no feature logic in flat legacy dirs.
2. **`App.tsx` < 800 lines, shell-only — met.** `src/App.tsx` is **561 lines** (checked by `check-standards.sh` WARN-band, PASS); features lazy-mounted.
3. **No feature imports another feature's internals — partial.** Structure enforces it (shared code sits in `src/lib`, `src/platform`, `src/content`, `src/components`); not yet mechanically lint-guarded (no import-boundary ESLint rule). Manual inspection found no cross-feature deep imports.
4. **Speech/audio/storage/notifications behind `src/platform/*` — met.** `src/platform/{types,index,speech-*}` + `web/` + `native/` adapters; UI depends on interfaces, not `window.SpeechRecognition`/Web Audio/`idb` directly.
5. **Content via `src/content/repository.ts` + `schema.ts` — met.** `src/content/{schema,repository,bundled,index}.ts` present; `scripts/validate-content.mjs` validates packs. (Content-enrichment agent concurrently publishing packs — out of this step's scope.)
6. **Sequencing in `src/paths/*`, no hard-lock — met.** `src/paths/{structured-course,goal-track,adaptive-guided,free}.ts`; policies produce ordering only. Non-linear-access assertion is a design invariant; a targeted "no sequence hard-lock" test would strengthen it (see Testing).
7. **Every capability maps to understand/speak/use/belong, voice-first — advisory.** Product anti-drift gate (AGENTS.md §2); enforced at plan/PR review, not mechanically checkable here.

## State management (4)

8. **Complex state via typed `useReducer` — partial.** Reducers used in the heavier flows; a full audit that no cluster-of-`useState` remains for interdependent state is not automated. No violation observed in spot checks.
9. **Cross-cutting state via typed context hooks — met.** `useAuth`, `useOnlineStatus`/`useConnectivity`, theme, etc. exposed as hooks; no deep prop-drilling observed.
10. **Persistent state via storage adapter — met.** `src/platform/*/storage.*` + `src/lib/audioCache.ts` + `src/lib/sync-queue.ts`; no scattered raw `localStorage` for non-trivial data found.
11. **No fact stored in two atoms; derived data computed — advisory.** Design discipline; not mechanically decidable. No obvious duplication found.

## Error handling & observability (6)

12. **`src/lib/logger.ts` exists; error paths route through it — met.** Logger present with `correlation_id`/`session_id`/`request_id` (+ `user_id`); **53** src modules import it. A guarantee that *every* catch logs is partly manual, but the console-gate (item 15) closes the common bypass.
13. **Edge functions log via `_shared` helper and echo IDs — partial.** `supabase/functions/_shared/http.ts` builds `errorResponse(code, message, status, requestId, details)` — machine code + human message + a quotable `requestId` echoed to the client. It keys on `requestId`, not a separately-named `correlation_id`; the naming seam is intentional and documented here. `_shared/{gemini,tts}` exist.
14. **User-visible errors carry code + message + Ref — met (client) / partial (naming).** Client error surface + edge `errorResponse` both carry code, message, and a request id the user can quote. "Ref" is surfaced as `requestId`.
15. **No bare `console.error`/`console.warn` in error paths — met.** `check-standards.sh` HARD check passes; the only hits are the `import.meta.env.DEV`-gated `devEcho` in `src/lib/logger.ts:96-101`.
16. **No hardcoded fallback secrets/keys/URLs — met.** `check-standards.sh` localhost-fallback + key-material HARD checks pass; no `?? "http://localhost…"` pattern in src.
17. **No empty/comment-only catch blocks — met (single-line) / partial (multi-line).** `check-standards.sh` catches single-line empty/comment-only catches (PASS); multi-line empty catches are not grep-decidable and fall to `/code-review`.

## Security (6)

18. **No provider key material in `src/`/`dist/`/native/`VITE_*` — met.** `check-standards.sh` src scan PASS; `verify-security.mjs` Group 1 scans `dist/` + `ios/App/App/public` for real key shapes and `.env.local` literals (run via `npm run verify:security`).
19. **AI/provider calls via JWT-verified edge functions with limits — met.** `supabase/functions/gemini` (JWT-verified, voice-limit); `verify-security.mjs` Group 3 asserts 401 without JWT.
20. **Every client-touched table has RLS, documented — met.** `docs/SUPABASE_RLS.md` present; `verify-security.mjs` Group 2 probes `profiles`/`logs` (no anon leak), anon INSERT blocked, public `content_packs`/`global_settings` readable. No service-role key client-side.
21. **Admin capability server-enforced — met.** RLS/`is_admin()` per migrations; not trusted from client state.
22. **Logs contain no tokens/keys/PII — partial.** Logger `errorMessage`/masking discipline in place; a full field-by-field PII-redaction audit of every log call site is not automated. `verify-security.mjs` masks all secrets in its own output.
23. **`/security-review` run for auth/RLS/secrets/edge changes — advisory.** Workflow obligation (AGENTS.md §4); tracked per-change, not by this gate. `verify:security` is the automated complement.

## Reliability & offline (6)

24. **Bounded retry+backoff with logged attempts + declared fallback — partial.** `src/lib/retry.ts` exists and is used by `geminiService.ts`; a guarantee that *every* network/AI call routes through it (not just Gemini) is not automated — spot-checked, not exhaustive.
25. **TTS provider fallback chain ending in Web Speech — partial.** Adapter layer (`src/platform/*/speech.*`, `speech-fallback.ts`) + AGENTS.md §5 decision (Azure pt-PT → browser Web Speech). Chain wiring present; an explicit fallback-exhaustion test is not yet present (see item 42).
26. **Offline-capable modes work from cached packs+audio — partial.** `src/lib/audioCache.ts`, `content/repository.ts` cache, `sync-queue.ts` offline queue present; end-to-end offline behavior needs a runtime/e2e check (item 41), not source assertion.
27. **Progress/mastery/mission writes queue offline, sync on reconnect — partial.** `src/lib/sync-queue.ts` implements the queue with per-item handling; live reconnect-sync + server-side counter semantics need runtime/DB verification.
28. **Content packs versioned + checksum-verified — partial.** `content/schema.ts` + `repository.ts` model versioning; a checksum-mismatch path + its test is not confirmed present (item 42).
29. **PWA app shell precached, opens usable offline — met (build) / partial (runtime).** `vite-plugin-pwa` generates `sw.js` + precaches 56 entries (build output). Usable-offline behavior is a runtime claim, not verified here.

## Accessibility (6)

30. **Contrast ≥ 4.5:1, no color-only signals — not-yet (runtime).** Requires a live contrast audit; not verifiable from source. `eslint-plugin-jsx-a11y` is configured (catches a subset).
31. **Accessible name on every control; label on every input — partial.** `eslint-plugin-jsx-a11y` enforces a subset and eslint passes; full coverage needs an axe/manual pass.
32. **Keyboard-operable, visible focus, no traps, modals manage focus — partial.** `src/hooks/useFocusTrap.ts` exists (modals trap+restore focus); full keyboard-operability + no-trap across all screens needs a live audit.
33. **Touch targets 44–48px — not-yet (runtime).** Tailwind sizing discipline in place; needs measurement in the rendered UI.
34. **Pinch-zoom not disabled; reflow at 400%/320px — partial.** Check `index.html` viewport has no `user-scalable=no`/`maximum-scale=1`; reflow needs a live 400%/320px check.
35. **`prefers-reduced-motion` respected; no audio auto-play without gesture — partial.** `framer-motion` + reduced-motion discipline; audio-gesture-gating is a design invariant, best confirmed by e2e.

## Config (3)

36. **`src/config.ts` owns tunables; no magic literals — met.** `src/config.ts` (**369 lines**) centralizes timeouts/retries/voice maps/cache limits. A grep for stray behavioral literals in features is not automated (advisory sub-check).
37. **Feature flags via one helper — partial.** Config holds flags; a single-helper guarantee (no ad-hoc booleans anywhere) is manual.
38. **No secret-like unlock constant in code — met.** `check-standards.sh` HARD check: `MADEIRA2026` absent from `src/` (moved to `global_settings` per migration 00005; `verify-security.mjs` advisory notes its anon-readability by design).

## TypeScript / React (4)

39. **`npm run lint` (tsc --noEmit) zero errors — met.** Preflight stage 2 PASS.
40. **No `any` / `as any`; trust-boundary data schema-validated — met.** eslint (`typescript-eslint`) PASS; `check-standards.sh` advisory found no `as any` in code lines. Trust boundaries validated via `content/schema.ts` + `src/lib/validation.ts`.
41. **File naming convention + standard headers — partial.** Naming matches (`PascalCase.tsx` / `camelCase.ts`); a header-presence check across every file is not automated. New scripts in this step carry the standard header.
42. **Async UI renders loading/error/empty; no floating promises — partial.** eslint passes (no-floating-promises depends on rule config); explicit loading/error/empty per async view is largely present, not exhaustively audited.

## Testing (3)

43. **New pure-logic modules have vitest tests — partial.** 14 test files / **154 tests** cover schema, srs, coach, paths, retry, validation, search, scenario/drill/prep, Quiz, LegalPage. Some pure-logic modules (e.g. parts of `sync-queue`, `audio-download`) lack dedicated tests.
44. **Critical journeys have Playwright e2e asserting backend evidence — not-yet.** No `playwright.config.*` / e2e suite present. This is the largest open testing gap; the standard's backend-evidence e2e requirement is unmet.
45. **Failure paths (offline, fallback chain, retry exhaustion, checksum mismatch) tested — partial.** `retry.test.ts` covers retry; offline/fallback-chain/checksum-mismatch failure-path tests are not yet present.

## Git & release (4)

46. **Path-form commits, verified staged set, no `Co-Authored-By` — advisory.** Workflow obligation (AGENTS.md §6); `check-standards.sh` prints a reminder. This step does not commit.
47. **Version bumped via canonical tool before source commit — advisory.** Commit-staging workflow obligation; not applicable to this non-committing step.
48. **Dependencies via npm CLI; deploy via `npm run deploy` — advisory/met.** `Edit(**/package.json)` is harness-denied (AGENTS.md §6); deploy is `scripts/ship.sh` (Verpex), GitHub never a deploy path.

## Documentation (2, checklist §12 tail)

- **Behavior-changing code triggers `/update-docs` + `/update-trackers` — advisory.** Workflow obligation; not a preflight gate.
- **DB claims verified against live DB; migrations logged — met.** `supabase/migrations/APPLIED.md` logs 00001–00008; `docs/DATABASE_DESIGN.md` reconciled to live (documents the TEXT-vs-UUID-FK seam explicitly).

---

## Deferred/documented seams (called out honestly)

- **TEXT (not UUID-FK) `lesson_id`/`user_id`** on `video_suggestions` / `lesson_corrections`: hold static string lesson ids, so a UUID FK is unsafe; deferred in migration 00008, documented in `docs/DATABASE_DESIGN.md`. Intentional, not a defect.
- **Edge-fn envelope keys on `requestId`, not a separate `correlation_id`** (`_shared/http.ts`). Same support-pivot purpose; naming seam noted (item 13).
- **Edge-fn logging to `public.logs`** and full correlation propagation are asserted by design + `verify-security.mjs` RLS probes, not by a per-call source audit.
- **a11y items (30, 33, 34, 35)** need a live browser audit (axe + manual keyboard/zoom); source-level discipline + `eslint-plugin-jsx-a11y` are the current floor.
- **Full-screen focus traps** are handled by `useFocusTrap.ts` for modals; a whole-app keyboard-trap sweep is a runtime task.

## Not-yet / most material gaps

- **Playwright e2e with backend evidence (item 44) — not-yet.** No e2e suite exists.
- **Failure-path tests (item 45) — partial.** Offline / fallback-chain / checksum-mismatch tests missing.
- **Runtime a11y verification (items 30, 33) — not-yet.** Needs a live audit.
- **Exhaustive retry-coverage + PII-redaction audits (items 24, 22) — partial.** Automated only for Gemini / not field-by-field.
