#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/setup-worktree.sh
# Description: INFRA-5 — one-command provisioner for the Model B agent worktree fleet
#   (AGENTS.md §4, docs/MULTI-AGENT-WORKFLOW.md §8/§9). Given a ROLE it: creates the
#   worktree on its allowed branch if missing, installs node_modules, generates a
#   PATH-CORRECT claude-w launcher profile for that worktree (solving the path-bound
#   profile problem — profiles are generated per path, never hand-maintained),
#   auto-provisions the non-secret admin TEST credentials file into the worktree,
#   and prints the operator-only secret-copy commands. Real deployment secrets
#   (.env.local/.env.deploy) are NOT run here: the agent harness hard-denies `cp`
#   (global `Bash(cp:*)` deny) and spreading deployment secrets is the operator's
#   call. NOTE: this script runs in the OPERATOR shell (not the agent harness), so
#   that `cp` deny does not apply to it — that is why it can safely copy
#   .admin-temp-credentials.txt (the admin TEST login the e2e/admin suites need in
#   every worktree) itself, while still leaving the real .env* secrets to the
#   operator. Idempotent — safe to re-run.
# Author: Lane A (with assistant)
# Created: 2026-07-14
#
# Usage:
#   bash scripts/setup-worktree.sh <role> [branch] [--no-install] [--print-profile]
#   bash scripts/setup-worktree.sh --issue <ID> [feat|fix|content] [--no-install] [--print-profile]
#   bash scripts/setup-worktree.sh --wt <suffix>  [--no-install] [--print-profile]
#     role   : feat | support | content | release
#     --issue <ID> [kind] : START NEW WORK — create fala_madeira-<id> FROM develop on
#                 <kind>/<id> (kind feat|fix|content, default feat), then provision.
#                 The standard start-work entry point (AGENTS.md §7).
#     branch : optional topic branch to create/switch (feat/support/content only;
#              default <prefix>/scratch). Ignored for release (always `main`).
#     --wt <suffix>   : provision an ARBITRARY, already-existing worktree
#                       fala_madeira-<suffix> (e.g. --wt en23 for the per-issue trees).
#                       Same install + profile + creds provisioning as a role; the
#                       worktree must already exist (no branch is guessed). Generates
#                       a falamadeira-<suffix>-dev profile.
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
usage() {
  cat <<'USAGE'
setup-worktree.sh — provision a FalaMadeira agent worktree
(worktree + node deps + claude-w profile + admin TEST creds)

Usage:
  bash scripts/setup-worktree.sh <role> [branch]                 [--no-install] [--print-profile]
  bash scripts/setup-worktree.sh --issue <ID> [feat|fix|content] [--no-install] [--print-profile]
  bash scripts/setup-worktree.sh --wt <suffix>                   [--no-install] [--print-profile]

Modes:
  role mode    role = feat | support | content | release
               Creates fala_madeira-<role> on its default/topic branch if missing.
               [branch] overrides the default topic branch (feat/support/content only;
               release is always `main`).
  --issue mode --issue <ID> [feat|fix|content]  (kind also settable via --kind)
               START NEW WORK: CREATES fala_madeira-<id> FROM develop on branch
               <kind>/<id> (default kind feat), then installs + profiles + provisions
               creds. <ID> is normalized to lowercase alphanumerics (EN-30 → en30).
               This is the standard "start new work" entry point (AGENTS.md §7).
  --wt mode    Provision an ALREADY-EXISTING, ad-hoc worktree fala_madeira-<suffix>
               (e.g. the per-issue en18/en23/en27 trees).  <suffix> is whatever
               follows `fala_madeira-` in the dir name.  The worktree must already
               exist — no branch is guessed; if missing you get the `git worktree add`
               line to run first.

Flags:
  --no-install     skip `npm install`
  --print-profile  also print the generated claude-w profile JSON to stdout
  -h, --help       show this help and exit

Both modes auto-copy .admin-temp-credentials.txt into the worktree and generate a
`falamadeira-<role|suffix>-dev` profile. Real .env* secrets stay operator-only
(the exact cp lines are printed at the end). Idempotent — safe to re-run.

Then launch the agent:  claude-w --profile falamadeira-<role|suffix>-dev

Examples:
  bash scripts/setup-worktree.sh --issue EN-30 fix   # new work: create fala_madeira-en30 off develop on fix/en30
  bash scripts/setup-worktree.sh --issue EN-31       # defaults to feat/en31
  bash scripts/setup-worktree.sh feat
  bash scripts/setup-worktree.sh --wt en23           # provision an existing ad-hoc worktree
USAGE
}

# no-args → show help rather than a terse error
[ $# -eq 0 ] && { usage; exit 1; }

# --- args (array-free: macOS bash 3.2 breaks on empty-array refs under set -u) ---
ROLE=""; WT_SUFFIX=""; ISSUE_ID=""; ISSUE_KIND=""; BRANCH_ARG=""; NO_INSTALL=0; PRINT_PROFILE=0; POS_COUNT=0
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)       usage; exit 0 ;;
    --issue)         ISSUE_ID="${2:-}"; [ -n "${ISSUE_ID}" ] || die "--issue requires an id (e.g. --issue EN-30 fix)"; shift 2 ;;
    --kind)          ISSUE_KIND="${2:-}"; [ -n "${ISSUE_KIND}" ] || die "--kind requires feat|fix|content"; shift 2 ;;
    --wt)            WT_SUFFIX="${2:-}"; [ -n "${WT_SUFFIX}" ] || die "--wt requires a worktree suffix (e.g. --wt en23)"; shift 2 ;;
    --no-install)    NO_INSTALL=1; shift ;;
    --print-profile) PRINT_PROFILE=1; shift ;;
    --*)             die "unknown flag: $1  (run --help for usage)" ;;
    *)
      if   [ "${POS_COUNT}" -eq 0 ]; then ROLE="$1"
      elif [ "${POS_COUNT}" -eq 1 ]; then BRANCH_ARG="$1"
      else die "unexpected argument: $1"; fi
      POS_COUNT=$((POS_COUNT + 1)); shift ;;
  esac
done

# --- resolve role/worktree ---
# Two modes:
#   role mode : <role> [branch]   — feat|support|content|release from the role table below;
#               creates the worktree on its default/topic branch if missing.
#   --wt mode : --wt <suffix>     — provision an ARBITRARY, already-existing worktree
#               (fala_madeira-<suffix>, e.g. the per-issue en18/en23/en27 trees).
#               It must already exist (we don't guess a branch convention for ad-hoc
#               worktrees); everything else (install, profile, creds) is identical.
if [ -n "${ISSUE_ID}" ]; then
  # --issue mode: create a per-issue worktree fala_madeira-<sfx> FROM develop on <kind>/<sfx>.
  [ -z "${WT_SUFFIX}" ] || die "use --issue OR --wt, not both"
  kind="${ISSUE_KIND:-${ROLE:-feat}}"   # --kind flag, else positional, else default feat
  case "${kind}" in feat|fix|content) ;; *) die "issue kind must be feat|fix|content (got '${kind}')" ;; esac
  sfx="$(printf '%s' "${ISSUE_ID}" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')"   # EN-30 → en30
  [ -n "${sfx}" ] || die "--issue id '${ISSUE_ID}' has no usable alphanumeric characters"
  ROLE="${sfx}"; SUFFIX="${sfx}"                       # profile name = falamadeira-<sfx>-dev
  NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src public supabase/functions"
  WT="${PARENT}/fala_madeira-${SUFFIX}"
  BRANCH="${kind}/${sfx}"
  CREATE_FROM="develop"                                # per-issue worktrees branch off develop (AGENTS.md §7)
elif [ -n "${WT_SUFFIX}" ]; then
  [ -z "${ROLE}" ] || die "--wt <suffix> mode does not take a role positional (got '${ROLE}')"
  ROLE="${WT_SUFFIX}"; SUFFIX="${WT_SUFFIX}"          # profile name = falamadeira-<suffix>-dev
  NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src public supabase/functions"
  WT="${PARENT}/fala_madeira-${SUFFIX}"; BRANCH=""
  git -C "${REPO_ROOT}" worktree list --porcelain | grep -qx "worktree ${WT}" \
    || die "worktree not found: ${WT} — create it first (e.g. git -C ${REPO_ROOT} worktree add ${WT} <branch>), then re-run"
else
  [ -n "${ROLE}" ] || die "role required: feat | support | content | release  (or use --wt <suffix>)"
  # role table: suffix | default branch | env_local | env_deploy | write scopes (space-sep, repo-relative)
  case "${ROLE}" in
    feat)    SUFFIX=feat;    DEF_BRANCH="feat/scratch";    NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src public supabase/functions" ;;
    support) SUFFIX=support; DEF_BRANCH="fix/scratch";     NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src public supabase/functions" ;;
    content) SUFFIX=content; DEF_BRANCH="content/scratch"; NEED_LOCAL=1; NEED_DEPLOY=0; SCOPES="src/content public" ;;
    release) SUFFIX=release; DEF_BRANCH="main";            NEED_LOCAL=1; NEED_DEPLOY=1; SCOPES="." ;;
    *) die "unknown role '${ROLE}' (feat | support | content | release  — or --wt <suffix>)" ;;
  esac
  WT="${PARENT}/fala_madeira-${SUFFIX}"
  BRANCH="${BRANCH_ARG:-${DEF_BRANCH}}"
fi

# --- 1. create worktree if missing ---
if git -C "${REPO_ROOT}" worktree list --porcelain | grep -qx "worktree ${WT}"; then
  say "worktree exists: ${WT}"
else
  say "creating worktree ${WT} …"
  if [ "${ROLE}" = "release" ]; then
    git -C "${REPO_ROOT}" worktree add "${WT}" main
  elif [ -n "${CREATE_FROM:-}" ]; then
    git -C "${REPO_ROOT}" worktree add "${WT}" -b "${BRANCH}" "${CREATE_FROM}"
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

# --- 3. provision non-secret admin TEST credentials (auto) ---
# .admin-temp-credentials.txt holds the admin TEST login used by the e2e/admin
# suites and is needed in every worktree. Unlike .env.local/.env.deploy (real
# deployment secrets, operator-only in step 5), this file is copied automatically:
# this provisioner runs in the OPERATOR shell, so the global agent-harness
# `Bash(cp:*)` deny does not apply here. Idempotent — overwrites to keep worktrees
# in sync with the base repo's copy.
CREDS_SRC="${REPO_ROOT}/.admin-temp-credentials.txt"
if [ "${WT}" = "${REPO_ROOT}" ]; then
  say "base repo is the credentials source — nothing to copy"
elif [ -f "${CREDS_SRC}" ]; then
  cp "${CREDS_SRC}" "${WT}/.admin-temp-credentials.txt"
  say "provisioned admin TEST credentials → ${WT}/.admin-temp-credentials.txt"
else
  say "WARN: ${CREDS_SRC} not found — skipped admin TEST credentials (create it in the base repo, then re-run)"
fi

# --- 4. generate path-correct claude-w profile ---
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
  "allow_rules": [
    "Bash(bash scripts/setup-worktree.sh:*)"
  ],
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

# --- 5. operator-only secret provisioning (NOT run here — agent cp of .env* is hard-denied) ---
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
