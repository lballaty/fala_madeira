# EN-15 — Content Access: honor `unlimited`/`admin` bypass (grant-all-levels)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/EN-15-CONTENT-ACCESS-BYPASS-REQUIREMENTS.md
**Description:** Requirements + design for Option B of the "how does an admin grant a user all training levels?" question — make content-access gating honor a `role==='admin'` / `subscription_tier==='unlimited'` full-access bypass (mirroring the existing voice-limit bypass), so granting all levels = setting a user's tier to `unlimited` (admins get it automatically). For owner approval before any coding (AGENTS §3).
**Author:** Libor Ballaty
**Created:** 2026-07-15
**Last Updated:** 2026-07-15
**Last Updated By:** Libor Ballaty

---

## 1. Problem

Content access gates purely on `profiles.unlocked_level`, which advances **+1 per shared access-key entry** (`useLessons.ts:203 handleUnlockLevel` → `nextLevel = unlocked_level + 1`; the key lives in `global_settings.level_unlock_key`). New profiles start at `unlocked_level = 1`.

`subscription_tier` (`'free' | 'premium' | 'unlimited'`, `src/types.ts:62`) exists and **bypasses the voice limit** (`useTutorSession.ts:249`: `usage >= limit && subscription_tier !== 'unlimited' && role !== 'admin'`) — but it does **NOT** bypass content access. So an `unlimited` subscriber, and even an admin, still cannot reach all content without climbing level-by-level via keys. There is also **no admin UI** to grant access; the only current way is a manual `UPDATE profiles SET unlocked_level = 8` in the DB.

## 2. Decision (owner, 2026-07-15) — Option B

Make content gating honor a full-access bypass for `role === 'admin'` OR `subscription_tier === 'unlimited'`, exactly mirroring the voice-limit pattern. Then **"grant all levels" = set the user's `subscription_tier` to `'unlimited'`** (and admins get full access automatically). `unlocked_level` stays the paywall progression for `free`/`premium` users, unchanged.

## 3. Requirements

- **R1 — one shared predicate.** `hasFullContentAccess(profile) = profile?.role === 'admin' || profile?.subscription_tier === 'unlimited'`.
- **R2 — effective level helper.** `effectiveUnlockedLevel(profile) = hasFullContentAccess(profile) ? MAX_LEVEL : (profile?.unlocked_level || 1)`, where `MAX_LEVEL` is the max **authored** month/level (see §5 — do NOT hardcode `8` if content differs).
- **R3 — all content gates route through it.** Every content-access read of `unlocked_level` uses `effectiveUnlockedLevel` (or short-circuits on `hasFullContentAccess`). Known read sites to audit + convert: `HomeView.tsx:151` (label — but see TB-1: the label should move to proficiency), `:272`/`:277` (current lesson/day), `:358` (unlock CTA copy); `useLessons.ts:258` (custom-lesson level). Implementer must grep for all `unlocked_level` reads and confirm none are missed.
- **R4 — unlock UI hidden for full-access.** The access-key unlock modal / "unlock Month N+1" CTA is hidden or no-ops when `hasFullContentAccess` (nothing to unlock). `handleUnlockLevel` and the key flow are unchanged for `free`/`premium`.
- **R5 — reuse, don't fork the predicate.** The voice-limit check (`useTutorSession.ts:249`) already encodes the same `admin`/`unlimited` idea inline. Define the shared predicate once; **adopting it inside the voice-limit check is a follow-up cleanup** (do NOT edit `useTutorSession.ts` in this scope — it is Lane B's active EN-8 file; see §6).
- **R6 — testable.** A user with tier `unlimited` and an `admin` can open any month/level; a `free` user is still gated at `unlocked_level`.
- **R7 — no schema change.** `subscription_tier` + `role` already exist; RLS already lets an admin UPDATE any profile row (`00001_initial_schema.sql:121`). No migration.

## 4. Admin control to set a user's access — DECIDED: BUNDLE it (owner, 2026-07-15)

Option B (§2) delivers the *bypass* (admin/unlimited users skip the content gate). This feature ALSO ships a **thin admin control** so an admin can grant access in-app instead of editing the DB.

- **AC1 — user lookup.** In `AdminView`, an admin can find a user by **email** (query `profiles`; admin SELECT on any profile is already allowed by RLS `00001:119`).
- **AC2 — set tier.** The control sets the selected user's `subscription_tier` (`free` / `premium` / `unlimited`) via `supabase.from('profiles').update({ subscription_tier }).eq('id', targetId)` — RLS `00001:121` already permits an admin to UPDATE any profile row, so **no service-role key is needed**; the client admin call is authorized.
- **AC3 — (optional) set level.** The same control MAY also set `unlocked_level` directly (e.g. a numeric input or "grant all"), for granular grants without changing tier. Owner to confirm whether tier-only is enough or both are wanted.
- **AC4 — audit + confirm.** Each grant writes a structured `public.logs` event (who granted what to whom, correlation IDs) and shows a confirm + toast. Never a silent privilege change.
- **AC5 — safety.** The control is inside the `role==='admin'` gate (RLS is the real enforcement); it does not expose tier-setting to non-admins.

Net admin flow: open the control → find user by email → set tier to `unlimited` (or set level) → the §2 bypass grants that user all content. Stripe webhook (`config.ts:362-363`) remains the automated tier source for paying users; this is the manual admin override.

## 5. `MAX_LEVEL`

`getLevelName` (`HomeView.tsx:26-38`) tops at **8** ("Proficient"). Confirm the max authored month/level (e.g. `learningPlan.length` / max `lessons.level`) and derive `MAX_LEVEL` from content or a single config constant — so the bypass grants ALL authored content, present and future, not a stale literal.

## 6. Files & coordination (checked vs Lane B live scope)

- **NEW** `src/lib/access.ts` — `hasFullContentAccess` + `effectiveUnlockedLevel` (+ unit tests). Conflict-free.
- `src/features/home/HomeView.tsx`, `src/features/learning/useLessons.ts`, `src/features/learning/LearningView.tsx` — route gate reads through the helper + hide the unlock CTA for full-access. **Currently conflict-free** vs Lane B (SEC-1 WPs + EN-8 audio stack do not touch these).
- **Admin control (§4):** `src/features/admin/AdminView.tsx` + a new admin component (e.g. `UserAccessPanel.tsx`) + a hook writing `profiles.subscription_tier`/`unlocked_level` for a looked-up user. The admin surface (`AdminView`, `useAdminQueues`) is **conflict-free** vs Lane B. Reuses the existing admin gating + toast/confirm + logger conventions.
- **DO NOT TOUCH** `src/features/tutor/useTutorSession.ts` — Lane B's active EN-8 file (key normalization). The voice-limit-check unification (R5) is deferred to a coordinated follow-up.
- Interacts with **TB-1**: TB-1 moves the Home *label* to `proficiency_level`; EN-15 governs *access*. They are complementary and both leave `unlocked_level` as the paywall — sequence so the Home label change (TB-1) and the gate change (EN-15) don't both rewrite the same HomeView lines without coordination.

## 7. Test plan

- **Unit:** `hasFullContentAccess` truth table (admin / unlimited / premium / free / null); `effectiveUnlockedLevel` returns `MAX_LEVEL` for admin+unlimited, `unlocked_level` otherwise.
- **E2E:** an `unlimited` (or `admin`) user can open a high month a `free` user cannot; the unlock CTA is absent for full-access users; the access-key flow still works for a `free` user.
- Full gate (eslint/tsc/vitest + e2e) before promotion.

## 8. Non-goals

- No tier-setting UI in this scope (that's companion option (b)).
- No change to the paywall progression for `free`/`premium`.
- No proficiency-level work (that's TB-1) — though both touch HomeView, coordinate.

## 9. Open questions for the owner

1. ~~Companion path~~ **RESOLVED (owner 2026-07-15): bundle the thin admin control (§4).**
2. Admin control (AC3): tier-only, or also allow setting `unlocked_level` directly ("grant all" / numeric)?
3. `MAX_LEVEL` source — derive from content (`learningPlan`/`lessons`) or a config constant?
4. Should `premium` get any content bypass, or only `unlimited` + `admin`? (Spec assumes only `unlimited`+`admin`, matching the voice-limit rule.)
