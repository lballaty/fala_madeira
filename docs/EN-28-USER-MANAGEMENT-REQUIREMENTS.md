# EN-28 — Admin User Management (view · manage · delete users)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-28-USER-MANAGEMENT-REQUIREMENTS.md
**Description:** Requirements for an admin-facing user-management capability: browse/search users, view a user's account state, manage access attributes (role, tier, level, voice limit), and **delete or disable a user** (admin-initiated) — which does not exist today. Builds on the EN-15/EN-25 User Access panel and the self-service `delete-account` machinery.
**Author:** claude-agent-c
**Created:** 2026-07-20
**Last Updated:** 2026-07-20
**Last Updated By:** claude-agent-c
**Status:** **DRAFT — awaiting owner approval before any coding (AGENTS §3 requirements gate).** No build until this doc is owner-approved. Live activation (deleting real users) is additionally operator-gated + staging-first.

---

## 1. Problem / motivation

Admins can currently *grant* access to a user (tier / level / voice limit) but cannot **remove or disable a user**. The only deletion path is **self-service** (`delete-account`, the caller deletes their own account). There is **no admin-deletes-another-user path** — so cleaning up spam signups, abusive accounts, GDPR erasure requests on a user's behalf, or test/beta accounts requires a manual DB operation by the operator. EN-28 closes that gap with a safe, audited, admin-gated flow.

Owner ask (TESTER-FEEDBACK-TRACKER, EN-28, 2026-07-18): admin should be able to delete/manage users. This doc specifies it.

## 2. Current state (grounded in code — reuse, don't rebuild)

- **Admin shell + gating.** `src/features/admin/AdminView.tsx:45-85` renders five tabs (`queues | studio | access | config | audio`); admin-gated by `profile?.role === 'admin'` (`src/App.tsx:360`) and, at the DB layer, `public.is_admin()` (SECURITY DEFINER, `supabase/migrations/00003_*.sql:167-175`).
- **User Access panel (EN-15 / EN-25, shipped).** `src/features/admin/UserAccessPanel.tsx` + `useUserAccess.ts:89-229`:
  - Search users by partial email (`ilike`, limit 50; blank query browses all) — `useUserAccess.ts:110-120`.
  - Grant `subscription_tier` (free/premium/unlimited), optional `unlocked_level`, optional per-user `voice_limit` — `useUserAccess.ts:164-229`.
  - Confirmation modal pattern (`UserAccessPanel.tsx:210-219`, currently `isDestructive={false}`).
  - Audit-logged with correlation IDs: `ADMIN_ACCESS_SEARCH_HIT/MISS`, `ADMIN_ACCESS_SELECT`, `ADMIN_ACCESS_GRANTED` (`useUserAccess.ts:130-213`).
- **Self-service deletion (self-only).** Edge fn `supabase/functions/delete-account/index.ts:13-91` verifies the caller's JWT, runs the pure orchestrator `_shared/deleteUserData.ts:50-74`, then `admin.auth.admin.deleteUser(uid)` (service-role). Deletes, in order: `lessons`, `lesson_requests`, `tickets`, `logs`, `video_suggestions`, `lesson_corrections`, `profiles` (fail-fast, returns `stepsCompleted`/`failedTable`). **Logs only on error** — no success audit event (gap).
- **profiles RLS already admits admins.** SELECT/UPDATE `USING (auth.uid() = id OR public.is_admin())` (`00013_*.sql:20-33`); DELETE `USING (auth.uid() = id OR public.is_admin())` (`00004_*.sql:35-39`). `profiles.id` is `REFERENCES auth.users(id) ON DELETE CASCADE` (`00001_*.sql`).
- **auth.users deletion is service-role only.** GoTrue-managed; RLS does not apply. Only `auth.admin.deleteUser()` (service-role) can remove an auth user; the profile row then cascades.
- **Observability contract.** `docs/08-observability/OBSERVABILITY-CONTRACT.md`; client logger `src/lib/logger.ts` (correlation_id/session_id/request_id/user_id); persisted to `public.logs` (`00010_*.sql`).

## 3. Scope

**In:**
- An admin **user list / search + detail view** (extend the existing User Access panel).
- Admin-initiated **delete** of another user (hard delete) and/or **disable/suspend** (soft), with a hard confirmation and full audit.
- Consolidate the existing **manage** actions (role?, tier, level, voice limit) into the same detail view.

**Out (this pass):**
- Bulk operations (multi-select delete) — future.
- Self-service account deletion (already shipped; unchanged).
- Billing/subscription provider integration.
- Email/notification infrastructure beyond a single decision point (see R8).

## 4. Functional requirements

- **R1 — User browse/search + detail.** Reuse `useUserAccess` search; add a **detail view** for a selected user showing: email, `role`, `subscription_tier`, `unlocked_level`, `proficiency_level`, `voice_limit`, consent flags (`has_accepted_terms`, `has_accepted_ai_usage`), created/last-active if available. Read via existing admin SELECT RLS.
- **R2 — Manage attributes.** From the detail view, edit tier / level / voice_limit (existing grant path). **Role changes** (`user`↔`admin`) are in scope only if owner approves (R-decision D1) — privilege escalation is high-risk and must be separately gated + audited.
- **R3 — Delete a user (admin-initiated).** A **new admin-gated edge function** (mirror `delete-account`) that accepts `(admin caller JWT, targetUserId)`, verifies the caller `is_admin()`, runs `deleteUserData(targetUserId)`, then `auth.admin.deleteUser(targetUserId)` under service-role. Returns a structured envelope with `requestId`. Reuse the pure `deleteUserData` core unchanged.
- **R4 — Soft vs hard delete (decision D2).** Options: (a) **hard delete** (irreversible, cascade — matches self-delete semantics), (b) **soft disable** (add `disabled_at`/`disabled_by` to `profiles`, block sign-in, retain data for recovery/audit), or (c) **both** (disable now, hard-delete later). Recommendation: **support disable first (reversible, safer), with hard-delete as an explicit second action** — deleting live users is irreversible.
- **R5 — Irreversibility guard.** Delete uses the `ConfirmationModal` with `isDestructive={true}`, requires typing the target email (or an explicit "I understand this is permanent" affirmation) before the action enables. No accidental single-click deletes.
- **R6 — Audit every attempt (success AND failure).** Emit a persisted `public.logs` event for every manage/delete action with `category: 'SECURITY'`, `event_type` e.g. `admin_user_deleted` / `admin_user_disabled` / `admin_role_changed`, and `details: { actorId, targetId, targetEmail, action, before, after, stepsCompleted?, failedTable? }`, carrying `correlation_id`/`request_id`/`user_id`. **This also closes the existing self-delete success-audit gap** by adding a success event to the shared path.
- **R7 — Structured user-facing result.** The admin sees a machine-readable `code` + human message + a `Ref` (from correlation_id) on both success and failure, per the observability doctrine — never a bare "failed".
- **R8 — User notification (decision D3).** Decide whether an admin delete/disable notifies the affected user (email). Default recommendation: **no email in v1** (no email infra), but record the decision explicitly.

## 5. Security & RLS constraints

- Delete/disable of *another* user MUST go through an **admin-gated edge function** using the **service-role** key (auth.users deletion is server-only). The function MUST re-verify `is_admin()` server-side from the caller's JWT — never trust a client-asserted role.
- An admin MUST NOT be able to delete **themselves** via this path (guard `targetUserId !== callerId`; self-delete stays on `delete-account`).
- Role escalation (R2/D1) is the highest-risk action — if in scope, gate it behind a second confirm and a distinct audit event; consider restricting to a single owner-level super-admin.
- Live deletes are **operator-gated + staging-first** (shared prod DB; irreversible).

## 6. Observability requirements

Per `docs/08-observability/OBSERVABILITY-CONTRACT.md`: both surfaces required — a persisted `public.logs` row (correlation IDs, `category: 'SECURITY'`, level `INFO` on success / `ERROR` on failure) **and** a user-visible envelope carrying the `Ref`. No bare `console.*`, no swallowed catch, no hardcoded fallback. The delete edge fn must log the outcome including `stepsCompleted`/`failedTable` on partial failure.

## 7. Data-model impact

- **Hard-delete path:** none (reuses cascade + `deleteUserData`).
- **Soft-disable path (if D2 chooses (b)/(c)):** a new migration adding `profiles.disabled_at timestamptz NULL` + `profiles.disabled_by uuid NULL` (+ optional `disabled_reason text`), additive/idempotent, admin-writable under existing RLS; plus a sign-in block honoring `disabled_at` (app + optionally an auth hook). Migration authored → applied live is operator-gated.

## 8. Testing requirements (per edge-testing policy + AGENTS §3)

- **Pure core:** extend/reuse `deleteUserData.ts` unit tests (vitest) — the admin path reuses the same core; add a test that admin-delete cannot target self.
- **Edge glue** (`Deno.serve` in the new admin-delete fn): mandatory agentic `/code-review` of the JWT-verify + is_admin gate + service-role usage (per the edge-testing policy — no deno harness).
- **E2E (Playwright, backend evidence):** admin logs in → deletes a **disposable** test user → assert the `profiles` row is gone (and auth user gone) + a `public.logs` `admin_user_deleted` event exists (pivot by correlation id). Use a throwaway user (global sign-out revokes shared sessions — see the e2e harness notes).
- Full regression + `scripts/preflight.sh` before any cut.

## 9. Open decisions (owner — BLOCK build until answered)

- **D1 — Role management:** is admin↔user role change in scope for EN-28, or deferred? If in scope, who may perform it?
- **D2 — Soft-disable vs hard-delete vs both** (see R4). Recommendation: disable-first + explicit hard-delete.
- **D3 — Notify the affected user on delete/disable?** Recommendation: no email in v1.
- **D4 — Retention:** on hard delete, is any anonymized record kept (for abuse/audit), or is erasure total? (GDPR framing.)

## 10. Reuse map

| Need | Reuse |
|---|---|
| Find/select target user | `useUserAccess.ts` search + `UserAccessPanel` picklist |
| Confirm destructive action | `ConfirmationModal` (`isDestructive={true}`) |
| Delete a user's data | `_shared/deleteUserData.ts` (pure core, unchanged) |
| Delete auth user | `auth.admin.deleteUser()` (service-role, as in `delete-account`) |
| Admin gate | `public.is_admin()` + server-side JWT re-check |
| Audit | `src/lib/logger.ts` + `public.logs` (correlation IDs) |

## 11. Risks / non-goals

- **Irreversible.** Hard-deleting live users is unrecoverable → disable-first recommended; live action operator-gated + staging-first.
- **Shared prod DB.** The target project is the shared prod DB; test with disposable users only.
- **Not** a billing/subscription manager; **not** bulk moderation (future).
