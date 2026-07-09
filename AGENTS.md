# AGENTS.md — FalaMadeira development principles & workflow

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/AGENTS.md
**Description:** Repo-local development principles, canonical-doc map, skill/workflow contract, and operating facts for FalaMadeira. Owns project-specific workflow; inherits the cross-project baseline. Read this first when starting work in this repo.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** dev-principles review

## 0. Baseline (inherited, do not restate)

Follow the global operating standard: `/Users/liborballaty/.ai-dev-dotfiles/memories/agentic-operating-standard.md` (mirrored in `~/.claude/CLAUDE.md`). This file adds *project-specific* workflow and truth; the global baseline governs everything not overridden here.

## 1. Canonical documents (source of truth — read before building)

| Doc | Owns |
|---|---|
| `docs/PRODUCT-DESIGN-TARGET.md` | Full-product target: vision, UX principles, scope, data model |
| `docs/CONTENT-ARCHITECTURE.md` | **Authoritative** modular content model, path types, engines, feedback loop, offline; governs on any conflict with the target doc |
| `docs/REQUIREMENTS-TRACKER.md` | Requirement → plan step → status register |
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

## 4. Skill / workflow contract (which skills we use, when)

- **Plan work:** `/plan` (+ `/decompose-work-packages` for dependency/parallel structure). Plans are executable and consumed by `/execute-plan`.
- **Execute:** `/execute-plan <plan>` — autonomous DAG walk, checkpointed in `.plan-state.yaml`, resumable via `/execute-plan --resume`.
- **On any failure:** `/troubleshoot` — structured, logging-first root-cause loop. Do NOT patch symptoms or guess request formats; isolate one variable, verify against canonical docs. (Used correctly for the Gemini TTS `OTHER` defect.)
- **Quality:** `/error-review` (harden error paths after a fix or proactively), `/code-review` (correctness on the diff), `/simplify` (reuse/altitude cleanups).
- **Docs & trackers:** `/update-docs` (Tiers 1/2/4 canonical/derived/architecture docs) and `/update-trackers` (Tier 3 trackers) after code changes; hard boundary between them.
- **Coordination:** `shared-file-coordination` before editing shared/canonical files (global queue + queuectl).
- **Versioning:** `/version-bump` in the commit-staging workflow when source changes (never via pre-commit hook).
- **UI/behavior verification:** `/ui-test` (live UI flows, session/correlation capture) and `/verify` (run the app, observe the change).
- **Security:** `/security-review` on pending changes touching auth/RLS/secrets/edge functions.
- **Session:** `/session-refresh` to re-anchor on this file + canonical docs; `/handoff` at end of session.

## 5. Operating facts (verified 2026-07-09)

- **Supabase project:** `gxlrmdfqcqimwwplrdgd` ("PortugueseMadeira", org `gvvowvskmczwwlniyfzb`, West EU/London), owned by the **liborballaty** account (NOT the Arion CLI login). CLI auth via `SUPABASE_ACCESS_TOKEN` in `.env.local`.
- **DB connection:** direct `postgresql://postgres:<pw>@db.gxlrmdfqcqimwwplrdgd.supabase.co:5432/postgres` (IPv6). The region pooler host is wrong for this project. Runner: `node apply-migrations.js <sql>` (ESM, direct host, argv path). Migrations 00001–00004 applied; log in `supabase/migrations/APPLIED.md`.
- **dotenv gotcha:** dotenv v17 prints a stdout tip — never capture env values via `$(node -e "require('dotenv')...")`; parse `.env.local` directly or use `{quiet:true}`, else the DB password gets corrupted and SASL auth fails.
- **Edge functions:** `gemini` (chat/generate/translate/tts, JWT-verified, voice-limit enforced) + `delete-account`, deployed. Gemini TTS validated+retried for the intermittent `finishReason=OTHER` empty-audio defect.
- **Admin account:** `liborballaty@gmail.com` (role=admin; temp creds in git-ignored `.admin-temp-credentials.txt`).
- **Deploy target:** Verpex, document root = the `falamadeira.searchingfool.com` directory ONLY. Deploy from THIS device (`npm run deploy` → `scripts/ship.sh`), never GitHub. GitHub = source hosting only.
- **TTS default (decided):** Azure pt-PT + browser Web Speech fallback, via provider adapters.
- **Stack:** React 19 + TypeScript ~5.8 + Vite 6 + Tailwind 4 + Supabase + PWA (vite-plugin-pwa). **Cross-platform:** iOS-first then Android via **Capacitor** wrapping the same web codebase; platform-specific capabilities (speech/audio/storage/notifications) live behind a `src/platform/*` adapter layer so the UI never needs a per-platform rewrite. Web ships to Verpex; iOS ships via Xcode/TestFlight.

## 6. Harness guardrails (work WITH them)

- **`Edit(**/package.json)` and `Edit(**/requirements.txt)` are DENIED** by global settings — modify dependencies via the `npm` CLI (`npm install -D …`, `npm pkg set …`), never by hand-editing the manifest. Bypass mode does NOT lift deny rules.
- **Bulk-delete is forbidden** (global standard + guards) — one explicit `rm <path>` per file, never `find -delete`/`xargs rm`/`rm -rf <glob>`.
- **Git:** work on `main` (greenfield, owner directive); path-form commits; verify the staged set before committing; **no `Co-Authored-By` trailers**.
