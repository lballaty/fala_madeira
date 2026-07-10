#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/serve-local.sh
# Description: Plan step `local-server-test` (P6). Serves the production `dist/` the way Verpex
#   will — real HTTP, SPA fallback, correct MIME for .webmanifest/.js, no-cache sw.js — via
#   scripts/static-server.mjs (zero-dep node http server, NOT vite preview), then:
#     (1) runs curl/PWA probes: /, /manifest.webmanifest (+ content-type), /sw.js, and an
#         unknown route (/practice) SPA-falls-back to index.html (200, not 404);
#     (2) runs the @smoke Playwright suite against THIS static server.
#   The static server owns the port BASE_URL points to (default 4173). Playwright's own
#   `webServer` (which would run `vite preview`) is bypassed because playwright.config.ts sets
#   `reuseExistingServer: !CI` — when this script already has a healthy server on the BASE_URL,
#   Playwright reuses it instead of starting vite preview. So @smoke targets the static artifact,
#   which is the whole point (vite preview masks SPA/MIME/SW deploy bugs). This script owns the
#   server lifecycle: build -> start -> wait-healthy -> curl checks -> @smoke -> teardown.
#   Modes:
#     (default)      build + serve + curl checks + @smoke, then tear down. Exit 0 iff all pass.
#     --serve-only   build + serve + wait for Ctrl-C (manual poking / debugging).
#     --no-build     skip `npm run build` (reuse existing dist/).
# Author: Libor Ballaty (with assistant)
# Created: 2026-07-10

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-4173}"
HOST_ADDR="127.0.0.1"
BASE_URL="${BASE_URL:-http://localhost:${PORT}}"

SERVE_ONLY=0
DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --serve-only) SERVE_ONLY=1 ;;
    --no-build)   DO_BUILD=0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[serve-local] stopping static server (pid $SERVER_PID)"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# --- 1. Build the production artifact --------------------------------------------------------
if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "[serve-local] building dist/ (npm run build)…"
  npm --prefix "$REPO_ROOT" run build
else
  echo "[serve-local] --no-build: reusing existing dist/"
fi

if [[ ! -f "$REPO_ROOT/dist/index.html" ]]; then
  echo "[serve-local] FATAL: dist/index.html missing after build" >&2
  exit 1
fi

# --- 2. Start the static server (like Verpex) ------------------------------------------------
echo "[serve-local] starting static server on ${BASE_URL} (SPA fallback + Verpex MIME)…"
PORT="$PORT" HOST="$HOST_ADDR" SERVE_DIR="$REPO_ROOT/dist" \
  node "$REPO_ROOT/scripts/static-server.mjs" &
SERVER_PID=$!

# Wait until it answers (max ~20s).
ready=0
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://${HOST_ADDR}:${PORT}/" 2>/dev/null; then
    ready=1; break
  fi
  sleep 0.5
done
if [[ "$ready" -ne 1 ]]; then
  echo "[serve-local] FATAL: static server did not become healthy on ${BASE_URL}" >&2
  exit 1
fi
echo "[serve-local] static server healthy."

if [[ "$SERVE_ONLY" -eq 1 ]]; then
  echo "[serve-local] --serve-only: server up at ${BASE_URL}. Ctrl-C to stop."
  wait "$SERVER_PID"
  exit 0
fi

# --- 3. PWA / deploy-artifact curl probes (mirror the Verpex .htaccess contract) -------------
echo "[serve-local] running PWA/deploy-artifact curl probes…"
probe_fail=0

check() {
  # check <label> <url> <expected_status> [expected_content_type_substr]
  local label="$1" url="$2" want_status="$3" want_ctype="${4:-}"
  local status ctype
  status="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
  if [[ "$status" != "$want_status" ]]; then
    echo "  [FAIL] $label -> HTTP $status (expected $want_status)  $url"
    probe_fail=1
    return
  fi
  if [[ -n "$want_ctype" ]]; then
    ctype="$(curl -s -o /dev/null -w '%{content_type}' "$url")"
    if [[ "$ctype" != *"$want_ctype"* ]]; then
      echo "  [FAIL] $label -> content-type '$ctype' (expected to contain '$want_ctype')  $url"
      probe_fail=1
      return
    fi
    echo "  [ OK ] $label -> HTTP $status, content-type '$ctype'"
  else
    echo "  [ OK ] $label -> HTTP $status"
  fi
}

check "root (/)"                "${BASE_URL}/"                     200 "text/html"
check "manifest MIME"          "${BASE_URL}/manifest.webmanifest" 200 "application/manifest+json"
check "service worker (sw.js)" "${BASE_URL}/sw.js"                200 "text/javascript"
check "registerSW.js"          "${BASE_URL}/registerSW.js"        200 "text/javascript"

# SPA fallback: an unknown client-side route must serve the shell (200), NOT 404.
practice_status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/practice")"
practice_body="$(curl -s "${BASE_URL}/practice")"
if [[ "$practice_status" == "200" ]] && grep -q '<div id="root">' <<<"$practice_body"; then
  echo "  [ OK ] SPA fallback (/practice) -> HTTP 200 serving index.html shell"
else
  echo "  [FAIL] SPA fallback (/practice) -> HTTP $practice_status, shell match=$(grep -qc '<div id=\"root\">' <<<"$practice_body" && echo yes || echo no)"
  probe_fail=1
fi

# A genuinely-missing ASSET (has an extension) must still 404 — the fallback must not mask
# broken asset references, which would hide real build problems.
missing_status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/assets/does-not-exist.js")"
if [[ "$missing_status" == "404" ]]; then
  echo "  [ OK ] missing asset (/assets/does-not-exist.js) -> HTTP 404 (fallback correctly NOT applied)"
else
  echo "  [FAIL] missing asset -> HTTP $missing_status (expected 404)"
  probe_fail=1
fi

# sw.js must NOT be long-cached (stale SW = users stuck on old build).
sw_cache="$(curl -s -o /dev/null -D - "${BASE_URL}/sw.js" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
if [[ "$sw_cache" == *"no-cache"* ]]; then
  echo "  [ OK ] sw.js Cache-Control: $sw_cache"
else
  echo "  [FAIL] sw.js Cache-Control: '$sw_cache' (expected no-cache)"
  probe_fail=1
fi

if [[ "$probe_fail" -ne 0 ]]; then
  echo "[serve-local] FATAL: PWA/deploy-artifact probes failed — real deploy blocker." >&2
  exit 1
fi
echo "[serve-local] all PWA/deploy-artifact probes passed."

# --- 4. @smoke Playwright suite vs the static server -----------------------------------------
# Playwright reuses this already-running server (reuseExistingServer:!CI) instead of vite preview.
echo "[serve-local] running @smoke Playwright suite vs the static server (${BASE_URL})…"
BASE_URL="$BASE_URL" npx --prefix "$REPO_ROOT" playwright test --grep @smoke --reporter=line
smoke_exit=$?

if [[ "$smoke_exit" -ne 0 ]]; then
  echo "[serve-local] FATAL: @smoke failed against the static server (exit $smoke_exit)." >&2
  exit "$smoke_exit"
fi

echo "[serve-local] @smoke passed against the static artifact. local-server-test OK."
