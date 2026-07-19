# EN-25 — Consolidated Admin Surface (single nav entry)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-25-ADMIN-CONSOLIDATION-REQUIREMENTS.md
**Description:** Canonical reference for the EN-25 admin consolidation — one nav entry point that reaches every admin function. Absorbs EN-11 (per-user voice limit). Built on feat/en25-admin-consolidation; ready for staging (not yet merged/deployed).
**Author:** Claude (with owner)
**Created:** 2026-07-16
**Last Updated:** 2026-07-16
**Last Updated By:** EN-25 autonomous execution

---

## 1. Problem
Two confusing admin entry points existed — the sidebar "Admin" link (`AdminView` overlay) and a separate "Admin Mode" toggle (legacy floating `AdminPanel`) — and some controls (the global voice limit) had **no navigation** to them, living inside `SettingsView` behind the admin-mode toggle. There was also **no per-user voice-limit control** anywhere (EN-11 gap).

## 2. Outcome (owner-approved 2026-07-16)
**One entry point** — the sidebar nav "Admin" link — opens `AdminView`, which now hosts **four tabs**:

| Tab | Function |
|-----|----------|
| Review Queues | lesson_corrections / lesson_requests / tickets / **video_suggestions** moderation |
| Content Studio | author/validate/publish Situations/Tracks/Packs |
| User Access | grant `subscription_tier` + `unlocked_level` **+ per-user `voice_limit`** (EN-11) |
| **Config** *(new)* | **global** voice limit (`global_settings.voice_limit`) |

## 3. What changed
- **New Config tab** (`AdminConfigPanel`, `data-testid="admin-tab-config"` / `admin-voice-limit-global`) — the global voice-limit stepper moved here from `SettingsView`.
- **Per-user voice limit** (`data-testid="user-access-voice-limit"`) added to `UserAccessPanel`; `useUserAccess.grantAccess(tier, unlockedLevel, voiceLimit)` writes `profiles.voice_limit` (blank clears to `NULL` = fall back to the global default). Enforcement already reads `profile.voice_limit ?? globalVoiceLimit` on both client and the `ai-gateway` edge.
- **Retired** the legacy `AdminPanel` + the `isAdminMode` toggle and all its wiring (App / SettingsView / useSettings). Video moderation was already duplicated in Review Queues, so nothing is lost.
- **Kept** the TB-8 read-only "Daily voice limit" display for all users (`data-testid="voice-limit-value"`).

## 4. Tests (coverage-gate enforced)
- Unit: `useUserAccess.voice-limit.test.ts` — writes + clears `voice_limit`.
- e2e (admin session, live DB): `12-admin-single-entry.spec.ts` — single nav reaches all four tabs, per-user `voice_limit` persists to `profiles`; `01`/`02` rerouted off the removed toggle to the Config tab. 4/4 green.

## 5. Status
**SHIPPED to production 2026.07.17.1** (merged to develop `3371fb0`, deployed). _History:_ built + fully gated on `feat/en25-admin-consolidation` (tsc/eslint/276 vitest/build/observability/cors/coverage-gate + admin e2e all green) before the develop merge + staging deploy.
