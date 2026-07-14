#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/setup-worktree.sh
# Description: INFRA-5 — one-command provisioner for the Model B agent worktree fleet
#   (AGENTS.md §4, docs/MULTI-AGENT-WORKFLOW.md §8/§9). Given a ROLE it: creates the
#   worktree on its allowed branch if missing, installs node_modules, generates a
#   PATH-CORRECT claude-w launcher profile for that worktree (solving the path-bound
#   profile problem — profiles are generated per path, never hand-maintained), and
#   prints the operator-only secret-copy commands. Secret copies (.env.local/.env.deploy)
#   are NOT run here: the agent harness hard-denies `cp` of .env* and spreading
#   credentials is the operator's call. Idempotent — safe to re-run.
# Author: Lane A (with assistant)
# Created: 2026-07-14
#
# Usage:
#   bash scripts/setup-worktree.sh <role> [branch] [--no-install] [--print-profile]
#     role   : feat | support | content | release
#     branch : optional topic branch to create/switch (feat/support/content only;
#              default <prefix>/scratch). Ignored for release (always `main`).
#     --no-install    : skip `npm install`
#     --print-profile : print the generated profile JSON to stdout as well
#
# After running, the printed `cp` lines must be run by the OPERATOR (via `!` in the
# agent prompt, or a normal shell) to provision secrets. Then launch the role agent with:
#   claude-w --profile falamadeira-<role>-dev
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PARENT="$(cd "${REPO_ROOT}/.." && pwd)"
DOTFILES="${HOME}/.ai-dev-dotfiles"
PROFILES_DIR="${DOTFILES}/.claude-w/profiles"

die() { echo "setup-worktree: $*" >&2; exit 1; }
say() { echo "▸ $*"; }

# --- args ---
ROLE="${1:-}"; [ -n "${ROLE}" ] || die "role required: feat | support | content | release"
shift || true
BRANCH_ARG=""; NO_INSTALL=0; PRINT_PROFILE=0
for a in "$@"; do
  case "$a" in
    --no-install) NO_INSTALL=1 ;;
    --print-profile) PRINT_PROFILE=1 ;;
    --*) die "unknown flag: $a" ;;
    *) BRANCH_ARG="$a" ;;
  esac
done

# --- role table: suffix | default branch | env_local | env_deploy | write scopes (space-sep, repo-relative) ---
case "${ROLE}" in
  feat)    SUFFIX=feat;    DEF_BRANCH="feat/scratch";    NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src public supabase/functions" ;;
  support) SUFFIX=support; DEF_BRANCH="fix/scratch";     NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src public supabase/functions" ;;
  content) SUFFIX=content; DEF_BRANCH="content/scratch"; NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src/content public" ;;
  release) SUFFIX=release; DEF_BRANCH="main";            NEED_LOCAL=1; NEED_DEPLOY=1; SCOPES="." ;;
  *) die "unknown role '${ROLE}' (feat | support | content | release)" ;;
esac

WT="${PARENT}/fala_madeira-${SUFFIX}"
BRANCH="${BRANCH_ARG:-${DEF_BRANCH}}"

# --- 1. create worktree if missing ---
if git -C "${REPO_ROOT}" worktree list --porcelain | grep -qx "worktree ${WT}"; then
  say "worktree exists: ${WT}"
else
  say "creating worktree ${WT} …"
  if [ "${ROLE}" = "release" ]; then
    git -C "${REPO_ROOT}" worktree add "${WT}" main
  else
    git -C "${REPO_ROOT}" worktree add "${WT}" -b "${BRANCH}"
  fi
fi

# --- 2. npm install if needed ---
if [ "${NO_INSTALL}" -eq 0 ] && [ ! -d "${WT}/node_modules" ]; then
  say "installing dependencies in ${WT} …"
  npm --prefix "${WT}" install
else
  say "node_modules present (or --no-install) — skipping install"
fi

# --- 3. generate path-correct claude-w profile ---
PROFILE_NAME="falamadeira-${ROLE}-dev"
PROFILE_PATH="${PROFILES_DIR}/${PROFILE_NAME}.json"
# build suggested_write_scopes JSON array from SCOPES
scopes_json=""
for s in ${SCOPES}; do
  p="${WT}/${s}"; [ "${s}" = "." ] && p="${WT}"
  scopes_json="${scopes_json}    \"${p}\",
"
done
scopes_json="${scopes_json%,
}"  # trim trailing comma+newline
PROFILE_JSON="$(cat <<JSON
{
  "name": "${PROFILE_NAME}",
  "platform": "claude",
  "version": 1,
  "startup_repo": "${WT}",
  "read_scopes": [
    "${WT}",
    "${DOTFILES}"
  ],
  "write_scopes": [],
  "suggested_write_scopes": [
${scopes_json}
  ],
  "permission_mode": "default",
  "autonomous": true,
  "setting_sources": "user,project,local",
  "model": "opus",
  "allow_rules": [],
  "deny_rules": [
    "Edit(${WT}/README.md)",
    "Write(${WT}/README.md)",
    "Edit(${WT}/AGENTS.md)",
    "Write(${WT}/AGENTS.md)"
  ],
  "interactive_defaults": {
    "prompt_for_autonomous_mode": true
  }
}
JSON
)"

if [ -d "${PROFILES_DIR}" ] && { [ ! -e "${PROFILE_PATH}" ] || [ -w "${PROFILE_PATH}" ]; } && touch "${PROFILE_PATH}" 2>/dev/null; then
  printf '%s\n' "${PROFILE_JSON}" > "${PROFILE_PATH}"
  say "wrote profile: ${PROFILE_PATH}"
else
  say "could not write ${PROFILE_PATH} — place this JSON there manually:"
  PRINT_PROFILE=1
fi
[ "${PRINT_PROFILE}" -eq 1 ] && { echo "----- ${PROFILE_PATH} -----"; printf '%s\n' "${PROFILE_JSON}"; echo "-----"; }

# --- 4. operator-only secret provisioning (NOT run here — agent cp of .env* is hard-denied) ---
echo
echo "════════════════════════════════════════════════════════════════════"
echo " OPERATOR STEP — provision secrets for ${WT}"
echo " (run these yourself; the agent harness blocks agent cp of .env* files)"
echo "════════════════════════════════════════════════════════════════════"
[ "${NEED_LOCAL}" -eq 1 ]  && echo "cp \"${REPO_ROOT}/.env.local\"  \"${WT}/.env.local\""
[ "${NEED_DEPLOY}" -eq 1 ] && echo "cp \"${REPO_ROOT}/.env.deploy\" \"${WT}/.env.deploy\"   # release ONLY"
[ "${NEED_DEPLOY}" -eq 0 ] && echo "# (no .env.deploy for role '${ROLE}' — least-privilege; only release deploys)"
echo
echo "Then launch this role's agent:"
echo "  claude-w --profile ${PROFILE_NAME}"
echo
say "done — role='${ROLE}' worktree='${WT}' branch='$(git -C "${WT}" rev-parse --abbrev-ref HEAD)'"
