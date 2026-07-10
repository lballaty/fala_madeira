#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/deploy-verpex.sh
# Description: Plan step P7 (web-deploy-pipeline / verpex-deploy). Uploads the production `dist/`
#   — and ONLY dist/ — to the Verpex shared host, into the single `falamadeira.searchingfool.com`
#   document-root directory (AGENTS.md §5: that dir ONLY; deploy from THIS device, never GitHub).
#   The build carries public/.htaccess into dist/.htaccess (SPA fallback + PWA MIME + Cache-Control),
#   so the SPA rules ship with the artifact.
#
#   Credentials + the scoped remote path are read from .env.deploy (git-ignored). Template:
#   .env.deploy.example. There is NO hardcoded credential and NO silent localhost fallback — per the
#   global observability / no-fallback standard, a missing .env.deploy or an unset remote path is a
#   LOUD failure, not a masked default.
#
#   Modes:
#     --dry-run   Credential-FREE. Builds dist/, validates it (index.html/manifest/sw.js/.htaccess),
#                 prints EXACTLY what WOULD be uploaded and WHERE, prints the literal "DRY RUN",
#                 and makes NO network connection. This is the pipeline gate.
#     (default)   Real upload. REQUIRES .env.deploy. Uploads dist/ -> VERPEX_REMOTE_PATH via
#                 rsync-over-ssh (preferred) or sftp fallback. Refuses if the remote path is unset
#                 or does not look like the scoped falamadeira directory.
#     --no-build  Skip `npm run build` (reuse existing dist/). Composable with --dry-run.
#     -h|--help   Usage.
#
#   OPERATOR STEPS to go live (NOT executed by this script):
#     1. cp .env.deploy.example .env.deploy  and fill in VERPEX_HOST / VERPEX_USER /
#        VERPEX_SSH_KEY (or VERPEX_PASS) / VERPEX_REMOTE_PATH (the scoped falamadeira dir).
#     2. Confirm the dry run: `npm run deploy -- --dry-run`  (no creds needed).
#     3. Real deploy: `npm run deploy`.
#     4. Supabase dashboard (project gxlrmdfqcqimwwplrdgd) -> Authentication -> URL Configuration:
#          Site URL      = https://falamadeira.searchingfool.com
#          Redirect URLs += https://falamadeira.searchingfool.com/**
#        (auth redirects fail until the domain is allow-listed).
# Author: Libor Ballaty (with assistant)
# Created: 2026-07-10

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

DIST_DIR="${REPO_ROOT}/dist"
ENV_FILE="${REPO_ROOT}/.env.deploy"
ENV_EXAMPLE="${REPO_ROOT}/.env.deploy.example"

DRY_RUN=0
DO_BUILD=1
for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=1 ;;
    --no-build) DO_BUILD=0 ;;
    -h|--help)
      echo "Usage: bash scripts/deploy-verpex.sh [--dry-run] [--no-build]"
      echo "  --dry-run   validate + print the upload plan, make NO network connection (no creds needed)"
      echo "  --no-build  reuse existing dist/ (skip npm run build)"
      echo ""
      echo "Real deploy needs .env.deploy (copy from .env.deploy.example). See the header of this file."
      exit 0 ;;
    *) echo "deploy-verpex: unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; N=$'\033[0m'; else G=""; R=""; Y=""; B=""; N=""; fi
say()  { printf '%s[deploy-verpex]%s %s\n' "$B" "$N" "$*"; }
ok()   { printf '%s[ OK ]%s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '%s[FATAL]%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

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
  # .htaccess is the one that can be missing if public/.htaccess wasn't authored — say so clearly.
  die "dist/ is missing required file(s) above. The .htaccess must be authored at public/.htaccess so the build copies it into dist/."
fi
ok "artifact validation passed"

# --- 3a. DRY RUN: print the plan, NO network, NO creds required --------------------------------
if [ "${DRY_RUN}" -eq 1 ]; then
  # Resolve the intended target for display only. If .env.deploy is absent we show a placeholder
  # and DO NOT fail — the dry run must work credential-free.
  target_display="<VERPEX_REMOTE_PATH — set in .env.deploy>"
  host_display="<VERPEX_HOST — set in .env.deploy>"
  user_display="<VERPEX_USER — set in .env.deploy>"
  if [ -f "${ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    set -a; . "${ENV_FILE}"; set +a
    [ -n "${VERPEX_REMOTE_PATH:-}" ] && target_display="${VERPEX_REMOTE_PATH}"
    [ -n "${VERPEX_HOST:-}" ]        && host_display="${VERPEX_HOST}"
    [ -n "${VERPEX_USER:-}" ]        && user_display="${VERPEX_USER}"
  fi

  file_count="$(find "${DIST_DIR}" -type f | wc -l | tr -d ' ')"
  byte_size="$(du -sh "${DIST_DIR}" 2>/dev/null | awk '{print $1}')"

  echo ""
  printf '%s================= DRY RUN =================%s\n' "$B" "$N"
  echo "DRY RUN — this is a dry-run. No network connection is made. Nothing is uploaded."
  echo ""
  echo "WOULD upload the contents of:"
  echo "    ${DIST_DIR}/   (dist/ ONLY — ${file_count} files, ${byte_size:-?})"
  echo "TO the scoped Verpex document root:"
  echo "    ${user_display}@${host_display}:${target_display}"
  echo "    (the falamadeira.searchingfool.com directory ONLY — nothing above it)"
  echo ""
  echo "Top-level entries that WOULD be uploaded:"
  ( cd "${DIST_DIR}" && find . -maxdepth 1 -mindepth 1 | sed 's#^\./#    dist/#' | sort )
  echo ""
  echo "Deploy-critical files confirmed present in the artifact:"
  echo "    dist/index.html  dist/manifest.webmanifest  dist/sw.js  dist/.htaccess (SPA + PWA MIME + Cache-Control)"
  echo ""
  echo "Transport that WOULD be used: rsync-over-ssh if available, else sftp batch."
  echo "No credentials were read or required for this dry-run."
  printf '%s============== END DRY RUN ================%s\n' "$B" "$N"
  echo ""
  ok "dry-run complete — pipeline gate satisfied (DRY RUN, no upload, no network)."
  exit 0
fi

# --- 3b. REAL DEPLOY: creds required, scoped target enforced -----------------------------------
if [ ! -f "${ENV_FILE}" ]; then
  die "real deploy requires ${ENV_FILE} (git-ignored). Copy it from ${ENV_EXAMPLE} and fill it in.
       No hardcoded credentials and no localhost fallback exist by design.
       To validate the pipeline without creds, run:  npm run deploy -- --dry-run"
fi

# shellcheck disable=SC1090
set -a; . "${ENV_FILE}"; set +a

: "${VERPEX_HOST:?VERPEX_HOST unset in .env.deploy}"
: "${VERPEX_USER:?VERPEX_USER unset in .env.deploy}"
VERPEX_PORT="${VERPEX_PORT:-22}"

# HARD GUARD: the scoped remote path. Refuse if unset, or if it doesn't look like the falamadeira
# subdomain directory — this is the single most important safety rail (never write elsewhere).
if [ -z "${VERPEX_REMOTE_PATH:-}" ]; then
  die "VERPEX_REMOTE_PATH is unset — refusing to deploy without an explicit scoped target.
       Set it to the falamadeira.searchingfool.com document-root directory in .env.deploy."
fi
case "${VERPEX_REMOTE_PATH}" in
  *falamadeira*) ok "remote path scoped to a falamadeira directory: ${VERPEX_REMOTE_PATH}" ;;
  *)
    die "VERPEX_REMOTE_PATH='${VERPEX_REMOTE_PATH}' does not contain 'falamadeira' — refusing.
         The deploy target MUST be the falamadeira.searchingfool.com directory ONLY (AGENTS.md §5).
         If your host uses a different path, set it explicitly and re-run; this guard is intentional." ;;
esac
case "${VERPEX_REMOTE_PATH}" in
  /) die "VERPEX_REMOTE_PATH='/' — refusing to deploy to the filesystem root." ;;
esac

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
         Install sshpass (brew install hudochenkov/sshpass/sshpass) OR use VERPEX_SSH_KEY instead."
  fi
else
  die "no auth configured — set VERPEX_SSH_KEY (preferred) or VERPEX_PASS in .env.deploy"
fi

REMOTE="${VERPEX_USER}@${VERPEX_HOST}:${VERPEX_REMOTE_PATH}/"
say "deploying dist/ -> ${REMOTE}"

# Trailing slash on the source => copy the CONTENTS of dist/ into the remote dir (dist/ ONLY).
if command -v rsync >/dev/null 2>&1; then
  say "transport: rsync over ssh"
  RSYNC_CMD=(rsync -avz --delete -e "${RSYNC_SSH}" "${DIST_DIR}/" "${REMOTE}")
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
    echo "cd ${VERPEX_REMOTE_PATH}"
    echo "put -r ${DIST_DIR}/*"
  } > "${BATCH}"
  if [ "${USE_SSHPASS}" -eq 1 ]; then
    sshpass -p "${VERPEX_PASS}" sftp "${SSH_OPTS[@]}" -b "${BATCH}" "${VERPEX_USER}@${VERPEX_HOST}" || die "sftp upload failed"
  else
    sftp "${SSH_OPTS[@]}" -b "${BATCH}" "${VERPEX_USER}@${VERPEX_HOST}" || die "sftp upload failed"
  fi
fi

ok "deploy complete — dist/ uploaded to ${REMOTE}"
say "Next: verify https://falamadeira.searchingfool.com/manifest.webmanifest returns 200 (verpex-deploy validation)."
say "Reminder (operator): set Supabase Auth Site URL + Redirect URLs to https://falamadeira.searchingfool.com (project gxlrmdfqcqimwwplrdgd)."
