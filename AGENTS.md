# AGENTS.md — FalaMadeira development principles & workflow

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/AGENTS.md
**Description:** Repo-local development principles, canonical-doc map, skill/workflow contract, and operating facts for FalaMadeira. Owns project-specific workflow; inherits the cross-project baseline. Read this first when starting work in this repo.
**Author:** Libor Ballaty
**Created:** 2026-07-09
**Last Updated:** 2026-07-16
**Last Updated By:** Libor Ballaty

## 0. Baseline (inherited, do not restate)

Follow the global operating standard: `/Users/liborballaty/.ai-dev-dotfiles/memories/agentic-operating-standard.md` (mirrored in `~/.claude/CLAUDE.md`). This file adds *project-specific* workflow and truth; the global baseline governs everything not overridden here.

## 1. Canonical documents (source of truth — read before building)

| Doc | Owns |
|---|---|
| `docs/PRODUCT-DESIGN-TARGET.md` | Full-product target: vision, UX principles, scope, data model |
| `docs/CONTENT-ARCHITECTURE.md` | **Authoritative** modular content model, path types, engines, feedback loop, offline; governs on any conflict with the target doc |
| `docs/REQUIREMENTS-TRACKER.md` | Requirement → plan step → status register |
| `docs/TESTER-FEEDBACK-TRACKER.md` | Tester-reported bugs + support workstream + **all deferrals** — shared across agents (see §7) |
| `docs/E2E-LIVE-RUN-TRACKER.md` | Live e2e run log + failure triage (EF-/PF-/CG- items) — shared across agents |
| `docs/ENGINEERING-STANDARDS.md` | Detailed architecture/security/design/coding standard (created by the `engineering-standards` plan step) |
| `docs/CONTENT-STANDARDS.md` | European-Portuguese/Madeiran content rules + validator |
| `plans/plan-2026-07-09-full-product.yaml` | **Authoritative executable plan** (55 steps, content-model-first, voice-first, cross-platform). Supersedes `plan-2026-07-08-production-readiness.yaml`. `plans/.plan-state.yaml` = execution state |
| `docs/DATABASE_DESIGN.md`, `supabase/migrations/APPLIED.md` | DB schema (reconciled to live) + migration log |

## 2. Product anti-drift guardrails (from CONTENT-ARCHITECTURE §12)

Every capability must serve one of **understand · speak · use · belong**. Also:
- **Voice-first** — default flows are listen/speak, not read/tap.
- **Modular content** — curriculum is data (Situations/Packs), grown by publishing packs, not code releases.
- **Non-linear** — never hard-gate sequence; always offer the guided default; keep the month-by-month Structured Course as one path type.
- **Madeira realism without gimmickry** — correct European Portuguese base, authentic local exposure.
- **Calm, honest, non-manipulative** — celebrate progress, no dark patterns, truthful scope, real consent.

## 3. Engineering principles (project)

- **Vertical slices** — a feature owns UI → edge function → data end-to-end (`src/features/*`). Match existing style; no second way to do an existing thing.
- **Centralized error handling + observability** — every error path routes through `src/lib/logger.ts` with correlation IDs and a user-visible code/Ref; no bare `console.error` in error paths; no hardcoded fallback secrets/URLs. (Global standard, enforced.)
- **Secrets server-side only** — Gemini/TTS keys live in Supabase edge-function secrets, never the client bundle. Anon key + RLS are the only client-side trust surface.
- **Reliability/resilience/offline** — retry+backoff + graceful degradation on all network/AI calls; content packs + audio cached; offline write queue syncs on reconnect (see CONTENT-ARCHITECTURE §10).
- **Accessibility** — WCAG 2.2 AA (contrast ≥4.5:1, labels, keyboard, 44–48px targets, pinch-zoom, reflow).
- **Config, not magic values** — `src/config.ts`; feature flags for staged capabilities.
- **Regression test with EVERY code change (MANDATORY, no exceptions).** Any change to code — bug fix, feature, refactor, even a one-line CSS/behavior tweak — MUST add or update an automated test that would FAIL before the change and PASS after, so the same issue cannot regress. A fix without a guarding test is incomplete. Unit test (vitest) for logic/hooks, e2e (Playwright) for user-facing/DB-backed behavior, asserting the real outcome (DB row, DOM state) not just "it ran." "Manually verified" / "code-read confirmed" is NOT a substitute for a suite test. If a change is genuinely untestable, say why explicitly and log the coverage gap in the tracker (owner + next action) — never silently skip. So: every change must ship with **additional/updated test coverage for that change**. (Directive 2026-07-14.)
- **Full regression before ANY release (MANDATORY gate).** No deploy/release — staging or prod — happens without a **full regression pass** on the exact state being shipped: `npm run test:e2e` (full Playwright suite) AND `npm test -- --run` (vitest), with every failure triaged first (known non-blockers explicitly noted). This is the first item in the `docs/MULTI-AGENT-WORKFLOW.md` §7 release checklist; the ship-gate preflight's coverage contract is NOT a substitute for the full suite. (Directive 2026-07-14.)
- **Requirements before code (MANDATORY approval gate).** No coding on a feature/enhancement/change begins until its requirements are (1) **clearly stated in writing** — the specific behaviour, UI, data model, and acceptance criteria, not a one-line report — and (2) **explicitly approved by the owner**. Tracker items captured from ad-hoc feedback are BACKLOG, not build orders: they stay `NEEDS REQUIREMENTS` → (spec written) → `NEEDS APPROVAL` → (owner approves) → only then `READY`/build. This prevents building the wrong thing from a loose description and forces the domain to be legible — e.g. define terms like "content pack", "situation", "track" in plain language as part of the spec (nobody outside the code should have to guess what they mean). Investigation, root-causing, and tracking are always allowed; *implementation* waits for an approved spec. (Directive 2026-07-14.)
- **Verification gate — `build` is NOT `typecheck`.** Vite/esbuild strip types without checking them, so a green build can hide type errors and un-awaited promises. Every code-step validation, `scripts/check-standards.sh`, and `scripts/preflight.sh` MUST run `npm run lint` (`tsc --noEmit`) AND `npm test -- --run` AND `npm run build` — never build alone. Run the whole-project gate per code-step (not only at the end); diff-scoped `/code-review`/`/error-review` do not catch cross-file type breakage. Use the `/verify-build` skill. (This rule closed the gap where 14 tsc errors accumulated behind build-only validations.)

## 4. Skill / workflow contract (which skills we use, when)

- **Plan work:** `/plan` (+ `/decompose-work-packages` for dependency/parallel structure). Plans are executable and consumed by `/execute-plan`.
- **Execute:** `/execute-plan <plan>` — autonomous DAG walk, checkpointed in `.plan-state.yaml`, resumable via `/execute-plan --resume`.
- **On any failure:** `/troubleshoot` — structured, logging-first root-cause loop. Do NOT patch symptoms or guess request formats; isolate one variable, verify against canonical docs. (Used correctly for the Gemini TTS `OTHER` defect.)
- **Quality:** `/verify-build` (whole-project compile+test+build gate — run per code-step and before commit/deploy; the mandatory gate, since `/code-review`/`/error-review` are diff-scoped and build ≠ typecheck), `/error-review` (harden error paths), `/code-review` (correctness on the diff), `/simplify` (cleanups).
- **Release readiness:** `/release-readiness` — audit against the production-readiness shortlist (core journeys, data-loss, monitoring, backups/restore, safe deploy/rollback, security, load, dependency resilience, support, metrics); run before launch, at handoffs, or on a cadence to catch drift. Writes `docs/RELEASE-READINESS.md`.
- **Docs & trackers:** `/update-docs` (Tiers 1/2/4 canonical/derived/architecture docs) and `/update-trackers` (Tier 3 trackers) after code changes; hard boundary between them.
- **Coordination:** `shared-file-coordination` before editing shared/canonical files (global queue + queuectl).
- **Versioning:** `/version-bump` in the commit-staging workflow when source changes (never via pre-commit hook).
- **Branching & worktrees (multi-agent shared checkout — MANDATORY):** the base repo checkout is shared by multiple agents on one device, so a branch switch in it conflicts — `git checkout`/`switch` yanks the working tree out from under every other agent. Therefore we use **worktrees, never branch switches in the base checkout**:
  - **Dev happens on `develop`** in the base checkout (`…/fala_madeira`); push to `origin/develop`. **Never `git checkout`/`switch` another branch in the base checkout.**
  - **Start new work with the provisioner — do NOT hand-roll `git worktree add`:** `bash scripts/setup-worktree.sh --issue <ID> <feat|fix|content>` creates `fala_madeira-<id>` **from `develop`** on `<kind>/<id>`, installs deps, generates the `claude-w` profile, and auto-copies the admin TEST creds (`.admin-temp-credentials.txt`). Real `.env*` secrets stay operator-only (the script prints the `cp` lines). Idempotent; `--help` for usage. For an existing/ad-hoc tree use `--wt <suffix>`; for the fixed fleet roles use `<role>`.
  - **Autonomy boundary (`execute-plan-autonomously`):** an approved plan runs autonomously through build → merge to `develop` → full regression, ending at a **green `develop`**. Cutting a release (merge `develop`→`main`), version-bump, tag, and any **staging/production deploy are operator-only** (see "Cutting a release" below) — an agent never stages or deploys.
  - **`main` = release/production.** Any work needing a different branch (release, hotfix, throwaway spike) uses a **dedicated git worktree**: `git worktree add ../fala_madeira-<purpose> <branch>` → work there → `git worktree remove` when done.
  - **Cutting a release** (in a `main` worktree only): `git worktree add ../fala_madeira-release main` → `git merge --no-ff develop` → `/version-bump` (CalVer) + update `CHANGELOG.md` → commit → tag `vYYYY.MM.DD.N` → **`npm run deploy:staging`** (→ testfalamadeira; verify) → **`npm run deploy:approve`** → **`npm run deploy:production`** (→ falamadeira; REFUSED unless this commit was staged+approved — enforced in `deploy-verpex.sh`) → push `main` + tags → `git worktree remove ../fala_madeira-release`.
  - Version bumps, release commits, tags, and deploys happen **only** in the release worktree — never in the shared `develop` checkout.
- **UI/behavior verification:** `/ui-test` (live UI flows, session/correlation capture) and `/verify` (run the app, observe the change).
- **Security:** `/security-review` on pending changes touching auth/RLS/secrets/edge functions.
- **Edge-glue agentic review (MANDATORY for any `supabase/functions/**` diff — owner decision 2026-07-17):** edge functions run on Deno (`https://esm.sh` imports + `Deno.*`), so their **decision logic** is covered by extracting it into a pure sibling module unit-tested in vitest (EN-27 pattern — `docs/TEST_MANUAL.md §8`), but the thin `Deno.serve` request→response **glue has no automated test by decision** (the `deno` harness was declined; EN-24). Instead, that glue is covered by an **agentic review activity**: any diff touching an edge function gets a `/code-review` (or `/security-review` when auth/secrets are involved) that applies the **edge-glue checklist in `docs/TEST_MANUAL.md §8`** — the handler calls the pure tested core, checks `{error}` on every Supabase call, returns the canonical `errorResponse` envelope (never a raw string/500, never a leaked `dbMessage`), and `persistLog`s on error. This review is part of the change's Definition of Done, alongside the vitest core test.
- **Session:** `/session-refresh` to re-anchor on this file + canonical docs; `/handoff` at end of session.

## 5. Operating facts (verified 2026-07-09)

- **Supabase project:** `gxlrmdfqcqimwwplrdgd` ("PortugueseMadeira", org `gvvowvskmczwwlniyfzb`, West EU/London), owned by the **liborballaty** account (NOT the Arion CLI login). CLI auth via `SUPABASE_ACCESS_TOKEN` in `.env.local`.
- **DB connection:** direct `postgresql://postgres:<pw>@db.gxlrmdfqcqimwwplrdgd.supabase.co:5432/postgres` (IPv6). The region pooler host is wrong for this project. Runner: `node apply-migrations.js <sql>` (ESM, direct host, argv path). Migrations 00001–00004 applied; log in `supabase/migrations/APPLIED.md`.
- **dotenv gotcha:** dotenv v17 prints a stdout tip — never capture env values via `$(node -e "require('dotenv')...")`; parse `.env.local` directly or use `{quiet:true}`, else the DB password gets corrupted and SASL auth fails.
- **Edge functions:** `ai-gateway` (chat/generate/translate/tts, JWT-verified, voice-limit enforced; renamed from `gemini`) + `delete-account`, deployed. Gemini TTS validated+retried for the intermittent `finishReason=OTHER` empty-audio defect.
- **Admin account:** `liborballaty@gmail.com` (role=admin; temp creds in git-ignored `.admin-temp-credentials.txt`).
- **Deploy target:** Verpex, document root = the `falamadeira.searchingfool.com` directory ONLY. Deploy from THIS device (`npm run deploy` → `scripts/ship.sh`), never GitHub. GitHub = source hosting only.
- **TTS default (decided):** Azure pt-PT + browser Web Speech fallback, via provider adapters.
- **Stack:** React 19 + TypeScript ~5.8 + Vite 6 + Tailwind 4 + Supabase + PWA (vite-plugin-pwa). **Cross-platform:** iOS-first then Android via **Capacitor** wrapping the same web codebase; platform-specific capabilities (speech/audio/storage/notifications) live behind a `src/platform/*` adapter layer so the UI never needs a per-platform rewrite. Web ships to Verpex; iOS ships via Xcode/TestFlight.

## 6. Harness guardrails (work WITH them)

- **`Edit(**/package.json)` and `Edit(**/requirements.txt)` are DENIED** by global settings — modify dependencies via the `npm` CLI (`npm install -D …`, `npm pkg set …`), never by hand-editing the manifest. Bypass mode does NOT lift deny rules.
- **Bulk-delete is forbidden** (global standard + guards) — one explicit `rm <path>` per file, never `find -delete`/`xargs rm`/`rm -rf <glob>`.
- **Git:** feature work on `develop` in the base checkout; releases/deploys ONLY from a `main` worktree (see §4 Branching & worktrees — testers are live, `main` must stay deployable). Path-form commits; verify the staged set before committing; **no `Co-Authored-By` trailers**.

## 7. Shared trackers & coordination (ALL agents — 2026-07-14)

Multiple agents work this repo in parallel; convergence depends on shared state, not private notes. **No agent "owns" a part of the product.** There are no fixed lanes or role identities — any agent may work any area. Coordination, not ownership, is what keeps agents off each other's toes. Every agent is responsible for: (1) claiming its task **and** its files via the reservation queue before writing; (2) not overwriting or stepping on another agent's in-flight work; (3) shipping the **tests** that reflect its change (new/updated unit + e2e for the UI or functionality it touched — see §3); (4) committing incrementally and keeping its worktree current against the moving base (see the last two bullets).

- **Same trackers, single source of truth:** `docs/TESTER-FEEDBACK-TRACKER.md` (tester bugs + support workstream + all deferrals), `docs/E2E-LIVE-RUN-TRACKER.md` (e2e run log + triage), `docs/REQUIREMENTS-TRACKER.md` (requirement→plan→status). Cross-repo platform/release work: `aidevops/plans/*.yaml` + `aidevops/design/TODO.md`.
- **Deferral rule (standing):** no item is closed by declaring it someone else's responsibility. Every deferred, rerouted, or declined item is logged in the relevant tracker above with **status + owner + next action** before moving on, and surfaced in the reply — never silently dropped.
- **Task-claim-first reservation (before ANY write or picking up work) — two tiers** (full design: `docs/COORDINATION-V2-TASK-CLAIM-REQUIREMENTS.md`):
  - **Tier 1 — task claim (durable, tracker-bound):** claim the tracker item you're working on: `queuectl claim-task --agent <you> --tracker <ID> --working-on "<what>"`. It is durable — it survives long analysis with **no** file writes, and it survives session/agent switches. Any of your agents may `resume` an idle claim or `handoff`/take over an active one, but only **one active holder** exists at a time (lease + heartbeat); every transfer is logged. This is the "who owns this work end-to-end" board (`queuectl show`).
  - **Tier 2 — file lock (ephemeral, subordinate):** take short write-locks **under** that claim: `queuectl reserve --agent <you> --files <paths> --task <ID>`. `verify` before first write, `renew` for long work, `release` when the write burst is done.
  - **No file lock without a covering task claim.** An agent-facing guard enforces this (warn now → block after a soak): on an uncovered write it instructs the agent to `claim-task` then `reserve --task` then retry, and the agent **self-remediates** — it never prompts the owner. Split parallel work by disjoint write scope.
  - **Rollout:** the task-claim tier lands in the platform `queuectl` (aidevops) + a global PreToolUse guard. Until it is live everywhere, keep using `queuectl reserve --agent <you> --working-on "<task>" --files <paths>` (the `--working-on` note is your interim task claim), and never edit shared/canonical files without an active claim.
- **Worktree/branch model = Model B (adopted 2026-07-14; see `docs/MULTI-AGENT-WORKFLOW.md` for the picture-first guide):** one worktree per line of work — base `fala_madeira/` on `develop` (integration + docs + test runs), each agent's feature/content work in its own `fala_madeira-<name>/` worktree on a topic branch (`feat/*`, `fix/*`, `content/*` for lesson-content work), releases + deploy ONLY in `fala_madeira-release/` on `main`. Feature branches merge into `develop`; a release cut merges `develop`→`main` in the release worktree, then back-merges to `develop`. A release never stops `develop` — it snapshots develop's committed HEAD. **Worktrees are organized by function, not fenced by it** — they are a convenience for isolation, not exclusive territory. When splitting a change across worktrees would be impractical (tightly-coupled edits, a fix that spans "feature" and "support" surfaces), it is fine to do the related work in a single worktree and merge it to `develop`; **file reservations — not worktree boundaries — are what prevent write collisions.**
- **Incremental commits (MANDATORY — this was not happening):** commit in small, self-contained units as each change validates — do NOT batch a session's work into one large commit. Small commits keep work durable and reviewable, and they stop the shared `.git` index from sweeping another agent's still-uncommitted files into your commit (use path-form commits + verify the staged set — §6). A validated step is a commit.
- **Keep your worktree current against the moving base (MANDATORY — this was not happening):** `develop` (and, after a release back-merge, `main`) advances *while you work*, so the base your branch sits on is a moving target — the ground you're building against changes. Regularly pull the current base into your worktree branch: `git -C <your-worktree>` → `fetch origin` → `merge origin/develop`. Do this **at the start of each work session, before you open a merge into `develop`, and immediately after any release/back-merge lands.** A worktree left to drift from `develop` turns a clean merge into a conflict-heavy one and risks building/shipping against stale code.
- **Branch guard (enforced):** run `npm run check:branch` at session start / periodically (reports every worktree vs its allowed branch). A pre-commit hook (`.githooks/pre-commit`, enabled via `git config core.hooksPath .githooks`) BLOCKS a commit if the worktree is on the wrong branch — base must be `develop`, feature worktrees must be a topic branch (never `develop`/`main`), `*-release` must be `main`. One-time per fresh clone: `git config core.hooksPath .githooks`.
