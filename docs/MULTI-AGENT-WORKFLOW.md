# Multi-Agent Workflow — how several agents build FalaMadeira without stepping on each other

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/MULTI-AGENT-WORKFLOW.md
**Description:** Human-readable, picture-first guide to the worktree + branch + coordination model for multiple agents (and a live-testers release line). Companion to AGENTS.md §4/§7.
**Author:** Lane B (with assistant)
**Created:** 2026-07-14
**Last Updated:** 2026-07-14
**Last Updated By:** Lane B (with assistant)

---

## 1. The one idea

> **A folder holds one branch. Give each line of work its own folder (worktree). One shared `.git` underneath ties them together.**

So agents don't share a branch — they each get their own *folder on disk*, on their own *branch*. Nobody's `git checkout` ever yanks the floor out from under anyone else.

---

## 2. The workshop layout (each folder = a worktree = one branch)

```
   ┌─────────────────────────  ONE repository (single shared .git)  ─────────────────────────┐
   │                                                                                          │
   │   📁 fala_madeira/            → branch: develop   → integration line + docs + test runs  │
   │   📁 fala_madeira-feat/       → branch: feat/*    → Agent E  (enhancements)              │
   │   📁 fala_madeira-support/    → branch: fix/*     → Agent S  (support-ticket fixes)      │
   │   📁 fala_madeira-content/    → branch: content/* → Agent C  (lesson content, feedback-driven) │
   │   📁 fala_madeira-release/    → branch: main      → releases + `npm run deploy` ONLY     │
   │                                                                                          │
   └──────────────────────────────────────────────────────────────────────────────────────┘
         each folder has its OWN node_modules / dist ; they share only the .git history
```

- **Agent D (design/docs)** works in the base `fala_madeira/` on `develop` (docs rarely collide).
- **Agent T (tests)** runs the suite in `fala_madeira/` on `develop` — the integration point everyone merges into.
- **Agent C (content)** works in `fala_madeira-content/` on `content/*`, improving lesson content (situations/packs, `src/content/**`) from tester/coach feedback. Content is data (CONTENT-ARCHITECTURE §modular), so it flows the same way: `content/*` → merge to `develop` → ships in the next release. Tester content complaints land in `TESTER-FEEDBACK-TRACKER.md`; Agent C picks them up there.
- Need a hotfix while `develop` has half-done work? Spin up `fala_madeira-hotfix/` on `hotfix/*`, fix, merge, remove it.

---

## 3. How work flows (feature → develop → main → testers)

```
   Agent E   feat/loops     ●──●──●──┐
                                     │
   Agent S   fix/tickets    ●──●─────┤     merge when each is done
                                     ▼
                        ┌────────  develop  ────────┐      Agent T runs the FULL
   Agent D   docs ──────┤   (everything integrates)  │◄──  regression here. Green?
                        └───────────┬───────────────┘      → cut a release.
                                    │  (in the release folder only)
                                    ▼
                                  main  ──►  bump + tag  ──►  🧪 deploy to staging (testfalamadeira.searchingfool.com)  ──►  verify  ──►  🚀 deploy to PROD (falamadeira…) → testers
                                    │
                                    └──────── back-merge main → develop (carry the version bump) ───►
```

---

## 4. A release does NOT stop anyone (the snapshot idea)

The release is just a **photo of `develop` at one moment**. Agents keep working; later commits ride the *next* release.

```
   develop:   A ── B ── C ─────── D ── E ── F ──►   (agents keep committing the whole time)
                        │
                        └─ release taken here  →  ships A B C
                                                  D E F automatically go in the NEXT release
```

- Merging `develop`→`main` happens in the **release folder** and reads develop's *committed history* — it never touches the base folder's files.
- The only decision is **when** to take the photo (right after tests are green), made on the shared tracker. That's timing, not a work-stoppage.

---

## 5. The safety nets (why agents don't collide)

```
   ①  Worktrees + branches   → separate desks. Different folders, different branches. No elbow-bumping.
   ②  queuectl reservations  → an "I've got this" sign on SHARED files any agent might touch
                               (trackers, AGENTS.md, migrations, config.ts). Reserve → edit → release.
   ③  Shared trackers        → the whiteboard: who's doing what + every deferral
                               (TESTER-FEEDBACK-TRACKER.md, E2E-LIVE-RUN-TRACKER.md).
   ④  Branch guard           → the bouncer. `npm run check:branch` + a pre-commit hook BLOCK a commit
                               if a folder is on the wrong branch (e.g. base folder drifted to main).
```

---

## 6. A day in the life

1. **E** opens `fala_madeira-feat/`, `git switch -c feat/loops`, builds the enhancement, commits there.
2. **S** opens `fala_madeira-support/`, `git switch -c fix/tickets`, fixes a ticket, commits there.
3. **D** updates design docs in `fala_madeira/` on `develop`; reserves the docs via `queuectl` first (shared files).
4. E and S each **merge their branch into `develop`** when done.
5. **T** runs `npm run test:e2e` on `develop`. Green ✓.
6. Someone cuts a release **in `fala_madeira-release/`**: `git merge --no-ff develop` → bump + tag → `npm run deploy` → push. Testers get it. Nobody else paused.
7. **Back-merge** `main`→`develop` so the version bump is everywhere.

---

## 7. Release checklist (the "press the button" steps)

```
   [ ] develop is green   (Agent T: full regression passed)
   [ ] shared tracker says "cutting release" (so nobody merges mid-cut)
   [ ] cd fala_madeira-release/  (on main)
   [ ] git merge --no-ff develop     (reconcile any main-only commits)
   [ ] version bump + CHANGELOG + tag vYYYY.MM.DD.N
   [ ] deploy to STAGING (testfalamadeira.searchingfool.com)  ;  verify there first   ← pre-release step
   [ ] deploy to PROD (→ Verpex falamadeira.searchingfool.com)  ;  verify prod
   [ ] git push main + tags
   [ ] back-merge main → develop
```

---

> **Staging / pre-release deploy — `testfalamadeira.searchingfool.com` (in flight — other agent):** the staging step is a pre-release
> verification target, separate from prod. The committed deploy scripts today ship only to prod
> (`falamadeira.searchingfool.com`); the staging target/flag is being built. It runs from the
> **release worktree** (on `main`), same as prod — deploy to staging → verify → then prod. Finalize
> this section + `scripts/deploy-verpex.sh` when the mechanism lands. Tracked as **INFRA-4**.

## 8. Setup choice — **Model B adopted (2026-07-14)**

- **Model A — shared develop:** feature agents all work in the base `fala_madeira/` on `develop`, isolated only by `queuectl` file reservations. *Simplest (one `node_modules`), but agents share one working tree — more reservation traffic, and a test build can read files another agent is mid-edit.*
- **Model B — a worktree per agent (pictured above):** each agent gets its own folder + feature branch. *True isolation, no working-tree contention; costs one `node_modules` per folder + merges into develop.* **Recommended for genuinely independent parallel agents.**

**Adopted: Model B.** The branch guard (`npm run check:branch` + the `.githooks/pre-commit` hook) enforces its rules: base = `develop`, feature worktrees = a topic branch (never `develop`/`main`), `*-release` = `main`.

---

## 9. Agent roles & orchestration (read this to coordinate the fleet)

An **orchestrator** agent coordinates the others: it reads the trackers, assigns each open item to a role, sequences merges + release cuts, and audits branch discipline. It does not write feature code itself.

### Roles
| Role | Worktree / branch | Owns | Picks up work from | Merges to |
|---|---|---|---|---|
| **Orchestrator** | any (read-mostly) | assignment, sequencing, release timing, audits (`npm run check:branch`) | the trackers | — |
| **E — enhancements** | `fala_madeira-feat/` · `feat/*` | new features (`src/features/*`) | REQUIREMENTS-TRACKER, owner requests | `develop` |
| **S — support/bugs** | `fala_madeira-support/` · `fix/*` | tester bug fixes | TESTER-FEEDBACK-TRACKER (`TB-*`) | `develop` |
| **C — content** | `fala_madeira-content/` · `content/*` | lesson content (`src/content/**`, situations/packs) | TESTER-FEEDBACK-TRACKER (content), coach feedback | `develop` |
| **D — design/docs** | base · `develop` | design docs, plans, requirements | owner, plans | `develop` |
| **T — tests/QA** | base · `develop` (or a feature worktree pre-merge) | regression runs, test hardening | E2E-LIVE-RUN-TRACKER | `develop` (test files) |
| **Release** | `fala_madeira-release/` · `main` | merge `develop`→`main`, bump/tag, `npm run deploy` | orchestrator signal (develop green) | `main` (+ back-merge `develop`) |

### Orchestration loop
1. **Read the three trackers** → the open-work list + statuses (TESTER-FEEDBACK, E2E-LIVE-RUN, REQUIREMENTS).
2. **Assign** each item to a role by type (bug→S, feature→E, content→C, design→D); record the assignment + owner in the tracker.
3. Each role **reserves its files** (`queuectl`), works in its own worktree, updates the tracker, **merges to `develop`** when green.
4. **T runs `npm run test:e2e` on `develop`** after merges; logs results in E2E-LIVE-RUN-TRACKER.
5. When `develop` is green and a shipment is wanted, the orchestrator **signals a release cut** (tracker note "cutting release"); the **Release** role merges `develop`→`main` in the release worktree, bumps/tags, deploys, back-merges. Nobody else pauses (§4 snapshot).
6. Orchestrator periodically runs **`npm run check:branch`** to confirm every worktree is on its allowed branch.

### What every agent reads first
`AGENTS.md` (repo contract) → §7 (coordination) → **this doc** for its role + the flow → the **trackers** for current work. Reserve before writing; log every deferral (never "not our lane").

