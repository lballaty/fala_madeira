#!/usr/bin/env bash
# File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/check-standards.sh
# Description: Grep-based enforcement of the mechanically-checkable subset of
#              docs/ENGINEERING-STANDARDS.md. This is the automatable floor of the
#              §12 compliance checklist — the human review in
#              docs/STANDARDS-COMPLIANCE-REPORT.md covers the judgment items.
#              Only checks that are actually implemented below are asserted; nothing
#              here claims coverage it does not have (e.g. a11y, RLS, retry semantics
#              are NOT grep-decidable and are deferred to the report + verify-security).
#              HARD checks (violation => exit 1): bare console.error/warn outside the
#              DEV-gated logger, provider-key material in src/, dangerouslySetInnerHTML
#              without a sanitize seam, hardcoded localhost/secret fallbacks in error
#              paths, empty/comment-only catch blocks, the MADEIRA2026 unlock literal.
#              WARN checks (advisory, never fail): `as any` casts, oversized App.tsx,
#              path-form-commit reminder.
#              Invoked standalone or as stage 6 of scripts/preflight.sh.
# Author: Libor Ballaty (with assistant)
# Created: 2026-07-10

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${REPO_ROOT}/src"

# ANSI (no color when not a TTY)
if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; N=$'\033[0m'; else G=""; R=""; Y=""; B=""; N=""; fi

HARD_FAILURES=0
WARN_COUNT=0

pass()  { printf '  %s[PASS]%s %s\n' "$G" "$N" "$1"; }
fail()  { printf '  %s[FAIL]%s %s\n' "$R" "$N" "$1"; HARD_FAILURES=$((HARD_FAILURES + 1)); }
warn()  { printf '  %s[WARN]%s %s\n' "$Y" "$N" "$1"; WARN_COUNT=$((WARN_COUNT + 1)); }

# grep helper: search src/ for a pattern, excluding tests. Prints matches to the
# provided varname via a temp file so callers can show evidence. Returns match count.
scan() { # scan <extended-regex> ; echoes matching "file:line:content" lines (tests excluded)
  grep -rEn "$1" "${SRC_DIR}" --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v '/__tests__/' || true
}

printf '%s=== ENGINEERING-STANDARDS mechanical checks ===%s\n' "$B" "$N"
printf 'Scanning: %s (excluding __tests__)\n\n' "${SRC_DIR}"

# ---------------------------------------------------------------------------
# HARD 1 — No bare console.error/warn in error paths (§3.3).
#   The ONLY legitimate console.error/warn in src is the DEV-gated echo inside
#   src/lib/logger.ts (guarded by `if (!import.meta.env.DEV) return`). Any hit
#   outside logger.ts is a violation of the centralized-logger gate.
# ---------------------------------------------------------------------------
console_hits="$(scan 'console\.(error|warn)' | grep -v 'src/lib/logger\.ts:' || true)"
if [ -z "${console_hits}" ]; then
  pass "No bare console.error/warn outside the DEV-gated logger (§3.3 centralized-logger gate)"
else
  fail "Bare console.error/warn outside src/lib/logger.ts (§3.3):"
  printf '%s\n' "${console_hits}" | sed 's/^/         /'
fi

# ---------------------------------------------------------------------------
# HARD 2 — No provider key material in src/ (§4, §12 security).
#   Shapes: Gemini/Google (AIzaSy…), OpenAI (sk-…), a service_role literal, and
#   a GEMINI_API_KEY name=value assignment. (dist/ + native bundle scanning is
#   verify-security.mjs's job; this is the source-tree floor.)
# ---------------------------------------------------------------------------
secret_hits="$(scan 'AIza[0-9A-Za-z_-]{20,}|\bsk-[A-Za-z0-9]{20,}|service_role["'"'"']?\s*[:=]|GEMINI_API_KEY\s*[:=]\s*["'"'"'][^"'"'"']+["'"'"']' || true)"
if [ -z "${secret_hits}" ]; then
  pass "No provider key material (Gemini/OpenAI/service_role) in src/ (§4 secrets-server-side)"
else
  fail "Possible key material in src/ (§4) — verify these are not real secrets:"
  printf '%s\n' "${secret_hits}" | sed 's/^/         /'
fi

# ---------------------------------------------------------------------------
# HARD 3 — No dangerouslySetInnerHTML without a sanitize seam (§8, XSS).
#   The repo renders untrusted markdown through src/components/SafeMarkdown.tsx
#   (react-markdown + rehype-sanitize). A raw dangerouslySetInnerHTML anywhere is
#   a violation unless the same line/file references a sanitizer.
# ---------------------------------------------------------------------------
dsi_hits="$(scan 'dangerouslySetInnerHTML' | grep -viE 'sanitize|DOMPurify|SafeMarkdown' || true)"
if [ -z "${dsi_hits}" ]; then
  pass "No dangerouslySetInnerHTML without a sanitize seam (§8; markdown via SafeMarkdown+rehype-sanitize)"
else
  fail "dangerouslySetInnerHTML without a visible sanitizer (§8 XSS):"
  printf '%s\n' "${dsi_hits}" | sed 's/^/         /'
fi

# ---------------------------------------------------------------------------
# HARD 4 — No hardcoded localhost / secret fallbacks (§3.3, §7).
#   Bans the `?? "http://localhost:…"` / `|| "http://…"` silent-default pattern
#   the standard explicitly calls out. Missing config must fail loudly.
# ---------------------------------------------------------------------------
fallback_hits="$(scan '(\?\?|\|\|)\s*["'"'"']https?://(localhost|127\.0\.0\.1)' || true)"
if [ -z "${fallback_hits}" ]; then
  pass "No hardcoded localhost/URL fallbacks (§3.3/§7 fail-loud config)"
else
  fail "Hardcoded localhost/URL fallback (§3.3/§7 — missing config must fail loudly):"
  printf '%s\n' "${fallback_hits}" | sed 's/^/         /'
fi

# ---------------------------------------------------------------------------
# HARD 5 — No empty / comment-only catch blocks (§3.3 no-swallowed-catches).
#   Matches `catch {}`, `catch (e) {}`, and `catch { /* … */ }` on one line.
#   Multi-line empty catches are not grep-decidable and fall to /code-review.
# ---------------------------------------------------------------------------
empty_catch_hits="$(scan 'catch\s*(\([^)]*\))?\s*\{\s*(/\*.*\*/\s*)?\}' || true)"
if [ -z "${empty_catch_hits}" ]; then
  pass "No single-line empty/comment-only catch blocks (§3.3 no-swallowed-catches)"
else
  fail "Empty or comment-only catch block (§3.3):"
  printf '%s\n' "${empty_catch_hits}" | sed 's/^/         /'
fi

# ---------------------------------------------------------------------------
# HARD 6 — No secret-like unlock constant in code (§7).
#   The MADEIRA2026 unlock key must live in global_settings, not src/.
# ---------------------------------------------------------------------------
unlock_hits="$(scan 'MADEIRA2026' || true)"
if [ -z "${unlock_hits}" ]; then
  pass "No MADEIRA2026 unlock literal in src/ (§7 no secret-like unlock constants)"
else
  fail "MADEIRA2026 unlock literal present in src/ (§7 — move to global_settings):"
  printf '%s\n' "${unlock_hits}" | sed 's/^/         /'
fi

printf '\n%s--- advisory (WARN, non-fatal) ---%s\n' "$B" "$N"

# ---------------------------------------------------------------------------
# WARN A — `as any` / `: any` casts (§8 no-any). Grep cannot distinguish a real
#   cast from the word "any" in a comment or a string, so this is advisory:
#   tsc + eslint (with typescript-eslint) are the authoritative no-any gate.
# ---------------------------------------------------------------------------
any_hits="$(scan '\bas any\b|:\s*any\b|<any>' | grep -vE '//|/\*|\*' || true)"
if [ -z "${any_hits}" ]; then
  pass "No obvious \`as any\`/\`: any\` casts in code lines (§8; tsc/eslint authoritative)"
else
  warn "Possible \`any\` usage (§8) — confirm via eslint; grep may match prose:"
  printf '%s\n' "${any_hits}" | sed 's/^/         /'
fi

# ---------------------------------------------------------------------------
# WARN B — App.tsx shell size (§1.1: < 800 lines). Advisory here because the
#   split-app-components migration is plan-tracked; report captures the target.
# ---------------------------------------------------------------------------
if [ -f "${SRC_DIR}/App.tsx" ]; then
  app_lines="$(wc -l < "${SRC_DIR}/App.tsx" | tr -d ' ')"
  if [ "${app_lines}" -lt 800 ]; then
    pass "App.tsx is ${app_lines} lines (< 800 shell budget, §1.1)"
  else
    warn "App.tsx is ${app_lines} lines (≥ 800; §1.1 shell budget — split into features)"
  fi
fi

# ---------------------------------------------------------------------------
# WARN C — path-form-commit reminder (§10). Informational: this script cannot
#   police the commit that hasn't happened yet; it reminds the operator/workflow.
# ---------------------------------------------------------------------------
warn "Reminder (§10): commit path-form (\`git commit <path> -m …\`), verify staged set, no Co-Authored-By trailers"

# ---------------------------------------------------------------------------
# WARN D — silent no-op guards on session/client in user-action paths (EN-27,
#   the TB-15 class). A bare `if (!supabase|!user|!session|!chatSession) return;`
#   in a USER-ACTION handler means the user acted and nothing happened — no toast,
#   no log. This grep cannot tell a handler from a data-fetch effect (where a
#   silent no-op IS correct), so it is ADVISORY: each hit needs a human/agent
#   judgment — if it sits in a handle*/onClick/onSubmit path, add logger + a Ref
#   toast (see useLessonModals.handleSuggestVideo / useTutorSession.handleSendMessage).
#   Matches only a BARE `return;` (value-returns are not silent no-ops).
# ---------------------------------------------------------------------------
noop_guard_hits="$(scan 'if \(![^)]*(supabase|chatSession|\bsession)[^)]*\) return;' || true)"
if [ -z "${noop_guard_hits}" ]; then
  pass "No session/client bare-return guards to review (EN-27 no-silent-no-op, TB-15 class)"
else
  warn "Session/client bare-return guards (EN-27) — confirm each is a data-fetch effect, NOT a user-action handler that should log+toast:"
  printf '%s\n' "${noop_guard_hits}" | sed 's/^/         /'
fi

# ---------------------------------------------------------------------------
printf '\n%s=== check-standards summary ===%s\n' "$B" "$N"
printf 'HARD failures: %s   WARN: %s\n' "${HARD_FAILURES}" "${WARN_COUNT}"
if [ "${HARD_FAILURES}" -gt 0 ]; then
  printf '%sRESULT: FAIL — %s hard standards violation(s).%s\n' "$R" "${HARD_FAILURES}" "$N"
  exit 1
fi
printf '%sRESULT: PASS — no hard standards violations (advisories printed above).%s\n' "$G" "$N"
exit 0
