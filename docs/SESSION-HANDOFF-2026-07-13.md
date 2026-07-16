# Session Handoff — 2026-07-13 (Lane B runner: 11 e2e runs, 5 prod bugs fixed, coverage governance formalized)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/SESSION-HANDOFF-2026-07-13.md
**Description:** Superset handoff for the T-COV live-execution workstream (Lane B runner sessions of 2026-07-13). Supersedes SESSION-HANDOFF-2026-07-11.md. Read this + §1 files to resume without chat history.
**Author:** Libor Ballaty
**Created:** 2026-07-13
**Last Updated:** 2026-07-13
**Last Updated By:** Libor Ballaty

## 0. Stream status (end of session)
- **Suite: 66/71 passing (runs 10 & 11 identical — fully deterministic, zero flake).** Trend across 11 runs: 25/38 → 66/71.
- **Five production bugs found by the suite, fixed, verified; two deployed live** (deploy 2026-07-13 ~12:50 → https://falamadeira.searchingfool.com, 6/6 prod smoke green): LT6 tutor-switch column, LT7 admin-requests RLS (both via migration 00009, applied live + committed f5606d4), LT8 voice-limit clobber race (builder-authored, runner-verified, 715c9b7), LT9 offline-grades-dropped five-site getUser→getSession fix (869dc7c) + sync-queue hardening (78ddfd0).
- **Lanes (see E2E-LIVE-RUN-TRACKER "Lane" section):** A = builder (Codex, sandboxed — no ports/DB/push; owns tests/e2e/**), B = runner (this session's role — live execution, DB probes, product fixes, tracker truth), C = read-only discovery.
- **Coverage methodology formalized globally:** `test-coverage-governance` skill, 4-agent parity (ai-dev-dotfiles 80bfef3, 9c89e75) + Playwright Known Pitfalls in repo-specs (7 verified patterns).

## 1. Read first (absolute paths)
1. `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/E2E-LIVE-RUN-TRACKER.md` — THE live worklist: run log 1–11, EF-1…EF-31 discrete items with statuses/owners, PF-1…PF-10 product findings, Gap Analysis v2 (GA-1…GA-3), CS-1…CS-8 gate hardening, lane split + handoff protocol.
2. `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/REQUIREMENTS-TRACKER.md` — LT queue (LT1–LT10; LT10 open) + FE1–FE3.
3. `/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/AGENTS.md` — repo governance.
4. `~/.claude/skills/test-coverage-governance/SKILL.md` — the methodology contract both lanes follow.

## 2. Repo state (at handoff)
- Branch `main`, in sync with origin through **f5606d4**. Nothing staged by this session.
- **Dirty worktree = Lane A's ACTIVE in-flight batch — do not commit/clean:** tests/e2e/** (many modified + new specs), `scripts/crawl-interactive-controls.mjs` + `scripts/check-control-crawl-drift.mjs` (CS-1 implementation in progress), `scripts/check-interactive-coverage.mjs`, `scripts/preflight.sh`, `src/features/practice/usePractice.ts`, `src/features/session/DailySessionView.tsx` (possibly PF-5 in progress), `src/platform/{web,native}/notifications.*` (A6), `docs/AUDIT-FIX-TRACKER.md`, `.aidevops/`, plus deleted-in-tree `src/features/tutor/UpgradeModal.tsx` and `src/platform/web/probe.ts` (operator rm list).
- Untracked scratch: `.probe-tmp.mjs` (Lane B diagnostic probe — gitignored, safe to delete or REUSE for LT10, it has the full instrumentation), `artifacts/` (run snapshots e2e-run1…11, tgz — local evidence, not committed).
- Key commits this session (all pushed): f2673f1/f3fba3b (tracker bootstrap + coverage review) · 80bfef3/9c89e75 (dotfiles: skill + parity) · 6bbc3d0 (run 2 + LT6/7 closure) · 869dc7c (LT9 fix) · 715c9b7 (LT8) · fe1198d (deploy note) · 78ddfd0 (sync-queue hardening) · 3e573d7 (EF-31/LT10) · b1e65eb (Gap Analysis v2) · f5606d4 (migration 00009 landed).

## 3. Open work, priority order
1. **PF-5 (product, tiny):** two identical "Today's Session" headings in one section — differentiate (Home card label vs session view title). Unblocks user/24. Lane A may already be on it (DailySessionView.tsx dirty).
2. **LT10 / EF-31 (product, scoped):** gotrue session-restoration race on offline-RELOADED pages strands the queue replay (wire-proven: unauthenticated 401 POST in some timings; lock-hang with zero POSTs in others). Fix spec'd in EF-31: timeout-guarded `getSession()` → if no session and refresh token exists, timeout-guarded `refreshSession()` once → drain; extend retry ladder 3s/10s/30s. Acceptance = user/30 in-suite ×3. Consider an upstream supabase-js issue report.
3. **GA-1 / PF-10 (product):** offline write-queue covers ONLY mastery_items — route missions, simulator completions, pronunciation attempts, quiz `completed_lessons` (PF-7), and profile prefs through the proven `enqueue` seam; one e2e per path after.
4. **Lane A spec fixes:** user/04 + user/21 (quiz answer-loop family, diagnoses in EF-16/EF-23), user/32 (its own new spec), EF-30 audio-first card variant.
5. **Journeys (cheap chains):** support round-trip, video-suggestion lifecycle, path-switch second half (GA-3).
6. Quiz architecture decisions (PF-6/8/9): pack review_items adoption, scoring-vs-feedback normalization mismatch, mastery emission from quiz answers.
7. Operator items (owner): Azure Speech key (LT3), Supabase Auth Site URL, rotate admin temp password + delete `.admin-temp-credentials.txt`, rotate dev Gemini key, throwaway auth-user cleanup decision, rm batch (incl. `.probe-tmp.mjs`, `_valpack.mjs`, UpgradeModal.tsx, probe.ts…), CG-6 publish-coverage decision.

## 4. Methodology to reuse (proven this session)
- **Runner discipline:** claim `tests/e2e/.auth/e2e-suite-run.lock` via queuectl for EVERY run (CS-6); snapshot `test-results/` + run log into `artifacts/e2e-runN-<date>/` (tgz) BEFORE the next run; `cmd > log 2>&1; echo REAL_EXIT=$?` — NEVER pipe-then-$? (masked a 3/3 failure once this session).
- **Probe-before-classify:** REST probe with the test user's token from `tests/e2e/.auth/test-user.json` (strip quotes from .env.local values!); pg direct to `db.gxlrmdfqcqimwwplrdgd.supabase.co:5432` (password `SUPABASE_DB_PASSWORD` in .env.local) for RLS/pg_policy/schema truth; `.probe-tmp.mjs` for browser-level forensics (IDB put/get spies, console+network capture, online-event spy — dev server for logger visibility, preview for prod-build behavior); Playwright trace.zip → unzip → `0-trace.network` NDJSON for wire truth of failed spec runs.
- **Suite:** `npx playwright test --reporter=line` (~4.5–5m, webServer builds dist); prod smoke `BASE_URL=https://falamadeira.searchingfool.com npx playwright test --grep @smoke`; coverage gate `npm run test:e2e:coverage`.
- Deploy ONLY via `npm run deploy` from this device (ship gate incl. coverage contract). Owner needs hard refresh post-deploy (SW).

## 5. Empirically verified vs inferred (this session's deltas)
- **Verified live:** migration 00009 column+policy; tutor switch + admin requests end-to-end in UI; offline grade→durable queue→drain (no-reload path: `SYNC_QUEUE_FLUSHED synced 1`); offline reload keeps session (post-LT9); LT8 dirty-flag correctness; deploy artifacts + 6/6 prod smoke; seed sweep (62 rows); suite determinism (runs 6/7 and 10/11 identical).
- **Verified-broken (evidence in EF-31):** reconnect replay after OFFLINE reload — two wire-captured failure modes.
- **Inferred (unverified):** PF-5's fix unblocks user/24 fully; gotrue upstream lock behavior beyond our capture; quiz distractor-collision frequency (PF-9) not measured.

## 6. Governance (unchanged, non-negotiable)
Work on main; path-form commits after `git status` staged-set verification; NO Co-Authored-By trailers; reserve shared files via queuectl before writes (tracker files especially); one suite runner at a time; Lane B never edits tests/e2e/** (Lane A's scope); no bulk deletes; errors via src/lib/logger.ts with correlation IDs; deploy only via npm run deploy.
