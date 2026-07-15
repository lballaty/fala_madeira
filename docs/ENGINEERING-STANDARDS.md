# FalaMadeira — Engineering Standards

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/ENGINEERING-STANDARDS.md
**Description:** The project's detailed architecture, security, design, and coding standard. Concrete, checkable rules that the standards-compliance review (plan step `preflight-and-standards`) enforces. Inherits the global agentic operating standard; adds FalaMadeira-specific rules. On conflict about *content model* questions, `docs/CONTENT-ARCHITECTURE.md` governs; on conflict about *engineering* questions, this document governs.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** execute-plan (engineering-standards step)

---

## 0. Scope and precedence

- **Inherits:** the global baseline at `/Users/liborballaty/.ai-dev-dotfiles/memories/agentic-operating-standard.md` (error handling/observability, file-creation conventions, git hygiene, deletion discipline). Nothing here weakens it.
- **Companions:** `AGENTS.md` (workflow + operating facts), `docs/CONTENT-ARCHITECTURE.md` (content model, offline design §10, anti-drift guardrails §12), `docs/PRODUCT-DESIGN-TARGET.md` (UX principles), `docs/CONTENT-STANDARDS.md` (language rules).
- **Enforcement:** the `standards-compliance-review` step walks the **Compliance checklist** (§12) item by item. Every item is written to be atomic and mechanically or manually verifiable. When code and this doc disagree, reconcile explicitly — do not let drift accumulate silently.
- **Current-state note:** the repo today is pre-refactor (`src/components`, `src/lib`, `src/services`, monolithic `App.tsx`). The rules below describe the **target** every new or touched file must conform to; plan steps `platform-adapters`, `split-app-components`, `centralized-logger`, and `config-not-magic` perform the migration. New code MUST NOT be added in the legacy shape.

## 1. Architecture

### 1.1 Vertical slices (`src/features/*`)

- A feature owns its slice end-to-end: UI → hooks/state → service call → edge function → data. One directory per feature under `src/features/` (e.g. `auth/`, `home/`, `learning/`, `practice/listening/`, `practice/speaking/`, `practice/patterns/`, `practice/simulator/`, `practice/missions/`, `practice/vocabulary/`, `tutor/`, `culture/`, `phrases/`, `settings/`, `onboarding/`, `admin/`, `legal/`).
- A feature directory contains its components, hooks, and feature-local types. Feature-internal modules are NOT imported by other features; cross-feature reuse goes through `src/lib/`, `src/platform/`, `src/content/`, or `src/components/` (shared presentational primitives only).
- `App.tsx` is a thin shell (< 800 lines): routing/navigation, providers, and lazy feature mounting via `React.lazy`. No feature business logic in `App.tsx`.
- **No second way:** before adding a utility, helper, hook, or pattern, check whether the codebase already does it one way; extend that way instead of introducing a parallel one.

### 1.2 Platform-adapter layer (`src/platform/*`)

- All platform-specific capabilities — speech recognition, audio record/playback, storage (IndexedDB/native), notifications — live behind TypeScript interfaces in `src/platform/` (`speech.ts`, `audio.ts`, `storage.ts`, `notifications.ts`) with a runtime capability resolver.
- UI and feature code depend **only on the interfaces**, never on `window.SpeechRecognition`, Web Audio, `idb`, or Capacitor plugin APIs directly. Each capability has a web implementation and (when Capacitor lands) a native implementation selected at runtime.
- This is the cross-platform contract: iOS/Android via Capacitor wrap the same web codebase; no per-platform UI rewrites and no `if (isIOS)` branches inside features.

### 1.3 Content as data (`src/content/*`)

- The content model (Situation, Track, Pack per CONTENT-ARCHITECTURE §2) is defined in `src/content/schema.ts` (zod or equivalent runtime-validated schema) and accessed through `src/content/repository.ts` (fetch + cache + version check, behind the storage adapter).
- Curriculum grows by **publishing validated Packs** (via `scripts/validate-content.mjs` against `docs/CONTENT-STANDARDS.md`), never by editing component code. Engines/features render whatever validated content the repository returns.
- No hardcoded lesson/situation content inside feature components beyond genuinely static UI copy.

### 1.4 Path policies (`src/paths/*`)

- Sequencing is a policy layer: `src/paths/structured-course.ts`, `src/paths/goal-track.ts`, `src/paths/adaptive-guided.ts`, plus the daily-session composer. Policies consume the same content + mastery model; they never mutate content.
- Policies produce **recommendations and ordering only** — soft prerequisites influence ordering, they NEVER hard-lock content (CONTENT-ARCHITECTURE §5, §12). Any code path that blocks access to a Situation based on sequence is a defect.

### 1.5 Anti-drift gate (product)

Every new capability must serve one of **understand · speak · use · belong**, be voice-first by default, keep content as data, and stay calm/honest/non-manipulative (AGENTS.md §2). Feature PRs/steps that cannot name which of the four they serve are rejected.

## 2. State management

- **Local first:** component state via `useState`/`useReducer` stays inside the owning feature. Do not lift state above the feature boundary unless two features genuinely share it.
- **Complex feature state** (multi-field, interdependent transitions — e.g. session progress, roleplay state machines) uses `useReducer` with a typed action union, not clusters of `useState`.
- **Cross-cutting state** (auth/session, active profile, selected path type, feature flags, online/offline status) lives in explicit React context providers under `src/lib/` or the owning slice, exposed via a typed hook (`useAuth()`, `useConnectivity()` …). No prop-drilling more than two levels for cross-cutting concerns; no global mutable singletons for UI state.
- **Server state** (Supabase reads) is fetched through the feature's service/repository layer and cached deliberately (content via `src/content/repository.ts`; audio via the audio cache behind the storage adapter). No duplicated ad-hoc fetch+state for data a repository already owns.
- **Persistence:** anything that must survive reload (progress, mastery, queued writes) goes through the storage adapter (`src/platform/storage.ts`) — not raw `localStorage` calls scattered in components. `localStorage` directly is acceptable only for trivial, loss-tolerant UI preferences, and even then prefer the adapter.
- **Derived data is computed, not stored.** Do not mirror the same fact in two state atoms.

## 3. Error handling & observability

This section applies the global centralized-error-handling standard concretely.

### 3.1 Centralized logger (`src/lib/logger.ts`)

- Every error path routes through the canonical logger in `src/lib/logger.ts`. The logger:
  - carries **correlation IDs**: `correlation_id` (request-level, propagated to edge functions via header), `session_id` (app session), `request_id` (per invocation), plus `user_id` when authenticated;
  - records structured fields: `event_type`, `level` (CRITICAL/ERROR/WARN/INFO/DEBUG), `category` (SYSTEM_HEALTH / SECURITY / DATA_PROCESSING / AI_DECISION / USER_ACTION), and a `details` payload;
  - persists ERROR/CRITICAL events to the observability tier (Supabase logs table via edge function when online; queued locally when offline and flushed on reconnect).
- Edge functions (`supabase/functions/*`) log through the shared helper in `supabase/functions/_shared/` with the same ID fields, and echo `correlation_id`/`request_id` back in the response envelope.

### 3.2 User-visible error surface

- Every error shown to the user carries a machine-readable **`code`**, a human-readable **message** (calm, honest, actionable — no raw stack traces, no generic "something went wrong" without a code), and a short **`Ref`** derived from the correlation/request ID that support can pivot on.
- Error envelopes are built by the canonical helper (client-side error type + edge-function `apiError(...)`-style builder), never hand-crafted JSON per call site.

### 3.3 Forbidden patterns (hard failures in review)

- **No bare `console.error`/`console.warn` in error paths.** Dev-only diagnostics must be gated behind `import.meta.env.DEV` and are never a substitute for the logger call.
- **No hardcoded fallback secrets, keys, or URLs** (e.g. `?? "http://localhost:..."`, `process.env.X || ''` silently proceeding). Missing config fails loudly through the logger + user surface. (The current `geminiService.ts` `apiKey: process.env.GEMINI_API_KEY || ''` pattern is exactly what this bans — client-side key use is doubly banned per §4.)
- **No swallowed catches.** Every `catch` either handles the error meaningfully (retry, fallback, user message) AND logs it with correlation IDs, or rethrows. `catch {}` / `catch (e) { /* ignore */ }` is forbidden. The historical "silent TTS catch" is the canonical example of what must not recur.
- **No error surfaced to the user without a paired log record**, and no log-only error the user needed to know about. The two surfaces are peers.

## 4. Security

- **Secrets are server-side only.** Gemini, Azure Speech, and any provider keys live exclusively in Supabase edge-function secrets. They never appear in the web bundle, the Capacitor native bundle, `import.meta.env.VITE_*`, or committed files. `grep` of `dist/` for key material must come up empty.
- **The only client-side trust surface is the Supabase anon key + RLS.** Every table the client touches has RLS enabled with policies documented in `docs/SUPABASE_RLS.md`; the anon key grants nothing RLS doesn't allow. No service-role key in client code, ever.
- **All AI/provider calls go through JWT-verified edge functions** (`gemini`, future providers). Edge functions validate the JWT, enforce per-user limits (e.g. voice-limit), and validate/sanitize inputs before calling providers.
- **Admin capability is server-checked** (`is_admin()` / role checks in RLS and edge functions), never trusted from client state.
- **BYO-key (user-supplied provider keys):** stored server-side against the user (encrypted at rest), sent only from edge functions to providers; never round-tripped into the client bundle or logs.
- **No PII or key material in logs.** The logger redacts tokens, keys, and message content beyond what the event needs.
- **Env hygiene:** `.env.local` and credential files (`.admin-temp-credentials.txt`) stay git-ignored; only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are legitimate client env values.
- Changes touching auth, RLS, secrets, or edge functions require a `/security-review` pass before handoff (AGENTS.md §4).

## 5. Reliability, resilience, offline

Per CONTENT-ARCHITECTURE §10 — these are requirements, not aspirations:

- **Retry + backoff on all network/AI calls:** bounded exponential backoff with jitter, routed through the centralized logger (attempt count and final disposition logged). Known provider defects (e.g. Gemini TTS `finishReason=OTHER` empty audio) get validated responses + targeted retry, documented at the call site.
- **Graceful degradation, never silent failure:** every online capability declares its fallback — TTS falls back down the provider chain (Azure → … → browser Web Speech last); AI narrative features fall back to deterministic/templated output (Coach §6b); online-only modes are clearly labeled and disabled offline with an honest message.
- **Offline-capable core:** listening, shadowing, pattern drills, vocabulary/review, and reading work offline from cached packs + audio (bounded IndexedDB cache via the storage adapter). Coach scoring/aggregation/prioritization run deterministically offline from local results.
- **Offline write queue:** progress, mastery updates, and mission completions queue locally and sync on reconnect — last-write-wins with per-item timestamps; counters incremented server-side to stay conflict-safe. Queue flush failures are logged, retried, and never drop data silently.
- **Pack integrity:** content packs carry a checksum verified on download and before use from cache; checksum mismatch triggers re-fetch + a logged event, never rendering corrupt content.
- **Versioned content:** packs are versioned; the client detects and pulls updates without breaking in-progress state.
- **PWA app shell precached** (vite-plugin-pwa); skeleton loaders, not spinners-forever; the app opens usable offline.

## 6. Accessibility (WCAG 2.2 AA)

- **Contrast:** text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI components/graphics required for understanding). No color-only signals — pair color with icon/text.
- **Labels:** every interactive control has an accessible name (visible label or `aria-label`); every form input a programmatic label; images meaningful `alt`.
- **Keyboard:** all functionality operable by keyboard; visible focus indicator; no keyboard traps; logical focus order; modals trap and restore focus.
- **Touch targets:** 44–48px minimum; primary CTAs in the lower reach zone on mobile (thumb-first).
- **Zoom & reflow:** pinch-zoom NOT disabled (no `user-scalable=no`, no `maximum-scale=1`); content reflows without 2-D scrolling at 400% zoom / 320px width.
- **Semantics:** native elements first (`button`, `nav`, `main`, headings in order); ARIA only when native semantics can't express it; live regions for async status (recording, scoring, sync).
- **Motion & audio:** respect `prefers-reduced-motion`; audio never auto-plays without a user gesture; recording states announced to screen readers.

## 7. Configuration, not magic values

- **`src/config.ts` is the single home** for tunables: timeouts, retry counts/backoff bases, voice/provider maps, cache size limits, session template defaults, API endpoints derived from env. No numeric/string literals with behavioral meaning scattered in features — if changing it is a plausible product decision, it belongs in config.
- **Feature flags** for staged capabilities (payments off, provider rollouts, experimental engines) live in config (client) and/or `global_settings` (server-controlled), checked via one helper — not ad-hoc booleans per file.
- **No secret-like unlock constants in code** (the `MADEIRA2026` unlock key moves to `global_settings`).
- Config values that must vary per environment come from env (`import.meta.env.VITE_*` client-side, edge-function secrets server-side) and **fail loudly when missing** (§3.3) — no silent defaults.

## 8. TypeScript / React coding conventions

- **Stack:** React 19 function components + hooks, TypeScript ~5.8 `strict`, Vite 6, Tailwind 4 utility classes (with `clsx` + `tailwind-merge` for conditional classes), `lucide-react` icons, `framer-motion` for gentle motion.
- **Files:** components `PascalCase.tsx` (matching existing `Quiz.tsx`, `App.tsx`); non-component modules `camelCase.ts` (matching `audioCache.ts`, `geminiService.ts`). One primary export per component file. Every created file carries the standard comment header (File, Description, Author, Created) per the global file-creation convention.
- **Types:** shared domain types in `src/types.ts` or the owning slice; `interface` for object shapes, discriminated unions for state/actions. **No `any`** (including `(x as any)` escapes like the current `(import.meta as any).env` — type `import.meta.env` properly via `vite/client` types). `unknown` + narrowing at trust boundaries (API responses validated by schema, not cast).
- **Imports:** relative within a slice; no deep imports into another feature's internals (§1.1). No circular imports.
- **Components:** small and single-purpose; extract hooks (`useX`) when logic outgrows the component; props typed explicitly (no `React.FC` requirement — match surrounding style); event handlers named `handleX`.
- **Async:** `async/await` with explicit error handling per §3; no floating promises (unhandled `.then`-less calls); loading/error/empty states rendered explicitly for every async UI.
- **Copy & content:** UI copy honest and calm (no dark patterns); Portuguese content must satisfy `docs/CONTENT-STANDARDS.md` (European Portuguese, no prohibited Brazilian forms).
- **Lint gate:** `npm run lint` (tsc --noEmit) passes with zero errors before any commit-ready state.

## 9. Testing expectations

- **Unit tests (vitest):** pure logic MUST be unit-tested — content schema + validator, SRS/SM-2 scheduling, Coach scoring/prioritization, path policies, engine pure logic, config/flag resolution. Tests live in `src/**/__tests__/` next to the code they test. New pure-logic modules ship with tests in the same step.
- **Component tests:** `@testing-library/react` + jsdom for interactive components with non-trivial state (quiz flow, recorder states, session composer UI).
- **E2E (Playwright), vertical-slice with backend evidence:** critical journeys tested end-to-end against the running app — auth, daily session, a practice engine, offline queue sync. E2E asserts **backend evidence**, not just UI: the Supabase row/log event exists after the visible action (use captured correlation/session IDs to pivot). A UI-only "it looked right" pass does not count as E2E verification.
- **Failure-path tests are first-class:** offline behavior, provider fallback chains, retry exhaustion, and checksum mismatch have explicit tests — not only happy paths.
- **Gates:** unit/component suites run in the standard validation (`npm run lint` + build + tests); a feature step is not "done" until its declared validation command passes.

## 10. Git hygiene & release engineering

- **Path-form commits always:** `git commit <path>... -m "..."` — never bare `git commit -m` (exception: committing staged deletions of still-existing files, verified via `git diff --cached --name-only` first).
- **Verify the staged set before every commit** (`git status`); commit only this session's files; surface unexpected staged extras to the operator.
- **No `Co-Authored-By` trailers** — clean title + body only (owner directive; overrides any tool default).
- **Version bump at the release cut (automated).** CalVer `YYYY.MM.DD.N`; `VERSION` is the source of truth. `scripts/ship.sh` STAGE 0 runs the canonical `~/.ai-dev-dotfiles/tools/version-bump.py` and commits VERSION+package.json **automatically when a release is cut** — gated to `main` (release worktree) + a real deploy (not `--dry-run`) + source changed since the last bump (idempotent across staging→approve→production of one commit; `SKIP_BUMP=1` bypasses). `.githooks/pre-commit` **validates** VERSION==package.json but never mutates (a hook can't bump the commit it gates — off-by-one). CHANGELOG prose is a curated manual step (ship.sh warns if the new version lacks an entry). Docs-only changes don't bump.
- **Branch & worktrees (shared checkout — MANDATORY):** the base repo checkout is shared by multiple agents on one device, so branch switches there conflict (`git checkout`/`switch` yanks the tree out from under other agents). Dev happens on **`develop`** in the base checkout — never switch branches there; **`main` = release/production**. Any branch divergence (release, hotfix) uses a dedicated **`git worktree`** (`git worktree add ../fala_madeira-<purpose> <branch>`), never a branch switch. Releases run in a `main` worktree: `merge --no-ff develop` → version-bump → tag `vYYYY.MM.DD.N` → deploy → `worktree remove`. Full workflow in AGENTS.md "Branching & worktrees". Deploy to Verpex from the release worktree via `npm run deploy` (`scripts/ship.sh`) — GitHub is source hosting only, never a deploy path.
- **Dependencies via CLI:** `npm install` / `npm pkg set`, never hand-editing `package.json` (harness deny rule, AGENTS.md §6).
- **Deletions:** one explicit `rm <path>` per file; bulk-delete mechanisms forbidden.

## 11. Documentation & drift control

- Code changes that alter behavior described in canonical docs trigger `/update-docs`; tracker updates go through `/update-trackers` (hard boundary).
- Database claims are verified against the **live** database (information_schema / actual rows), not migration files alone; migrations are logged in `supabase/migrations/APPLIED.md`.
- New high-frequency operating facts land in `AGENTS.md` §5, not in hidden memory.

---

## 12. Compliance checklist

Architecture:
- [ ] All new feature code lives under `src/features/<feature>/` as a vertical slice; no feature logic added to `App.tsx` or legacy flat directories
- [ ] `App.tsx` is under 800 lines and contains only shell concerns (routing, providers, lazy mounts)
- [ ] No feature imports another feature's internal modules; shared code goes through `src/lib/`, `src/platform/`, `src/content/`, or shared `src/components/`
- [ ] All speech/audio/storage/notification access goes through `src/platform/*` interfaces; no direct Web Speech / Web Audio / `idb` / Capacitor calls inside features
- [ ] Content is accessed via `src/content/repository.ts` and validated by `src/content/schema.ts`; no hardcoded curriculum content in components
- [ ] Sequencing logic lives in `src/paths/*` policies; no code path hard-locks access to a Situation based on sequence
- [ ] Every new capability maps to understand/speak/use/belong and is voice-first by default

State:
- [ ] Complex interdependent feature state uses a typed `useReducer`, not clusters of `useState`
- [ ] Cross-cutting state (auth, connectivity, path type, flags) is exposed via typed context hooks, not prop-drilled or duplicated
- [ ] Persistent client state goes through the storage adapter; no scattered raw `localStorage` writes for non-trivial data
- [ ] No fact is stored in two state atoms; derived data is computed

Error handling & observability:
- [ ] `src/lib/logger.ts` exists and every error path in `src/` routes through it with correlation_id, session_id, request_id (+ user_id when authed)
- [ ] Edge functions log via the `_shared` helper and echo correlation/request IDs in the response envelope
- [ ] Every user-visible error carries a machine-readable code, a human message, and a Ref derived from correlation IDs
- [ ] No bare `console.error`/`console.warn` in error paths (dev-only diagnostics gated behind `import.meta.env.DEV`)
- [ ] No hardcoded fallback secrets, keys, or URLs; missing config fails loudly through the logger + user surface
- [ ] No empty or comment-only `catch` blocks; every catch logs with IDs and handles or rethrows

Security:
- [ ] No provider key material (Gemini/Azure/etc.) in `src/`, `dist/`, native bundles, or `VITE_*` env; keys exist only in edge-function secrets
- [ ] All AI/provider calls go through JWT-verified edge functions with input validation and per-user limits
- [ ] Every client-touched table has RLS enabled and documented in `docs/SUPABASE_RLS.md`; no service-role key client-side
- [ ] Admin capability is enforced server-side (RLS/`is_admin()`), never by client state alone
- [ ] Logs contain no tokens, keys, passwords, or unnecessary PII
- [ ] `/security-review` was run for changes touching auth/RLS/secrets/edge functions

Reliability & offline:
- [ ] Every network/AI call has bounded retry + backoff with logged attempts and a declared graceful-degradation fallback
- [ ] TTS uses the provider fallback chain ending in browser Web Speech; no single-provider hard dependency
- [ ] Offline-capable modes (listening, shadowing, patterns, vocabulary/review, reading) work from cached packs + audio; online-only modes are labeled and honestly disabled offline
- [ ] Progress/mastery/mission writes queue offline and sync on reconnect (per-item timestamps; server-side counter increments)
- [ ] Content packs are versioned and checksum-verified on download and before cache use
- [ ] The PWA app shell is precached and the app opens usable offline

Accessibility:
- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 large text/UI components); no color-only signals
- [ ] Every interactive control has an accessible name; every input a programmatic label
- [ ] All functionality keyboard-operable with visible focus and no traps; modals manage focus
- [ ] Touch targets are 44–48px minimum
- [ ] Pinch-zoom is not disabled and content reflows at 400% zoom / 320px width without 2-D scrolling
- [ ] `prefers-reduced-motion` respected; no audio auto-play without user gesture

Config:
- [ ] `src/config.ts` exists and owns tunables (timeouts, retries, voice maps, cache limits); no behavioral magic literals in features
- [ ] Feature flags gate staged capabilities via one helper; no ad-hoc booleans
- [ ] No secret-like unlock constants in code (e.g. `MADEIRA2026` absent from `src/`)

TypeScript / React:
- [ ] `npm run lint` (tsc --noEmit) passes with zero errors
- [ ] No `any` (including `as any` casts); trust-boundary data validated by schema, not cast
- [ ] File naming matches convention (components `PascalCase.tsx`, modules `camelCase.ts`) and every created file has the standard header
- [ ] Async UI renders explicit loading/error/empty states; no floating promises

Testing:
- [ ] New pure-logic modules (schema, SRS, coach, paths, engines) have vitest unit tests under `src/**/__tests__/`
- [ ] Critical journeys have Playwright e2e tests that assert backend evidence (Supabase rows/log events via correlation IDs), not UI-only checks
- [ ] Failure paths (offline, fallback chain, retry exhaustion, checksum mismatch) have explicit tests

Git & release:
- [ ] Commits are path-form with a verified staged set; no `Co-Authored-By` trailers
- [ ] Version bumped via the canonical tool before committing source changes
- [ ] Dependencies changed via npm CLI only; no hand edits to `package.json`
- [ ] Deploys go through `npm run deploy` from this device; GitHub is never a deploy path

Documentation:
- [ ] Behavior-changing code updates triggered `/update-docs` and `/update-trackers` for the affected canonical docs and trackers
- [ ] Database schema claims verified against the live DB; applied migrations logged in `supabase/migrations/APPLIED.md`
