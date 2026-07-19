#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/preflight.sh
# Description: Recurring pre-commit / pre-deploy quality gate for FalaMadeira (plan
#              step P6/P1 `preflight-and-standards`). Runs the full local verification
#              chain in order, failing fast on the first HARD stage that breaks, and
#              prints a final PASS/FAIL summary. Stages:
#                1. lint:eslint  — eslint src            (HARD)
#                2. lint         — tsc --noEmit          (HARD)
#                3. test:run     — vitest run            (HARD)
#                4. build        — vite build            (HARD)
#                5. npm audit    — prod deps, high floor (WARN on advisories that
#                                  need a breaking dep bump; FAIL only on high/critical
#                                  in the prod dependency tree)
#                6. check-standards.sh — grep-based ENGINEERING-STANDARDS enforcement
#                                        (HARD: exits non-zero on hard violations)
#              Exits non-zero if ANY hard stage fails. Does NOT run npm install and
#              does NOT touch source. Security probes (verify-security.mjs) are a
#              separate live-network gate and are NOT invoked here by default (they
#              hit Supabase); pass --with-security to include them.
# Author: Libor Ballaty (with assistant)
# Created: 2026-07-10

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

WITH_SECURITY=0
for arg in "$@"; do
  case "${arg}" in
    --with-security) WITH_SECURITY=1 ;;
    -h|--help)
      echo "Usage: bash scripts/preflight.sh [--with-security]"
      echo "  --with-security  also run scripts/verify-security.mjs (live Supabase probes)"
      exit 0 ;;
    *) echo "Unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; N=$'\033[0m'; else G=""; R=""; Y=""; B=""; N=""; fi

# Ordered stage log: "NAME|STATUS" (STATUS = PASS|FAIL|WARN|SKIP)
STAGES=()
FATAL=0

banner() { printf '\n%s========================================%s\n%s%s%s\n%s========================================%s\n' "$B" "$N" "$B" "$1" "$N" "$B" "$N"; }

# run_hard <label> <cmd...> : run a command; on non-zero exit, record FAIL and stop.
run_hard() {
  local label="$1"; shift
  banner "STAGE: ${label}"
  if "$@"; then
    printf '%s[STAGE PASS]%s %s\n' "$G" "$N" "${label}"
    STAGES+=("${label}|PASS")
  else
    local rc=$?
    printf '%s[STAGE FAIL]%s %s (exit %s)\n' "$R" "$N" "${label}" "${rc}"
    STAGES+=("${label}|FAIL")
    FATAL=1
    summary
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Stage 5 audit thresholds (documented, pragmatic):
#   - FAIL only when the PRODUCTION dependency tree has a HIGH or CRITICAL advisory
#     (`npm audit --omit=dev --audit-level=high` returns non-zero).
#   - Advisories that are low/moderate, dev-only, or only fixable via a breaking
#     dependency bump are WARN, not FAIL — surfaced for the operator, not blocking
#     a green preflight. Rationale: a green gate must reflect ship-blocking risk,
#     and a dev-server-only low-sev transitive advisory is not that.
# ---------------------------------------------------------------------------
run_audit() {
  banner "STAGE: npm audit (prod deps, high/critical = FAIL)"
  # Human-readable report (never let the informational report abort the script).
  npm audit --omit=dev --audit-level=high || true
  echo ""
  # Authoritative gate: non-zero here means a high/critical advisory in prod deps.
  if npm audit --omit=dev --audit-level=high >/dev/null 2>&1; then
    printf '%s[STAGE PASS]%s no high/critical advisory in production deps\n' "$G" "$N"
    STAGES+=("npm audit (prod high/critical)|PASS")
  else
    printf '%s[STAGE FAIL]%s high/critical advisory in production dependency tree — resolve before ship\n' "$R" "$N"
    STAGES+=("npm audit (prod high/critical)|FAIL")
    FATAL=1
    summary
    exit 1
  fi
  # Advisory band: anything below the high floor (low/moderate, incl. dev-only) => WARN.
  if npm audit --audit-level=critical >/dev/null 2>&1; then
    : # nothing at all
  else
    printf '%s[NOTE]%s low/moderate advisories present (below the high ship-block floor) — WARN, not blocking. Run `npm audit` for detail.\n' "$Y" "$N"
    STAGES+=("npm audit (low/moderate advisories)|WARN")
  fi
}

summary() {
  banner "PREFLIGHT SUMMARY"
  local worst_pass=1
  for entry in "${STAGES[@]}"; do
    local name="${entry%%|*}"
    local status="${entry##*|}"
    local tag
    case "${status}" in
      PASS) tag="${G}PASS${N}" ;;
      WARN) tag="${Y}WARN${N}" ;;
      SKIP) tag="${Y}SKIP${N}" ;;
      FAIL) tag="${R}FAIL${N}"; worst_pass=0 ;;
      *)    tag="${status}" ;;
    esac
    printf '  [%s] %s\n' "${tag}" "${name}"
  done
  echo ""
  if [ "${FATAL}" -ne 0 ] || [ "${worst_pass}" -eq 0 ]; then
    printf '%sPREFLIGHT: FAIL%s — fix the failed stage(s) above before commit/deploy.\n' "$R" "$N"
  else
    printf '%sPREFLIGHT: PASS%s — all hard gates green (advisories, if any, printed above).\n' "$G" "$N"
  fi
}

# ---------------------------------------------------------------------------
# Run the chain (fail-fast: run_hard / run_audit exit 1 on a hard failure).
# ---------------------------------------------------------------------------
printf '%s=== FalaMadeira preflight (recurring quality gate) ===%s\n' "$B" "$N"
printf 'Repo: %s\n' "${REPO_ROOT}"
printf 'Note: does NOT run npm install; does NOT modify source.\n'

run_hard "eslint (npm run lint:eslint)"      npm run lint:eslint
run_hard "typecheck (npm run lint / tsc)"    npm run lint
run_hard "unit+component tests (npm run test:run)" npm run test:run
run_hard "build (npm run build)"             npm run build
run_hard "e2e coverage contract (npm run test:e2e:coverage)" npm run test:e2e:coverage
run_audit
run_hard "standards (scripts/check-standards.sh)" bash "${SCRIPT_DIR}/check-standards.sh"

# CORS header contract — HARD gate. A client request header (e.g. traceparent) missing from the
# edge Access-Control-Allow-Headers breaks the browser preflight → every edge call fails. This
# regression (2026-07-14) was invisible to node/curl and mocked e2e, so it gets a build-time gate.
run_hard "cors header contract (client↔edge allow-headers)" node "${SCRIPT_DIR}/check-cors-headers.mjs"

# Help-drift contract (EN-17a) — HARD gate. The chat-help edge artifact
# (supabase/functions/_shared/appHelp.generated.ts) is generated from the single App Capability
# Registry (src/content/appCapabilities.ts). If the registry changed without regenerating, the
# chat help prompt is stale — fail the build. Fix: node scripts/gen-app-help.mjs && commit.
run_hard "help drift contract (capability registry ↔ generated chat-help)" node "${SCRIPT_DIR}/check-help-drift.mjs"

# IndexedDB DB_VERSION drift — HARD gate. Test helpers that open FalaMadeiraAudioCache at a version
# different from the app's DB_VERSION deadlock the app's upgrade (content/audio hang) or silently
# no-op the seed — the root cause of the EN-8 v2->v3 e2e breakage. Keeps test-side opens in lockstep.
run_hard "IndexedDB version drift (app DB_VERSION ↔ e2e helpers)" node "${SCRIPT_DIR}/check-db-version-drift.mjs"

# Observability §9 forbidden-pattern check — HARD gate (EN-27). --strict fails on any bare console
# in an error path or hardcoded config fallback (both eliminated in EN-27); TOAST-NO-LOG stays
# advisory inside --strict (validation-gate toasts are expected false positives). From here on, any
# NEW console-only error path or hardcoded fallback fails the build — the class cannot silently
# return.
run_hard "observability §9 forbidden patterns (--strict)" node "${SCRIPT_DIR}/check-observability.mjs" --strict

# Release-notes completeness gate (AGENTS.md §4) — WARN-only during rollout. Compares the top
# CHANGELOG entry against the user-facing feat(/fix( commits shipped since the last release and
# reports missing tickets, over-collapsed entries, and technical jargon leaking into bullets.
# The script ALWAYS exits 0 today (a pending prod deploy runs preflight), so this stage never
# fails the build — findings are advisory. Promote to enforce with CHANGELOG_GATE_ENFORCE=1
# once the heuristics are tuned.
run_hard "changelog completeness (release-notes standard, WARN-only)" node "${SCRIPT_DIR}/check-changelog-completeness.mjs"

if [ "${WITH_SECURITY}" -eq 1 ]; then
  run_hard "security probes (scripts/verify-security.mjs)" npm run verify:security
else
  banner "STAGE: security probes (skipped)"
  printf '%s[SKIP]%s verify-security.mjs not run (live Supabase probes). Re-run with --with-security or `npm run verify:security`.\n' "$Y" "$N"
  STAGES+=("security probes (verify-security.mjs)|SKIP")
fi

summary
exit 0
