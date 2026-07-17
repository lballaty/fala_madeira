#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/deploy-verpex.sh
# Description: Plan step P7 (web-deploy-pipeline). Uploads the production `dist/` — and ONLY dist/ —
#   to the Verpex shared host. TWO-TARGET, STAGED release (INFRA-4):
#     • --target staging     → the testfalamadeira.searchingfool.com dir (VERPEX_STAGING_REMOTE_PATH)
#     • --target production  → the falamadeira.searchingfool.com dir     (VERPEX_REMOTE_PATH)
#   The pre-release step is ENFORCED IN THIS SCRIPT (not just docs, which are skippable): a
#   production deploy REFUSES unless the CURRENT git commit was staged AND approved via a separate
#   `--approve` step. Approval is tied to `git rev-parse HEAD`, so any new commit invalidates a
#   stale approval — the staging→approve→production sequence is mandatory no matter which agent
#   runs it. Local staging/approval state lives in .deploy-state.json (git-ignored).
#
#   Same server + credentials for both targets; only the remote directory differs. Guards refuse a
#   staging path that isn't a *testfalamadeira* dir and a production path that is (or that isn't a
#   falamadeira dir) — neither target can ever write into the other's directory.
#
#   Credentials + scoped remote paths are read from .env.deploy (git-ignored). Template:
#   .env.deploy.example. No hardcoded credential, no silent fallback — a missing value is a LOUD
#   failure per the observability / no-fallback standard.
#
#   Modes / flags:
#     --target staging|production   which document root to deploy to (REQUIRED for a real deploy)
#     --approve                     record approval of the currently-staged commit for production
#                                   (no build, no upload — an admin action); then exit
#     --dry-run                     credential-free: build + validate + print the plan, NO network
#     --no-build                    reuse existing dist/ (skip npm run build)
#     -h|--help                     usage
#
#   OPERATOR / RELEASE-WORKTREE FLOW (see docs/MULTI-AGENT-WORKFLOW.md §7):
#     npm run deploy:staging      # → testfalamadeira ; verify it
#     npm run deploy:approve      # → records approver + the staged commit
#     npm run deploy:production   # → falamadeira ; refused unless this commit was staged+approved
#   Prereqs in .env.deploy: VERPEX_HOST/USER, VERPEX_SSH_KEY (or VERPEX_PASS), VERPEX_REMOTE_PATH,
#   VERPEX_STAGING_REMOTE_PATH. Supabase Auth Site/Redirect URLs must include BOTH origins.
# Author: Libor Ballaty (with assistant)
# Created: 2026-07-10

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

DIST_DIR="${REPO_ROOT}/dist"
ENV_FILE="${REPO_ROOT}/.env.deploy"
ENV_EXAMPLE="${REPO_ROOT}/.env.deploy.example"
STATE_FILE="${REPO_ROOT}/.deploy-state.json"  # git-ignored: local staging/approval state

DRY_RUN=0
DO_BUILD=1
TARGET=""
APPROVE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-build) DO_BUILD=0 ;;
    --approve) APPROVE=1 ;;
    --target) shift; TARGET="${1:-}" ;;
    --target=*) TARGET="${1#--target=}" ;;
    -h|--help)
      echo "Usage: bash scripts/deploy-verpex.sh --target staging|production [--dry-run] [--no-build]"
      echo "       bash scripts/deploy-verpex.sh --approve   (record approval of the staged commit)"
      echo ""
      echo "  --target staging|production  document root (staging=testfalamadeira, production=falamadeira)"
      echo "  --approve                    approve the currently-staged commit for production (no upload)"
      echo "  --dry-run                    validate + print the plan, no network, no creds"
      echo "  --no-build                   reuse existing dist/"
      echo ""
      echo "Real deploy needs .env.deploy. Production is refused unless this commit was staged + approved."
      exit 0 ;;
    *) echo "deploy-verpex: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; N=$'\033[0m'; else G=""; R=""; Y=""; B=""; N=""; fi
say()  { printf '%s[deploy-verpex]%s %s\n' "$B" "$N" "$*"; }
ok()   { printf '%s[ OK ]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '%s[FATAL]%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

# Release identity = the git commit being shipped (robust vs. non-reproducible builds).
head_commit() { git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo ""; }
# Minimal JSON string read: value of "key" in .deploy-state.json (no jq dependency).
state_get() { [ -f "${STATE_FILE}" ] && grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "${STATE_FILE}" | head -1 | sed 's/.*"\([^"]*\)"[[:space:]]*$/\1/'; }

# --- 0. --approve: record approval of the currently-staged commit, then exit (no build/upload) ---
if [ "${APPROVE}" -eq 1 ]; then
  [ -f "${STATE_FILE}" ] || die "nothing staged — run a staging deploy first (npm run deploy:staging)."
  staged_commit="$(state_get stagedCommit)"
  [ -n "${staged_commit}" ] || die "no staged commit on record — run a staging deploy first."
  head="$(head_commit)"
  if [ -n "${head}" ] && [ "${head}" != "${staged_commit}" ]; then
    die "HEAD (${head:0:12}) != staged commit (${staged_commit:0:12}). Re-stage this commit before approving."
  fi
  approver="$(git config user.name 2>/dev/null || echo "${USER:-unknown}")"
  at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{\n  "stagedCommit": "%s",\n  "approvedCommit": "%s",\n  "approvedBy": "%s",\n  "approvedAt": "%s"\n}\n' \
    "${staged_commit}" "${staged_commit}" "${approver}" "${at}" > "${STATE_FILE}"
  ok "approved commit ${staged_commit:0:12} for production (by ${approver} at ${at}). Now: npm run deploy:production"
  exit 0
fi

# --- 1. Build (unless --no-build) --------------------------------------------------------------
if [ "${DO_BUILD}" -eq 1 ]; then
  say "building production artifact (npm run build)…"
  npm run build || die "build failed — cannot deploy a broken artifact"
else
  say "--no-build: reusing existing dist/"
fi

# --- 2. Validate the artifact (both modes) -----------------------------------------------------
say "validating dist/ …"
[ -d "${DIST_DIR}" ] || die "dist/ does not exist — run the build first"

REQUIRED=("index.html" "manifest.webmanifest" "sw.js" ".htaccess")
missing=0
for f in "${REQUIRED[@]}"; do
  if [ -f "${DIST_DIR}/${f}" ]; then
    ok "dist/${f} present"
  else
    printf '%s[MISSING]%s dist/%s\n' "$R" "$N" "${f}" >&2
    missing=1
  fi
done
if [ "${missing}" -ne 0 ]; then
  die "dist/ is missing required file(s) above. The .htaccess must be authored at public/.htaccess so the build copies it into dist/."
fi
ok "artifact validation passed"

# --- 3. Resolve the scoped remote path per --target (loud on unset/mis-scoped) -----------------
# Dry-run stays credential-free: if .env.deploy is absent, show placeholders and DO NOT fail.
resolve_target() {
  case "${TARGET}" in
    staging)
      REMOTE_PATH="${VERPEX_STAGING_REMOTE_PATH:-}"
      [ -n "${REMOTE_PATH}" ] || die "VERPEX_STAGING_REMOTE_PATH unset in .env.deploy (the testfalamadeira.searchingfool.com dir)."
      case "${REMOTE_PATH}" in
        *testfalamadeira*) : ;;
        *) die "staging target must contain 'testfalamadeira' — got '${REMOTE_PATH}'. Refusing." ;;
      esac ;;
    production)
      REMOTE_PATH="${VERPEX_REMOTE_PATH:-}"
      [ -n "${REMOTE_PATH}" ] || die "VERPEX_REMOTE_PATH unset in .env.deploy (the falamadeira.searchingfool.com dir)."
      case "${REMOTE_PATH}" in
        *testfalamadeira*) die "production target MUST NOT be the testfalamadeira dir — got '${REMOTE_PATH}'. Refusing." ;;
        *falamadeira*) : ;;
        *) die "production target must contain 'falamadeira' — got '${REMOTE_PATH}'. Refusing." ;;
      esac ;;
    "") die "missing --target staging|production (bare deploy is not allowed — choose a target explicitly)." ;;
    *) die "unknown --target '${TARGET}' (expected staging|production)." ;;
  esac
  case "${REMOTE_PATH}" in /) die "REMOTE_PATH='/' — refusing to deploy to the filesystem root." ;; esac
}

# --- 3a. DRY RUN: print the plan, NO network, NO creds required --------------------------------
if [ "${DRY_RUN}" -eq 1 ]; then
  host_display="<VERPEX_HOST — set in .env.deploy>"
  user_display="<VERPEX_USER — set in .env.deploy>"
  target_display="<remote path — set in .env.deploy>"
  if [ -f "${ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    set -a; . "${ENV_FILE}"; set +a
    [ -n "${VERPEX_HOST:-}" ] && host_display="${VERPEX_HOST}"
    [ -n "${VERPEX_USER:-}" ] && user_display="${VERPEX_USER}"
    if [ "${TARGET}" = "staging" ]; then target_display="${VERPEX_STAGING_REMOTE_PATH:-<VERPEX_STAGING_REMOTE_PATH unset>}"
    elif [ "${TARGET}" = "production" ]; then target_display="${VERPEX_REMOTE_PATH:-<VERPEX_REMOTE_PATH unset>}"; fi
  fi
  file_count="$(find "${DIST_DIR}" -type f | wc -l | tr -d ' ')"
  byte_size="$(du -sh "${DIST_DIR}" 2>/dev/null | awk '{print $1}')"
  echo ""
  printf '%s================= DRY RUN =================%s\n' "$B" "$N"
  echo "DRY RUN — no network connection is made. Nothing is uploaded."
  echo "Target: ${TARGET:-<none — pass --target staging|production>}"
  echo "WOULD upload dist/ (${file_count} files, ${byte_size:-?}) TO:"
  echo "    ${user_display}@${host_display}:${target_display}"
  echo "Production gate: refused unless this commit ($(head_commit | cut -c1-12)) was staged + approved."
  printf '%s============== END DRY RUN ================%s\n' "$B" "$N"
  echo ""
  ok "dry-run complete (no upload, no network)."
  exit 0
fi

# --- 3a. BRANCH GUARD: a REAL deploy may only run from the `main` release branch ----------------
# The version bump + release-notes cut happen on `main` (ship.sh STAGE 0, gated on BRANCH=main).
# Deploying from `develop` (or any topic branch) uploads an UNBUMPED, off-process artifact to the
# live host — the exact failure this guard prevents. Enforced HERE at the upload chokepoint so no
# entry point (ship.sh OR a direct deploy-verpex.sh call) can bypass it. Dry-run already exited
# above, so it remains allowed from any branch. Override intentionally with ALLOW_NONMAIN_DEPLOY=1
# only for a documented exception (e.g. a hotfix worktree), never as a routine convenience.
CURRENT_BRANCH="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
if [ "${CURRENT_BRANCH}" != "main" ] && [ "${ALLOW_NONMAIN_DEPLOY:-0}" -ne 1 ]; then
  die "REAL deploy refused: must run from the 'main' release branch — this worktree is on '${CURRENT_BRANCH}'.
       Cut the release first (in the -release worktree): git merge develop, then 'npm run deploy:staging'.
       To validate from any branch without uploading, add --dry-run."
fi

# --- 3b. REAL DEPLOY: creds required, scoped target enforced -----------------------------------
if [ ! -f "${ENV_FILE}" ]; then
  die "real deploy requires ${ENV_FILE} (git-ignored). Copy it from ${ENV_EXAMPLE} and fill it in.
       Validate without creds via:  bash scripts/deploy-verpex.sh --target staging --dry-run"
fi

# shellcheck disable=SC1090
set -a; . "${ENV_FILE}"; set +a

: "${VERPEX_HOST:?VERPEX_HOST unset in .env.deploy}"
: "${VERPEX_USER:?VERPEX_USER unset in .env.deploy}"
VERPEX_PORT="${VERPEX_PORT:-22}"

resolve_target
ok "target '${TARGET}' → ${REMOTE_PATH}"

# --- 3c. PRODUCTION GATE: refuse unless THIS commit was staged + approved ----------------------
if [ "${TARGET}" = "production" ]; then
  head="$(head_commit)"
  approved_commit="$(state_get approvedCommit)"
  [ -f "${STATE_FILE}" ] || die "production REFUSED: no staging/approval on record. Run: npm run deploy:staging → deploy:approve → deploy:production."
  [ -n "${approved_commit}" ] || die "production REFUSED: staged commit not approved. Run: npm run deploy:approve."
  if [ -n "${head}" ] && [ "${approved_commit}" != "${head}" ]; then
    die "production REFUSED: HEAD (${head:0:12}) != approved commit (${approved_commit:0:12}).
         Deploy the approved artifact, or re-stage + re-approve this commit."
  fi
  ok "production gate passed: commit ${head:0:12} was staged + approved."
fi

# Auth: prefer key, else password via sshpass (only if installed — no interactive prompt in CI).
SSH_OPTS=(-p "${VERPEX_PORT}" -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -p ${VERPEX_PORT} -o StrictHostKeyChecking=accept-new"
USE_SSHPASS=0
if [ -n "${VERPEX_SSH_KEY:-}" ]; then
  [ -f "${VERPEX_SSH_KEY}" ] || die "VERPEX_SSH_KEY='${VERPEX_SSH_KEY}' is not a readable file"
  SSH_OPTS+=(-i "${VERPEX_SSH_KEY}")
  RSYNC_SSH="ssh -p ${VERPEX_PORT} -o StrictHostKeyChecking=accept-new -i ${VERPEX_SSH_KEY}"
  ok "using SSH key auth (${VERPEX_SSH_KEY})"
elif [ -n "${VERPEX_PASS:-}" ]; then
  if command -v sshpass >/dev/null 2>&1; then
    USE_SSHPASS=1
    ok "using password auth via sshpass"
  else
    die "VERPEX_PASS is set but 'sshpass' is not installed — password auth cannot be non-interactive.
         Install sshpass OR use VERPEX_SSH_KEY instead."
  fi
else
  die "no auth configured — set VERPEX_SSH_KEY (preferred) or VERPEX_PASS in .env.deploy"
fi

REMOTE="${VERPEX_USER}@${VERPEX_HOST}:${REMOTE_PATH}/"
say "deploying dist/ -> ${REMOTE}  (target: ${TARGET})"

# Trailing slash on the source => copy the CONTENTS of dist/ into the remote dir (dist/ ONLY).
if command -v rsync >/dev/null 2>&1; then
  say "transport: rsync over ssh"
  # Preserve cPanel/Verpex server-managed dirs: .well-known (AutoSSL/ACME) and cgi-bin.
  RSYNC_CMD=(rsync -avz --delete --exclude '.well-known/' --exclude 'cgi-bin/' -e "${RSYNC_SSH}" "${DIST_DIR}/" "${REMOTE}")
  if [ "${USE_SSHPASS}" -eq 1 ]; then
    sshpass -p "${VERPEX_PASS}" "${RSYNC_CMD[@]}" || die "rsync upload failed"
  else
    "${RSYNC_CMD[@]}" || die "rsync upload failed"
  fi
else
  say "transport: sftp batch (rsync unavailable)"
  BATCH="$(mktemp)"
  trap 'rm -f "${BATCH}"' EXIT
  {
    echo "cd ${REMOTE_PATH}"
    echo "put -r ${DIST_DIR}/*"
  } > "${BATCH}"
  if [ "${USE_SSHPASS}" -eq 1 ]; then
    sshpass -p "${VERPEX_PASS}" sftp "${SSH_OPTS[@]}" -b "${BATCH}" "${VERPEX_USER}@${VERPEX_HOST}" || die "sftp upload failed"
  else
    sftp "${SSH_OPTS[@]}" -b "${BATCH}" "${VERPEX_USER}@${VERPEX_HOST}" || die "sftp upload failed"
  fi
fi

ok "deploy complete — dist/ uploaded to ${REMOTE}"

# --- 4. Record staging state (so it can be approved) / advise next step ------------------------
if [ "${TARGET}" = "staging" ]; then
  staged="$(head_commit)"
  printf '{\n  "stagedCommit": "%s",\n  "stagedAt": "%s"\n}\n' "${staged}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${STATE_FILE}"
  ok "recorded staged commit ${staged:0:12}. Verify https://testfalamadeira.searchingfool.com, then: npm run deploy:approve"
  say "Reminder: Supabase Auth Site/Redirect URLs must include https://testfalamadeira.searchingfool.com."
else
  say "Next: verify https://falamadeira.searchingfool.com/manifest.webmanifest returns 200."
  say "Reminder: Supabase Auth Site/Redirect URLs must include https://falamadeira.searchingfool.com."
fi
