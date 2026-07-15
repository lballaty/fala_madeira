#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/ship.sh
# Description: Plan step P7 (web-deploy-pipeline). The `npm run deploy` orchestrator: the single
#   entry point that ships FalaMadeira's web build to Verpex from THIS device (AGENTS.md §5 —
#   deploy from this device, never GitHub). It runs, in order:
#     1. scripts/preflight.sh   — the recurring quality gate (eslint, tsc, vitest, build, audit,
#                                 standards). MUST pass; ship.sh aborts if it fails.
#     2. scripts/deploy-verpex.sh "$@"  — uploads dist/ ONLY into the scoped
#                                 falamadeira.searchingfool.com directory. All flags pass through,
#                                 so `--dry-run` and `--no-build` reach the deploy script.
#
#   Usage (via npm, note the `--` so npm forwards the flag to this script):
#     npm run deploy -- --dry-run     # credential-free pipeline gate: validate + print plan, NO upload
#     npm run deploy                  # real deploy (requires .env.deploy; see deploy-verpex.sh header)
#     npm run deploy -- --no-build    # reuse existing dist/
#   Direct: bash scripts/ship.sh [--dry-run] [--no-build]
#
#   NOTE ON --dry-run + PREFLIGHT: the dry-run still runs the full preflight first, because a real
#   deploy will too — the dry-run gate is meant to prove the WHOLE pipeline is green, artifact and
#   all, before an operator adds credentials. Preflight itself runs a build; deploy-verpex --dry-run
#   builds again to validate the exact dist/ it would ship. Set SKIP_PREFLIGHT=1 to bypass preflight
#   for a fast artifact-only dry-run check (not the shippable gate).
#
#   OPERATOR STEPS to go live are documented in scripts/deploy-verpex.sh and .env.deploy.example:
#     - populate .env.deploy (git-ignored) from .env.deploy.example
#     - set Supabase Auth Site URL + Redirect URLs to https://falamadeira.searchingfool.com
#       (dashboard, project gxlrmdfqcqimwwplrdgd) — do this in the console, not from this script.
# Author: Libor Ballaty (with assistant)
# Created: 2026-07-10

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; B=$'\033[1m'; N=$'\033[0m'; else G=""; R=""; B=""; N=""; fi
say() { printf '\n%s========================================%s\n%s[ship]%s %s\n%s========================================%s\n' "$B" "$N" "$B" "$N" "$1" "$B" "$N"; }
die() { printf '%s[ship FATAL]%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

# --- 0. Version bump at the RELEASE CUT (auto) -------------------------------------------------
# Bumps VERSION + package.json via the canonical ~/.ai-dev-dotfiles/tools/version-bump.py exactly
# when a release is being cut — NOT via a git hook (a hook can't bump the commit it gates; off-by-
# one). Gated so it fires once per cut and never on ordinary deploys:
#   • only on `main` (the release worktree — where releases are cut),
#   • only for a REAL deploy (skipped on --dry-run — dry-run must not mutate git),
#   • only when source (src/, supabase/functions/, public/) changed since VERSION was last bumped,
#     so repeated staging → approve → production deploys of the SAME commit do NOT re-bump.
# CHANGELOG prose stays a curated manual step; this WARNs if the new version has no entry.
# Bypass with SKIP_BUMP=1 (e.g. re-deploying an old artifact).
DRY_RUN=0; for a in "$@"; do [ "$a" = "--dry-run" ] && DRY_RUN=1; done
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
BUMP_TOOL="${HOME}/.ai-dev-dotfiles/tools/version-bump.py"
if [ "${DRY_RUN}" -eq 0 ] && [ "${BRANCH}" = "main" ] && [ "${SKIP_BUMP:-0}" -ne 1 ]; then
  if [ ! -f "${BUMP_TOOL}" ]; then
    printf '%s[ship]%s version-bump tool not found (%s) — skipping auto-bump; bump manually.\n' "$R" "$N" "${BUMP_TOOL}"
  else
    LAST_VER_COMMIT="$(git log -1 --format=%H -- VERSION 2>/dev/null || echo '')"
    SRC_CHANGED=1
    if [ -n "${LAST_VER_COMMIT}" ] && git diff --quiet "${LAST_VER_COMMIT}"..HEAD -- src supabase/functions public 2>/dev/null; then
      SRC_CHANGED=0
    fi
    if [ "${SRC_CHANGED}" -eq 1 ]; then
      say "STAGE 0/3 — version bump (release cut)"
      python3 "${BUMP_TOOL}" --repo-root "${REPO_ROOT}" --no-tag || die "version bump failed — aborting before deploy."
      NEW_VER="$(tr -d ' \t\n\r' < "${REPO_ROOT}/VERSION")"
      grep -q "^## ${NEW_VER}" "${REPO_ROOT}/CHANGELOG.md" 2>/dev/null || \
        printf '%s[ship]%s WARNING: CHANGELOG.md has no entry for %s — add one before release notes go out.\n' "$R" "$N" "${NEW_VER}"
      git commit VERSION package.json -m "chore(release): bump to ${NEW_VER} (auto, ship.sh)" || die "could not commit the version bump."
      printf '%s[ship]%s bumped + committed VERSION=%s\n' "$G" "$N" "${NEW_VER}"
    else
      printf '%s[ship]%s no source changes since the last version bump — not re-bumping (VERSION=%s).\n' "$G" "$N" "$(tr -d ' \t\n\r' < "${REPO_ROOT}/VERSION")"
    fi
  fi
fi

# --- 1. Preflight (quality gate) ---------------------------------------------------------------
if [ "${SKIP_PREFLIGHT:-0}" -eq 1 ]; then
  say "SKIP_PREFLIGHT=1 — skipping preflight (NOT the shippable gate)"
else
  say "STAGE 1/2 — preflight (scripts/preflight.sh)"
  bash "${SCRIPT_DIR}/preflight.sh" || die "preflight failed — fix the reported stage before deploying. Nothing was uploaded."
  printf '%s[ship]%s preflight PASSED.\n' "$G" "$N"
fi

# --- 2. Deploy (dist/ -> Verpex, scoped) -------------------------------------------------------
say "STAGE 2/2 — deploy (scripts/deploy-verpex.sh $*)"
bash "${SCRIPT_DIR}/deploy-verpex.sh" "$@" || die "deploy step failed (see above)."

printf '\n%s[ship]%s done.\n' "$G" "$N"
