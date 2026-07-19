# TB-1 — Proficiency Level (Placement) Requirements & Design

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/TB-1-PROFICIENCY-LEVEL-REQUIREMENTS.md
**Description:** Requirements + design spec for TB-1 (Option B): persist the learner's proficiency/practical level from onboarding placement to the DB, show it on Home, and let the learner change it in Settings — as a field wholly separate from the paywall `unlocked_level`. Produced for owner approval before any coding (AGENTS §3 requirements+approval gate). No code in this pass.
**Author:** Libor Ballaty
**Created:** 2026-07-15
**Last Updated:** 2026-07-15
**Last Updated By:** Libor Ballaty

---

## 1. Problem statement (the conflation bug)

Reporter (dancingtoothbrush): *"It says I'm Absolute Beginner even though I said I could have a simple conversation, but I can't seem to change it."*

Three confirmed defects, all code-read:

1. **Placement never reaches the DB.** Onboarding `complete()` persists the chosen placement (`placementLevel` 0/1/2) **only to `platform.storage`** (`src/features/onboarding/useOnboarding.ts:216-244`, `OnboardingRecord` at `:33-40`). The onboarding `profiles.update` (`useOnboarding.ts:189-195`, inside `persistConsent`) writes **only** `has_accepted_terms` + `has_accepted_ai_usage` — it never writes any level.

2. **Home reads the wrong field.** The Home greeting label is `getLevelName(profile?.unlocked_level || 1)` (`src/features/home/HomeView.tsx:151`). `unlocked_level` is the **paywall/access-key** field ("Enter your access key to unlock Month N+1", `HomeView.tsx:358`), unset for a fresh user → defaults to `1` → always renders **"Absolute Beginner"**, regardless of placement. Home never reads placement at all.

3. **No way to change it.** There is no post-onboarding self-service control for the learner's level. The only level control on Home is the access-key **unlock modal** (`HomeView.tsx:328-407`), which is paywall-gated, not a proficiency setting.

Net effect: the placement answer is collected, mirrored to local storage, and then silently dropped from every DB write and every user-visible surface — and the only "level" the user sees is a paywall field they cannot move without an access key.

**Secondary observation (scale mismatch, must be handled in design).** Placement uses `PracticalLevel = 0..5` (`src/content/schema.ts:22-23`; placement options map to `0/1/2` in `OnboardingFlow.tsx:66-68`). `getLevelName` on Home uses a **different 1..8 scale** (`HomeView.tsx:26-38`). These two scales are not interchangeable; the label mapping must be defined explicitly for the new field (see §5).

---

## 2. Decision + the separation invariant

**★ Owner decision (2026-07-15) — Option B.** The user's **proficiency / practical level** and the **paywall access level (`unlocked_level`)** are **two completely separate, unrelated concepts.** One must **never** influence the other. Option A (placement writes `unlocked_level`) is **explicitly rejected**: a free onboarding placement answer must NEVER unlock paid content.

### SEPARATION INVARIANT (the spine of this spec)

> **`proficiency_level` ⟂ `unlocked_level`.** They are independent. No code path may derive, copy, clamp, cap, or gate one from the other. Changing proficiency must produce **zero** change to `unlocked_level`, and unlocking a level must produce **zero** change to `proficiency_level`.

| Field | Governs | Set by | Never influenced by |
| --- | --- | --- | --- |
| **`proficiency_level`** (NEW) | The learner's self-described practical ability. Drives the Home greeting label and (optionally, future) content difficulty defaults. Free to change any time. | Onboarding placement; the Settings "Your level" control. | `unlocked_level`, access keys, payment. |
| **`unlocked_level`** (EXISTING, UNCHANGED) | Paywall / content-access gate — which months/lessons the learner may open. | Access-key redemption (`handleUnlockLevel`, Home unlock modal). | `proficiency_level`, onboarding placement. |

This resolves the conflation: Home stops reading the paywall field for the greeting; placement gets a home of its own; the paywall keeps behaving exactly as today.

---

## 3. Requirements

- **R1 — Proficiency persisted to the DB from placement.** On onboarding finish, the chosen placement level (`PracticalLevel` 0/1/2) is written to a new `profiles.proficiency_level` column (DB source of truth), in addition to the existing local mirror. A write failure is logged through the canonical logger with correlation IDs and does not re-gate the learner (matches the existing best-effort discipline in `useOnboarding.complete()` / `persistConsent`).

- **R2 — Home label reads proficiency, not `unlocked_level`.** The Home greeting level label is derived from `profile.proficiency_level` (via a proficiency→name mapping), NOT from `unlocked_level`. When `proficiency_level` is null (never placed / pre-existing user with no mirror), Home shows a neutral, honest fallback (e.g. "Student" / no level claim) — it must not fabricate "Absolute Beginner".

- **R3 — Self-service "change my level" control in Settings.** Settings exposes a "Your level" control that reads the current `proficiency_level` and lets the learner set it to any valid value. Persists to `profiles.proficiency_level` (DB) + the local mirror. **No paywall, no access key.** This is the "can't change it" half of the report.

- **R4 — `unlocked_level` behavior UNCHANGED.** The access-key unlock modal, `handleUnlockLevel`, and every gate that reads `unlocked_level` behave byte-for-byte as today. This work adds a field; it does not touch the paywall.

- **R5 — The invariant is testable.** There must be automated coverage asserting that changing `proficiency_level` leaves `unlocked_level` unchanged, and vice versa (see §8). "Separate" is a claim; the test is the proof.

- **R6 — Value domain is explicit and validated.** `proficiency_level` values are constrained to the placement domain (0/1/2 today; column allows the full `PracticalLevel` 0..5 range for forward use). Reads tolerate null and out-of-range values by falling back to the neutral state (never crash, never mislabel).

- **R7 — No new source-of-truth split for proficiency.** The DB column is authoritative; the local `OnboardingRecord.placementLevel` mirror is retained only as an offline/instant-read convenience and a backfill source (§6), consistent with the documented persistence-seam pattern already in `useOnboarding.ts`.

---

## 4. Data-model / migration design

**New column on `public.profiles`:**

- Name: `proficiency_level`
- Type: `smallint`
- Nullability: **nullable** (null = "not yet placed" — the honest neutral state; also the backfill default for existing rows, see §6)
- Values: `0`, `1`, `2` written from placement today; the underlying `PracticalLevel` domain is `0..5` (`src/content/schema.ts:22`), so the column is not artificially capped at 2 — it is extensible.
- **Extensibility note:** the field is intentionally a small integer so it can later carry a richer proficiency scale (e.g. a CEFR band A1..C2 mapped to integers, or a widened practical scale) without a type change. The label mapping (§5) is the only thing that would grow.
- **Default:** column default `NULL` (do NOT default to 0 — that would fabricate "complete beginner" for users who never placed; §6).

**Additive + idempotent**, matching the house style of `00011_profiles_consent_and_activity_columns.sql`:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS proficiency_level smallint;
```

RLS: `proficiency_level` is owner-writable under the existing profiles self-update policy (same policy that already lets a user write `has_accepted_terms` etc. via `.eq('id', user.id)`). Confirm no separate grant is needed against the **live** schema before writing the migration (two-pass verification: cloud-dev-restored first, then local).

**No change to `unlocked_level`** — its column, type, default, and RLS are untouched.

### ⚠ Migration-number coordination (do NOT pick a number here)

The latest committed migration is `00011`. **EN-8 already claims `00012`** (`plans/plan-2026-07-15-en8-hosted-audio.yaml` — bucket + pg_cron). This spec therefore does **not** assign a number. Before building, the DB/EN-8 agent must allocate the next free number for this migration and confirm ordering (this proficiency migration is independent of EN-8's bucket work, so either order is safe, but the number must be coordinated to avoid a collision).

---

## 5. Component wiring (specific files / functions)

1. **Type** — `src/types.ts` `UserProfile` (around `:49-67`): add `proficiency_level?: number | null` (mirrors the existing optional consent flags).

2. **Onboarding write** — `src/features/onboarding/useOnboarding.ts`:
   - `complete()` (`:216-244`) already receives `result.placementLevel`. Extend the DB write so placement is persisted to `proficiency_level`. Cleanest placement: fold it into the existing `profiles.update(...)` in `persistConsent` (`:189-195`) so onboarding still does a **single** profiles write, adding `proficiency_level: result.placementLevel` alongside the two consent flags — and mirror it onto the optimistic `setProfile(...)` at `:180-186`. (Alternative: a dedicated `persistProficiency` writer; single-write is preferred to avoid a second round-trip.)
   - Keep the existing local mirror (`OnboardingRecord`, `:218-229`) as-is.
   - No change to the placement UI: `OnboardingFlow.tsx:285-286` already passes `placementLevel: placement?.level ?? 0`.

3. **Home read** — `src/features/home/HomeView.tsx:151`: change the label source from `getLevelName(profile?.unlocked_level || 1)` to a proficiency label derived from `profile?.proficiency_level`.
   - Add a **proficiency→name mapping** (distinct from the paywall `getLevelName` 1..8 map at `:26-38`, which stays for the unlock modal). Suggested mapping for the placement domain: `0 → "Complete beginner"`, `1 → "A few words"`, `2 → "Basic conversation"` (mirrors the placement option labels in `OnboardingFlow.tsx:66-68`), and `null → "Student"` (neutral fallback, R2). Owner to confirm the exact display strings.
   - If a derivation helper is warranted, put it beside `useHome` (or a small `src/features/home` util); `useHome.ts` is the natural home for the derivation so `HomeView` stays a pure presenter (consistent with the file's stated role). The paywall `getLevelName` and the unlock modal are untouched.

4. **Settings control** — `src/features/settings/SettingsView.tsx` (+ `useSettings.ts`): add a "Your level" section (sibling to the existing "Learning Path" block at `:218`). It reads `profile.proficiency_level` and offers the placement choices; selecting one calls a persist action that updates `profiles.proficiency_level` (DB) + local mirror + `setProfile`. Reuse the existing selectable-list-card pattern already used for the path/goal chooser (`data-testid` convention like `path-switcher` / `goal-track-chooser` → add e.g. `proficiency-chooser`). No access-key input; no `unlocked_level` reference in this control.

5. **Persist path for Settings.** Prefer a small shared writer so onboarding and Settings both persist proficiency the same way (single source of write logic, correlation-ID logging, optimistic `setProfile`). Candidate: a `setProficiencyLevel(level)` helper co-located with the profile/auth layer that both `useOnboarding` and `useSettings` call. Owner/architecture call at build time; the requirement is one write path, not two divergent ones.

---

## 6. Migration / backfill for existing users

Existing rows get `proficiency_level = NULL` by column default (no fabricated value).

- **Client-side self-heal (preferred, no data migration guesswork):** on Home/profile load, if `proficiency_level` is null AND the local `OnboardingRecord.placementLevel` mirror exists for this user, write the mirrored placement to the DB once (a heal effect analogous to the existing consent heal in `useOnboarding.ts:155-173`). This recovers placement for already-onboarded users on this device without a server-side backfill.
- **No local mirror (new device / cleared storage):** leave `proficiency_level` null; Home shows the neutral "Student" fallback (R2). Optionally, Settings surfaces a gentle "set your level" affordance so the user can self-place. Do **not** infer proficiency from `unlocked_level` (that would violate the invariant).
- **No server-side backfill from `unlocked_level`.** Explicitly forbidden by §2.

Owner decision needed: whether to also show a one-time "confirm your level" prompt to null-proficiency returning users, or rely purely on the Settings control. Recommendation: rely on Settings + the null fallback (lowest-friction, invariant-safe); a prompt is a nice-to-have.

---

## 7. Non-goals

- Does **not** touch the paywall, access keys, `handleUnlockLevel`, or the unlock modal.
- Does **not** change any content-access gating (which months/lessons are openable stays governed solely by `unlocked_level`).
- Does **not** change the placement UI, the onboarding step order, or consent handling.
- Does **not** introduce a CEFR scale now — the column is merely left extensible (§4).
- Does **not** auto-adjust content difficulty from proficiency in this scope (future enhancement; requires its own requirements).

---

## 8. Test plan

**Unit (vitest):**
- `useOnboarding` — `complete()` writes `proficiency_level` = the placement level to the profiles update (extend `src/features/onboarding/__tests__/useOnboarding.test.ts`; a fixture already carries `placementLevel: 2`).
- Home label derivation — `proficiency_level` 0/1/2 → correct display strings; `null`/out-of-range → neutral "Student" fallback (R2, R6).
- Settings persist — the "Your level" action writes `proficiency_level` and mirrors onto `setProfile`; does not reference `unlocked_level`.
- **Invariant unit (R5):** a proficiency write asserts the same profiles update contains **no** `unlocked_level` key; a mocked `unlocked_level` change asserts `proficiency_level` is untouched.
- Backfill heal — null `proficiency_level` + local placement mirror → one heal write; no mirror → stays null, no write (mirror the consent-heal test shape).

**E2E (Playwright — owner explicitly asked for this):**
- New `tests/e2e/user/` spec, e.g. `NN-proficiency-level.spec.ts` (number TBD against the current suite):
  1. Complete onboarding choosing **"Basic conversation"** (placement level 2).
  2. Assert Home greeting shows the **matching** proficiency label (the level-2 string) — NOT "Absolute Beginner".
  3. Open Settings → "Your level", change it (e.g. to "A few words"), return to Home.
  4. Assert Home reflects the new level and it **persists** across reload.
  5. **Invariant assertion:** capture `unlocked_level` (or the paywall "Month N" / unlock-modal copy that reflects it) before and after the proficiency change; assert it is **unchanged**. Changing proficiency must not move the paywall.
- Regression: the existing access-key unlock flow still unlocks `unlocked_level` and does not alter `proficiency_level`.

Full gate before any promotion: eslint/tsc/vitest + e2e (per the test-every-change + regression memory note and AGENTS §3).

---

## 9. Coordination / rollout

- **DB agent owns the migration.** Allocate the next free migration number in coordination with EN-8 (which holds `00012`); this spec deliberately does not pick one (§4). Apply via the standard migration path; verify against the live schema (two-pass: cloud-dev-restored → local).
- **Lane coordination on shared files:**
  - `src/features/settings/SettingsView.tsx` is **Lane-B-adjacent** — it already carries Lane A's goal chooser and Lane B's TB-11b deep-link (`focusGoalChooser`, `data-testid` path-switcher/goal-track-chooser). **Reserve + sequence** before editing (shared-file-coordination + repo write policy).
  - `src/App.tsx` may need a thread-through for a shared proficiency writer and is **Lane-B live for SEC-1** — reserve/sequence if touched.
  - `src/features/onboarding/useOnboarding.ts`, `src/features/home/HomeView.tsx`, `src/features/home/useHome.ts`, `src/types.ts` are **currently conflict-free** per the tracker.
- **Sequence:** (1) migration lands + verified live → (2) `types.ts` + onboarding/Home read-write (conflict-free files) → (3) Settings control (reserve SettingsView) → (4) tests → (5) full regression gate → (6) promotion `develop`→`main` + web deploy.
- **Gate:** this doc → **owner approval** → build → e2e verified (AGENTS §3). Branch: `develop`.

---

## 10. Open questions for the owner

1. Exact display strings for the three proficiency labels and the null fallback (§5 proposes placement-option wording + "Student").
2. Backfill: rely on Settings + null fallback only, or add a one-time "confirm your level" prompt for null-proficiency returning users? (Recommendation: Settings + fallback.)
3. Should proficiency ever influence default content difficulty later? (Out of scope now; flag if the column shape should anticipate it — current `smallint` already does.)

---

## 11. TB-1a (split out 2026-07-19): the platform must ACT per proficiency

**★ Owner decision (2026-07-19):** **TB-1 = fix the whole conflation now (Option B, §1–§10) — APPROVED to build.** Separately, a NEW item **TB-1a** captures making the platform *actually behave* according to the proficiency setting — starting the curriculum at the right point and (future) adapting difficulty — tracked as its own entry in `docs/TESTER-FEEDBACK-TRACKER.md`. This grew from a second observation on the `.18.4` staging verify ("*it makes no difference what proficiency level I choose as to where the system wants to start my learning — so what's the point*"). Option B (§1–§10) is TB-1a's required **substrate** (the `proficiency_level` field + Settings control); the design below is the seed for TB-1a's own requirements pass.

### R8 — Placement drives the learning start point
On first entry after onboarding, the learner's starting position in their active path is derived from `proficiency_level` (not always month 1 / day 1). Changing proficiency in Settings updates the recommended start going forward.

### The paywall is a separate CHECK — it must NOT drive the flow (owner 2026-07-19)
The §2 separation invariant holds: `proficiency_level ⟂ unlocked_level`. **The learning FLOW is driven by proficiency** (placement sets the start point + progression). **The paywall is an independent access *check*** applied only at the moment the learner tries to open paid content — it gates that single open, but it must **not re-route, restart, clamp, or otherwise disrupt the flow.**
- Proficiency decides *where the learner flows* (start point, next lesson). The paywall never moves that.
- When the flow reaches content beyond `unlocked_level`, the paywall check surfaces the unlock prompt **at that point** — a gate on the one open, not a redirection of the whole flow.
- Orthogonal by construction: placement never mutates `unlocked_level`; `unlocked_level` never mutates the proficiency-driven start. One drives the flow, the other is a checkpoint layered on top.

### Open design questions (BLOCK build until answered)
1. **Per-path mapping.** How does `proficiency_level` 0/1/2 map to a start point in each path type — structured-course (which month/day?), adaptive-guided (initial difficulty / starting situation set?), goal-track / free (start of track / N/A)? Needs the curriculum structure to define the concrete mapping.
2. **Paywall interaction** — confirm the clamp-to-`unlocked_level` rule above (recommended) vs. an alternative.
3. **Retroactivity.** When a learner changes proficiency later in Settings, does it re-base the start point? (Recommendation: set a new *recommended* start without destroying existing progress — never move a learner backward or wipe completions.)
4. **Interaction with DF11** (session continuity / resume last position) and **EN-15** (content access) — a returning learner's *resume point* must take precedence over the placement-derived *initial* start.

### Impact on the rest of the spec
- **No new DB column** — same `proficiency_level`; the start-point is derived logic (in the path/next-action layer, e.g. `src/paths/*` + `useHome`/`usePathContext`), not stored state.
- **Testing (extends §8):** e2e must assert that a higher placement starts the learner further into the (accessible) curriculum, AND that it never unlocks paid content (paywall/`unlocked_level` unchanged) — the invariant assertion widens to cover the start point, not just the label.
- **Status:** **TB-1 (Option B, §1–§10) — SHIPPED** (merged to develop `6808b02`, migration 00015 live, 2026.07.19.1). **TB-1a (this §11) — NEEDS REQUIREMENTS/DESIGN**: the per-path start-point mapping + paywall-clamp rule (Q1/Q2) must be specified and owner-approved before build. **Sequence:** TB-1 first (its `proficiency_level` field is TB-1a's substrate — now shipped), then TB-1a.
