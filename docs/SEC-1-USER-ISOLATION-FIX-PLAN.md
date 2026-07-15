# SEC-1 — Cross-User Data Isolation Fix Plan

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/SEC-1-USER-ISOLATION-FIX-PLAN.md
**Description:** Requirements + design + work-package plan to fix cross-user data bleed on a shared device (SEC-1). Server-side (Supabase RLS) is verified isolated; this plan fixes the client-side device-storage leak. Awaiting owner approval before any coding (AGENTS §3).
**Author:** Lane B (with assistant)
**Created:** 2026-07-15
**Last Updated:** 2026-07-15
**Last Updated By:** Lane B (with assistant)

---

## 1. Problem (verified)

On a shared device, logging out of user A and logging in as user B leaks A's client-side
state, making B's app look like A's profile. **Server-side is NOT the problem** — Supabase RLS
is ON for all 17 public tables and scoped to `auth.uid()` (verified live via `pg_policies`).

**Root cause:** durable client stores use fixed **device-global** keys and **logout clears none of
them** (`handleLogout` clears React state + the Supabase session only).

| Store | Key | Scoped? | Cleared on logout? | Severity |
|---|---|---|---|---|
| Path selection | `paths:selection` | ❌ global | ❌ | privacy (the "same profile" symptom) |
| Offline write queue | `sync:queue` | ❌ global | ❌ | data-integrity + on-device privacy |
| Missions (offline) | `missions:log:local` | ❌ global | ❌ | privacy |
| Settings prefs | `is_sound_enabled`, `playback_speed`, `global_voice_limit`, `offline_save_audio`, `offline_cache_limit_bytes` | ❌ global | ❌ | privacy |
| Lessons cache | `active_lessons_month_*` | ❌ global | ❌ | privacy |
| Theme | `fm_theme` | ❌ global | ❌ | cosmetic |
| TTS audio blobs | `tts:*` | ❌ global | ❌ | privacy (low — shared content) |
| Onboarding ✅ | `onboarding:record:${userId}` | ✅ | n/a | correct |
| Streak freeze ✅ | `home:streak-freeze:${userId}` | ✅ | n/a | correct |

Also: `fetchProfile` → `getPrefsForNewProfile()` seeds a brand-new user's DB profile with A's
device prefs from localStorage.

## 2. Requirements (for owner approval)

- **R1** — No user's durable client state (path, settings, missions, lessons, offline queue) is
  ever readable or usable by a different user on the same device, **even without a clean logout**
  (crash, second tab, killed process).
- **R2** — Logout leaves no user-associated client state behind for the next user.
- **R3** — A user's own unsynced offline writes (`sync:queue`) are **never lost** by the fix and
  **never** drain under a different user's session.
- **R4** — A brand-new profile is seeded with app defaults, not the previous user's device prefs.
- **R5** — Regression coverage proves login-A → logout → login-B shows none of A's state.
- **R6** — No Supabase schema change (server is already isolated). No DB writes by this stream.
- **Non-goal** — audio-blob cache clearing is out of scope here (see §5 WP4 — coordinate with EN-8).

## 3. Design decision (recommended): namespace + clear (belt-and-suspenders)

1. **Namespace** user-private durable stores by `userId` → satisfies R1 even without clean logout.
2. **Clear** device-global, non-namespaced prefs on logout → satisfies R2 for the remainder.
3. **Guard** the sync-queue drain by `payload.user_id === session user` → satisfies R3 defensively
   (RLS already rejects cross-user writes; this prevents queue-stall + on-device exposure).

Rationale: namespacing alone protects against the no-clean-logout case; clearing alone doesn't.
Together they close both. Theme (`fm_theme`) is treated as a device-level cosmetic — **keep** (not
user-private); flag for owner if you'd prefer it cleared too.

## 4. Conflict map (checked 2026-07-15)

- **CONFLICT — do NOT touch:** `src/lib/audioCache.ts`, `src/platform/web/storage.web.ts` — the other
  agent's **EN-8 plan** actively restructures these (new `audioKey.ts`, pinned blob tier, DB_VERSION
  2→3). Audio clearing is deferred (WP4) and coordinated.
- **Other-agent file, no active WIP — reserve + coordinate:** `src/lib/sync-queue.ts` (their LT9/LT10
  work is committed; nothing in flight).
- **Conflict-free (this stream owns):** `src/paths/index.ts`, `src/features/practice/missions/missionsStore.ts`,
  `src/features/learning/useLessons.ts`, `src/features/auth/useAuth.ts`, `src/App.tsx`,
  `src/features/settings/useSettings.ts`, `src/hooks/useTheme.ts`.
- No active `queuectl` locks by other agents on any target; no uncommitted WIP in other worktrees on these files.

## 5. Work packages

| WP | Scope | Files | Depends on | Verification |
|---|---|---|---|---|
| **WP1** | Namespace user-private durable keys by userId | `paths/index.ts`, `missions/missionsStore.ts`, `learning/useLessons.ts` | — | unit: keys include userId; load reads only current user's key |
| **WP2** | Clear device-global prefs + fix new-profile seeding on logout | `auth/useAuth.ts`, `App.tsx`, `settings/useSettings.ts` | — | unit: logout clears listed keys; new profile uses defaults |
| **WP3** | Namespace `sync:queue` by userId + guard drain on `payload.user_id` | `lib/sync-queue.ts` | — | unit: cross-user entry skipped, not dropped; per-user queue key |
| **WP4** | Audio-cache-on-logout decision | (none — coordination) | EN-8 | flag to EN-8 owner; tracked, no code here |
| **WP5** | Isolation regression test | new e2e + unit | WP1–WP3 | login-A→set state→logout→login-B asserts no bleed |

WP1, WP2, WP3 are independent (disjoint files) and can proceed in parallel. WP5 depends on all three.
Each WP ships its own tests and the full gate (eslint + tsc + vitest + e2e) runs before any release
(AGENTS §3). Path-form commits; no `Co-Authored-By`.

### WP5 test note
Global-setup mints one throwaway user + an admin per run. A true two-user e2e needs a second
throwaway user (extend the fixture) or an admin+user pair. If a clean two-non-admin-user e2e isn't
feasible, cover the keying + logout-clear deterministically at the unit level and assert the
single-user logout-clear in e2e.

## 6. Out of scope / hand-offs

- **DB-agent:** the two RLS symmetry gaps (`video_suggestions` owner-UPDATE, `lesson_corrections`
  owner-DELETE) — not data-leak, low priority, a new migration (never amend existing).
- **EN-8 owner:** decide whether pinned/cached TTS audio should clear on logout (likely no — shared
  content, re-download cost). WP4 tracks this.

## 7. Rollout

Nothing ships until WP1–WP3 + WP5 are green under full regression. The held TB-11b release (.4) and
this fix will be sequenced per owner (ship .4 first, or fold together) — owner's call at approval.
