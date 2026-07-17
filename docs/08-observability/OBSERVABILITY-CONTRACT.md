# FalaMadeira Observability & Centralized Error-Handling Contract

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/08-observability/OBSERVABILITY-CONTRACT.md
**Description:** Canonical methodology for error handling, event logging, tracing, and auditing across the FalaMadeira client, edge functions, and database. Instance of the cross-repo observability doctrine (agentic-operating-standard.md § "Centralized error handling and observability"). Codifies the existing implementation, records the design decisions that were never written down, and defines the gaps that the companion plan (`plans/plan-2026-07-14-observability.yaml`) closes.
**Author:** Observability design
**Created:** 2026-07-14
**Last Updated:** 2026-07-14
**Last Updated By:** observability methodology design

## 1. Purpose & scope

Every error path in the client, edge functions, and database MUST route through this centralized methodology. Two surfaces are always required: a **persisted, queryable log record** and a **user-visible response carrying a machine code + human message + support reference**. This contract is the source of truth; code that diverges is a defect.

## 2. Correlation model

Every log event and every user-facing error carries the same ID set so a user's support reference joins directly to the persisted record and across tiers (client ↔ edge ↔ DB).

| ID | Lifetime | Source | Status |
|---|---|---|---|
| `session_id` | one page load | `logger.ts` module init (`SESSION_ID`) | ✅ implemented |
| `request_id` | one invocation | per `logger.record()` / per edge request (`_shared/http.ts`) | ✅ implemented |
| `correlation_id` | one request-level flow | client defaults to `request_id`; overridden with the edge `requestId` to join client↔edge | ✅ implemented |
| `user_id` | authenticated caller | `logger.setUser()` at auth transitions | ✅ implemented |
| `trace_id` / `span_id` | end-to-end request | W3C `traceparent` header, client→edge→log | ✅ implemented (plan `obs-trace`) |
| `org_id` / tenant | n/a | single-tenant consumer app | ⛔ out of scope (record the decision here) |

## 3. The two mandatory surfaces

1. **Log surface** — a persisted `public.logs` row for every `ERROR`/`CRITICAL` (and audit-relevant `INFO`), carrying all correlation IDs, `level`, `category`, `event_type`, and structured `details`. Queryable for support and post-mortems.
2. **User surface** — the response the user sees MUST carry a machine `code`, a human `message`, and a support `ref` (short form of `request_id`/`correlation_id`). Built via `userMessage(code, message, ref)` on the client and the `errorResponse(code, message, status, requestId, details)` envelope on the edge. These are **peers, not alternatives** — an error surfaced to the user without also being persisted (or vice-versa) is a contract violation.

## 4. Levels & categories

- **Levels:** `CRITICAL` · `ERROR` · `WARN` · `INFO` · `DEBUG`. Only `CRITICAL`/`ERROR` persist by default; `WARN`/`INFO` persist when audit-relevant; `DEBUG` is dev-only console echo (behind `import.meta.env.DEV`).
- **Categories:** `SYSTEM_HEALTH` · `SECURITY` · `DATA_PROCESSING` · `AI_DECISION` · `USER_ACTION` (extend only via this doc).

## 5. Routing choke points (no error bypasses these)

**Client:**
- Supabase data errors → `handleSupabaseError(error, operation, path)` → `logger.error` + `userMessage` toast. ✅
- Edge-function errors → single choke point in `geminiService.invokeEdgeFunction` → `logger.error('edge_fn_failed', …, correlationId: serverRequestId)` + throw `userMessage(code, message, ref)`. ✅
- Uncaught render errors → `ErrorBoundary.componentDidCatch` → `logger.critical`. ✅
- Uncaught runtime errors & promise rejections → `window.addEventListener('error'|'unhandledrejection')` → `logger.critical`. ✅ implemented (plan `obs-global-handlers`; installed in `main.tsx` before mount).

**Edge functions:**
- All handlers return the `errorResponse(...)` envelope. ✅
- Every `ERROR`/`CRITICAL`/degradation-`WARN` also persists to `public.logs` via the service-role client (`_shared/persistLog.ts`). ✅ implemented (plan `obs-edge-persist`; `gemini` + `delete-account`).

## 6. Persistence model

- **Client → sink:** the client persist queue posts batched events to a dedicated **`log-sink` edge function** (service-role insert), NOT a direct table insert. This removes the pre-auth limitation (§7) because the sink writes with service-role, not `auth.uid()`. The client still stamps `user_id` when known. (Current code inserts directly and is RLS-gated — see §7 gap.)
- **Edge → direct:** edge functions insert their own `ERROR`/`CRITICAL` events to `public.logs` via their existing service-role admin client.
- **DB schema:** `public.logs` is extended to first-class the observability fields instead of stuffing everything into `details` text: add `level`, `category`, `event_type`, `session_id`, `request_id`, `correlation_id`, `trace_id` columns; keep `user_id` nullable (diagnostic/pre-auth rows have `NULL`); retain `details` (jsonb) and `device_info`.
- **RLS:** SELECT stays owner-or-admin. INSERT via service-role (the sink / edge) is the write path; the legacy `auth.uid() = user_id` INSERT policy is retained for authenticated direct writes but is no longer the primary path.

## 7. Pre-auth / anonymous persistence — DECISION

**Problem:** `public.logs` INSERT requires `auth.uid() = user_id`, so events logged before sign-in (boot, the EF-33 lock stall) or while signed-out never flush — the highest-severity class is invisible in persisted logs.

**Decision (chosen for autonomous execution): a service-role `log-sink` edge function.** The client flushes to it; it inserts with service-role (RLS bypassed), accepting `user_id = NULL` for anonymous/pre-auth diagnostics. Rejected alternatives: (a) an anonymous-insert RLS policy on the table — weakens table security and invites abuse; (b) `sendBeacon`-on-unload only — unreliable and doesn't cover mid-session pre-auth. The sink also rate-limits and size-caps payloads to prevent abuse.

## 8. Trace context (W3C)

Client generates a `traceparent` per request-level flow, sends it as a header on every `functions.invoke`; edge functions read it, include `trace_id`/`span_id` in their `errorResponse` details and their persisted log rows. This lets a single flow be reconstructed across client, edge, and DB.

## 9. Forbidden patterns (CI-enforceable)

- Bare `console.error`/`console.warn`/`print` in an error path without a paired `logger.*` call (dev echo inside `logger.ts` excepted).
- `catch` blocks that swallow errors without logging (incl. `.catch(() => undefined)` on non-best-effort paths).
- `showToast(…, 'error')` for a *system* error without a paired persisted log (validation-gate toasts are exempt).
- Hardcoded fallback URLs/secrets that mask misconfiguration (`?? "http://…"`). Missing config fails loudly through the error surface.
- A user-facing error without a `code` + `ref`, or a persisted error missing correlation IDs.

## 10. Current state & known gaps (verified 2026-07-14)

**Strong / done:** client 3-tier logger, correlation IDs, `setUser` linkage, `handleSupabaseError`, edge `errorResponse` envelope + `requestId`, `ErrorBoundary`, sync-queue logging, dual-surface via `userMessage`.

**Gaps — CLOSED by `plans/plan-2026-07-14-observability.yaml` (all 10 steps succeeded 2026-07-14):**
1. ✅ Global `window` `error` / `unhandledrejection` handlers → `logger.critical` before mount. (`obs-global-handlers`)
2. ✅ Edge functions persist ERROR/CRITICAL/degradation-WARN to `public.logs` via `_shared/persistLog.ts`. (`obs-edge-persist`)
3. ✅ Pre-auth/anonymous events flush through the service-role `log-sink` edge function (user_id null). (`obs-schema` + `obs-log-sink` + `obs-client-sink`)
4. ✅ W3C trace context: client generates `traceparent`, edge parses + threads `trace_id`. (`obs-trace`)
5. ✅ The 6 unlogged client sites now route through `logger` (speech onError x2, listening playback x2, 5 sync-queue swallows, storage read). (`obs-client-sites`)
6. ✅ TTS `503 TTS_UNAVAILABLE` degrades to browser Web Speech (`AudioAdapter.speak()`), WARN-logged, no error toast. (`obs-tts-fallback`)
7. ✅ `logs` schema first-classed the observability fields (level/category/event_type/session_id/request_id/correlation_id/trace_id + indexes). (`obs-schema`, migration 00010, live-applied)

**Enforcement:** `scripts/check-observability.mjs` (`obs-ci-gate`) statically checks the §9 forbidden patterns; wired into `scripts/preflight.sh` in WARN mode during rollout (flip to `--strict` to make it a hard gate).

**Deploy dependency:** the edge changes (`log-sink`, `gemini`, `delete-account`) require `supabase functions deploy` to take effect in prod; the client changes ship with the normal web build.

## 11. Implementation

The executable, resumable plan that closes §10 is `plans/plan-2026-07-14-observability.yaml`, run via `/execute-plan`. Each work package declares its own validation gate (tsc/lint/build/grep) and `fatal_on_failure`. Schema + edge changes require the two-pass live verification (prod source-of-truth, then cloud-dev) per the engineering standard before being marked verified.
