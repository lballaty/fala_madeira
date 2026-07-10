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
