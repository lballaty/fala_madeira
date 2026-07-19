# TB-1a — Proficiency-Driven Behavior Requirements & Design

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/TB-1a-PROFICIENCY-BEHAVIOR-REQUIREMENTS.md
**Description:** Requirements + design for TB-1a: make the platform ACTUALLY BEHAVE per the learner's `proficiency_level` — placement drives WHERE the curriculum starts (and its recommendation ordering), not just the displayed label. Resolves the open questions in `docs/TB-1-PROFICIENCY-LEVEL-REQUIREMENTS.md` §11 with concrete recommended answers. The paywall (`unlocked_level`) is an orthogonal CHECK at the point of open and must never drive/re-route/restart the flow. Produced READ-ONLY for owner approval before any coding (AGENTS §3 requirements+approval gate). No app code in this pass.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-19
**Last Updated:** 2026-07-19
**Last Updated By:** Libor Ballaty

---

## 0. Status & relationship to TB-1

- **TB-1 (Option B) — SHIPPED.** The `profiles.proficiency_level` column (migration `00015`, applied live 2026-07-19 — `supabase/migrations/APPLIED.md:24`), the onboarding write, the Home label, the Settings "Your level" control, and the shared `setProficiencyLevel` writer (`src/features/onboarding/proficiency.ts`) all landed. **TB-1 is TB-1a's substrate; it is complete.**
- **TB-1a — this doc.** TB-1 made proficiency *visible and editable*. TB-1a makes it *behave*: the learner's starting position in their active path (and the recommendation ordering) is derived from `proficiency_level`, within the bounds of what they can already access.
- **Tracker:** `docs/TESTER-FEEDBACK-TRACKER.md` TB-1a (currently `OPEN — NEEDS REQUIREMENTS/DESIGN`). This doc is that requirements/design pass.

---

## 1. Problem statement (the "so what's the point" bug)

Reporter (owner, `.18.4` staging verify): *"it makes no difference what proficiency level I choose as to where the system wants to start my learning — so what's the point."*

**Root cause, code-read.** `proficiency_level` is persisted and displayed, but it is **never threaded into the path-recommendation layer**:

1. **The path context hard-codes placement to `1`.** `App.tsx:178` calls `usePathContext({ supabase, user })` with **no** `placementLevel` argument. `usePathContext.ts:96` therefore falls back to `placementLevel: placementLevel ?? 1`. So every learner's `PathContext.placementLevel` is a constant `1`, regardless of their real `profiles.proficiency_level`.
2. **Only one path even consumes placement, and it is fed the constant.** `adaptive-guided.ts:72` scores situations by nearness to placement: `score += Math.max(0, 2 - Math.abs(situation.level - context.placementLevel))`. Because placement is always `1`, this term is identical for everyone — the intended "start near your level" bias never varies.
3. **Structured Course ignores placement entirely.** `structured-course.ts:60-85` `next()` computes the next day purely from the persisted cursor (`selection.structuredMonth/Day`, default `1/1` — `config.ts:314-315`) and the completed set. A brand-new learner *always* starts Month 1 / Day 1 no matter what they placed.
4. **Goal Track & Free never reference placement.** `goal-track.ts` orders by `situation.level` then curation; `free.ts` is a pass-through. Neither reads placement.

Net effect: placement changes the Home *label* (TB-1) but not *where the learner lands* — exactly the reported "no difference."

**The fix is almost entirely derivation, not new state** (see §6): thread the real `proficiency_level` into `PathContext.placementLevel`, and derive the structured start month from it (bounded by access + resume). `PathContext` already carries a `placementLevel` field explicitly documented as *"a sensible starting point; never a hard gate"* (`paths/types.ts:73`). TB-1a mostly makes that field mean what it says.

---

## 2. The curriculum shape (evidence for the mappings)

Extracted from the seed pack `src/content/packs/seed-course.ts` (168 course situations = **6 months × 28 days**; `Situation.level` domain `0..5`, `PracticalLevel` — `src/content/schema.ts:22`). The `course.month` ↔ `Situation.level` correlation is near-monotonic:

| Structured month | Situation levels present (count) |
| --- | --- |
| Month 1 | L0 ×14, L1 ×14 |
| Month 2 | L1 ×11, L2 ×17 |
| Month 3 | L2 ×11, L3 ×17 |
| Month 4 | L3 ×28 |
| Month 5 | L4 ×28 |
| Month 6 | L5 ×28 |

This is the anchor for the structured mapping: proficiency (placement domain `0/1/2` today) corresponds cleanly to the early months. Placement `0` ≈ Month 1 (L0/L1), placement `1` ≈ start of Month 2 (L1/L2 boundary), placement `2` ≈ start of Month 3 (L2/L3 boundary).

**Placement domain today (`OnboardingFlow.tsx:66-68` → `proficiency.ts` / `useHome.proficiencyLabel`):** `0 = "Complete beginner"`, `1 = "A few words"`, `2 = "Basic conversation"`. The column is `smallint` and the `PracticalLevel` domain is `0..5`, so the mapping table below is defined for the full `0..5` range for forward-compatibility, even though onboarding only emits `0/1/2` today.

---

## 3. Requirements

- **R8 — Placement drives the learning start point.** On first entry after onboarding (before any progress exists), the learner's starting position in their active path is derived from `proficiency_level`, not always Month 1 / Day 1. (Restates §11 R8.)

- **R9 — Real proficiency reaches the path layer.** `PathContext.placementLevel` MUST be populated from `profiles.proficiency_level` (via the App wiring), not the hard-coded `1`. Null proficiency falls back to `0` (complete beginner — the honest, non-skipping default; see §5.4).

- **R10 — The paywall is a SEPARATE CHECK, never a flow driver.** The proficiency-derived start point and the path's `next()`/`order()` are computed **without any reference to `unlocked_level`**. The paywall check (`canAccessLevel`, `src/lib/access.ts:40`) is applied **only at the moment the learner tries to open content beyond `unlocked_level`** — it surfaces the existing unlock prompt for that single open; it does not move, clamp, restart, or re-route the flow. (See §5.3 — the central principle.)

- **R11 — The start point never unlocks paid content.** A higher placement may start the learner further into the curriculum **only within content they can already access** (`canAccessLevel === true`). Placement MUST NOT change `unlocked_level`, and the derived start MUST NOT exceed accessible content — but the *reason* it is bounded is R11's "start within accessible content" rule, **not** a paywall re-route (the distinction matters: we choose an accessible start, we don't let the paywall rewrite a chosen start). See §5.3.2 for the exact ordering.

- **R12 — Resume wins over initial placement (DF11).** For a returning learner with real progress or a persisted cursor, the resume point takes precedence over the placement-derived initial start. Placement seeds the start **only** when there is no resume signal yet. (Restates §11 Q4.)

- **R13 — Retroactive, non-destructive.** Changing proficiency later in Settings updates the *recommended* start going forward. It MUST NOT destroy progress, wipe completions, or move a learner backward past work they have already done. (Restates §11 Q3.)

- **R14 — Separation invariant preserved and widened (R5 of TB-1).** `proficiency_level ⟂ unlocked_level` holds both ways at the behavior layer too: changing proficiency leaves `unlocked_level` unchanged; unlocking a level leaves the proficiency-derived start unchanged. The invariant test widens to assert the START POINT, not just the label.

- **R15 — Pure, testable derivation.** The start-point derivation stays in the pure path layer (`src/paths/*`, deterministic on `PathContext`) or a pure helper beside it, so it is unit-testable without React/network — matching the existing "policies are pure" discipline (`paths/types.ts:9-10`, `140-145`).

---

## 4. Per-path start-point mapping (RESOLVES §11 Q1)

The start point is **path-specific**. Below, `p = effective proficiency` (= `profiles.proficiency_level`, null → `0`; see §5.4).

### 4.1 Structured Course — RECOMMENDED: proficiency → start MONTH (day 1 of that month)

Map `p` to the initial structured cursor `(month, day=1)` using the month↔level table in §2:

| `p` (proficiency) | Initial `structuredMonth` | Rationale (from §2) |
| --- | --- | --- |
| `0` Complete beginner | 1 | L0/L1 live in Month 1 — start at the very beginning. |
| `1` A few words | 2 | Month 2 opens the L1/L2 band — skip the pure-absolute-beginner Month 1. |
| `2` Basic conversation | 3 | Month 3 opens the L2/L3 band — skip the earliest two months. |
| `3` (forward) | 4 | Month 4 = L3. |
| `4` (forward) | 5 | Month 5 = L4. |
| `5` (forward) | 6 | Month 6 = L5. |

Concretely: `initialStructuredMonth(p) = clamp(p + 1, 1, 6)` — a one-line derivation that matches the empirical table exactly for `0..5`. Day is always `1` (start of the month).

**How it feeds `next()`:** `structured-course.ts:60-85` already computes the next day as the first uncompleted course situation **at/after the persisted cursor** (`cursorKey = structuredMonth*1e6 + structuredDay`). So the ONLY change needed is: **when there is no resume signal, seed the initial cursor to `(initialStructuredMonth(p), 1)` instead of `(1,1)`.** The existing at/after-cursor logic then does the rest, unchanged. This is why structured is the cleanest path to wire.

**Access note (R11):** the structured start is bounded to accessible content (§5.3.2). If `initialStructuredMonth(p)` maps to a month the learner cannot access (paywalled beyond `unlocked_level`), the start is clamped **down** to the highest accessible month — never up, never past the paywall. Since `unlocked_level` defaults to `1` for a fresh free user, this clamp is real and must be tested (a placement-2 free user starts at the top of what's free, not Month 3 if Month 3 is locked).

### 4.2 Adaptive Guided — RECOMMENDED: feed real placement into the existing scorer (no new logic)

`adaptive-guided.ts:72` already biases situation choice toward `context.placementLevel`. The ONLY change is **R9**: make `PathContext.placementLevel` carry the real `proficiency_level` instead of the constant `1`. With that single wiring fix, a placement-2 learner's recommended situation shifts toward L2 content automatically; a placement-0 learner toward L0/L1. No change to `scoreSituations` is required — it already does the right thing once fed the right input.

**Optional refinement (owner call, LOW priority):** the current term `Math.max(0, 2 - Math.abs(level - placement))` gives a symmetric window ±2 around placement. This is adequate. A stronger "don't start below placement" bias (asymmetric — penalize content well below placement more than content slightly above) is possible but is a tuning enhancement, not required for TB-1a. **Recommendation: ship the wiring fix only; defer scorer tuning.**

### 4.3 Goal Track — RECOMMENDED: order within the track by level, start at the first at/above placement

`goal-track.ts:90-92` currently picks the first uncompleted situation in `orderedTrackSituations` (ordered by `level` then curation). RECOMMENDED change: when there is no resume signal, the initial "next" is the first uncompleted track situation **whose `level >= p`** (falling back to the first uncompleted overall if none meet the bar, so a high placement in a low-level track still yields a real step). This starts a placed learner further into the track's level progression without gating — every situation stays openable (soft ordering, §5/§12).

**Bounded by access (R11):** if the level-`>= p` starting situation belongs to content beyond `unlocked_level`, apply the same clamp-to-accessible rule (§5.3.2).

### 4.4 Free / self-directed — RECOMMENDED: N/A (no start point)

`free.ts` is a pure pass-through tool posture — no ordering, no prescribed step (`next()` routes to the Practice hub browser). Placement does **not** apply. This is correct and intentional (the learner drives). **No change.** (Optional: the situation browser could pre-scroll to the placement level band, but that is an EN-level polish item, out of TB-1a scope.)

### 4.5 Summary table

| Path | Placement drives start? | Mechanism | Change size |
| --- | --- | --- | --- |
| Structured Course | **Yes** | Seed initial cursor to `(p+1, 1)` when no resume | Small (initial-cursor seed) |
| Adaptive Guided | **Yes** | Feed real `proficiency_level` into `PathContext.placementLevel` (R9) | Tiny (App wiring only) |
| Goal Track | **Yes (soft)** | First uncompleted track situation with `level >= p` | Small |
| Free | No (N/A) | Pass-through — learner drives | None |

---

## 5. The paywall-as-separate-check rule (RESOLVES §11 Q2 — CENTRAL PRINCIPLE)

> **★ Owner principle (2026-07-19):** the paywall is a SEPARATE CHECK. It gates opening paid content at the point of open, and must NEVER drive/re-route/restart the flow. The flow is proficiency-driven; the paywall is an orthogonal checkpoint. `proficiency_level ⟂ unlocked_level` holds both ways.

### 5.1 Two independent layers

| Layer | Owns | Reads | NEVER reads |
| --- | --- | --- | --- |
| **Flow (proficiency-driven)** | Where the learner starts + what `next()`/`order()` recommend | `proficiency_level`, progress, mastery, active track | `unlocked_level` |
| **Paywall (access check)** | Whether a *specific open* of content beyond `unlocked_level` is allowed | `unlocked_level`, `role`, `subscription_tier` (`canAccessLevel`) | `proficiency_level` |

The path policies (`src/paths/*`) already take **no** `unlocked_level` input — `PathContext` (`paths/types.ts:65-80`) has no paywall field. TB-1a must keep it that way: **the flow computation never sees `unlocked_level`.**

### 5.2 How the start point is chosen (flow layer, paywall-blind)

1. Determine the active path (`pathSelection.type`).
2. Compute effective proficiency `p` (§5.4).
3. If a **resume signal** exists (R12 / §5.5), the resume point IS the start — placement is not consulted.
4. Else derive the placement-based initial start per §4 (structured cursor / adaptive scorer input / goal-track first-at-level).

This entire step reads only proficiency + progress. No `unlocked_level`.

### 5.3 How the paywall layers on WITHOUT re-routing

**5.3.1 At the point of open (the ONLY paywall interaction).** When the learner taps the CTA and the flow tries to open a situation/month, the *existing* access check applies exactly as today: `canAccessLevel(profile, month)` (`src/lib/access.ts:40`; enforced in the Learning/lesson surfaces and the unlock modal on Home, `HomeView.tsx:152-161,386`). If the target is beyond `unlocked_level` (and not admin/unlimited), the learner sees the existing unlock prompt **for that open**. The flow itself is unchanged — the learner is not thrown back to Month 1, not re-placed, not restarted. This is a gate on one open, not a redirection.

**5.3.2 The accessible-start bound (R11) — a flow-layer choice, NOT a paywall re-route.** There is one subtlety: we should not *initially strand* a placed learner on a CTA that immediately hits a paywall (bad UX — "you're Basic conversation, here's Month 3, now pay"). So the flow layer, when seeding the placement start, chooses the **highest accessible** start point ≤ the placement-derived one:

```
chosenStartMonth = min( initialStructuredMonth(p), highestAccessibleMonth(profile) )
```

Crucially this is expressed as **"pick an accessible start"** inside the flow layer, using a *read-only, side-effect-free* accessibility query — it does **not** mutate `unlocked_level`, does **not** trigger the unlock modal, and does **not** restart anything. It is the flow choosing where to *begin* within reach; the paywall is still the thing that gates a later *open* if the learner scrolls ahead. If the owner prefers the alternative (let the CTA point past the paywall and rely purely on 5.3.1's open-time prompt), that is a one-line difference — see §9 Decision D2.

**5.3.3 Invariant both ways (R14).**
- Placement/flow → paywall: computing or changing the start point performs **zero** writes to `unlocked_level`. (Test: change proficiency, assert `unlocked_level` byte-identical.)
- Paywall → flow: redeeming an access key (raising `unlocked_level`) performs **zero** change to `proficiency_level` and does **not** move the proficiency-derived start. (Test: unlock a level, assert the derived start month unchanged.)

### 5.4 Effective proficiency when null

`proficiency_level` is nullable (never-placed / pre-TB-1 users). For the START derivation, null → **`0` (complete beginner)**. This is the safe, honest, non-skipping default: an unplaced learner starts at the beginning, never skipped ahead. (Note this differs from the current hard-coded `1` in `usePathContext.ts:96` — moving to `0` is intentional and slightly *more* conservative for unplaced users; called out as Decision D1 for explicit owner sign-off since it changes the default-start behavior for existing null-proficiency users.)

---

## 6. Data-model impact — NO new column (RESOLVES §11 "no new DB column")

TB-1a is **pure derivation** on top of TB-1's `proficiency_level`, plus the existing persisted structured cursor. **No new migration is required.**

- The **initial** structured start is derived (`p+1`), not stored — it is only used to *seed* the cursor when no cursor/progress exists.
- The **resume** point is already persisted: the structured cursor lives in `platform.storage` under the per-user key `paths:selection:<userId>` (`paths/index.ts:95`, `setStructuredCursor` at `:239-248`), and completions live in `user_situation_progress` (read by `usePathContext.ts:28-48`). Both already survive reload/offline.
- Therefore the resume-vs-initial precedence (§5.5) is decidable entirely from existing state.

**One design question the owner should confirm (Decision D3):** the structured cursor's local default is `(1,1)` (`config.ts:314-315`), so a fresh placed learner currently *has* a cursor value of `(1,1)` before they do anything. To honor R12 (resume wins) without a stored "has the learner ever advanced?" flag, the seed logic must distinguish "cursor is the untouched default" from "cursor is a real resume point." RECOMMENDED, no-new-column approach: treat the cursor as a resume signal **only when the learner has at least one completion in `user_situation_progress` OR the cursor is beyond `(1,1)`**; otherwise seed from placement. This is derivable from existing state (no schema change). If the owner wants a crisp explicit "resume exists" bit, that would be a small additive column — but it is **not** recommended (avoidable state).

---

## 7. Component wiring (specific files / functions)

1. **App wiring (R9) — `src/App.tsx:178`.** Pass the real proficiency into the path context:
   `usePathContext({ supabase, user, placementLevel: (profile?.proficiency_level ?? 0) as PracticalLevel })`. This single change fixes Adaptive Guided (§4.2) outright.

2. **Default fix — `src/features/session/usePathContext.ts:96`.** Change the fallback from `placementLevel ?? 1` to `placementLevel ?? 0` (§5.4 / Decision D1). Keep the field pure/optional.

3. **Structured initial-cursor seed (§4.1 / §5.2 / §6).** The cleanest home is a small pure helper (e.g. `initialStructuredMonth(p)` beside `structured-course.ts`, or a `seedInitialCursor(context, selection, p)` in the path layer) invoked where the selection is first materialized for a placed-but-not-yet-resumed learner. Options for *where* to seed:
   - **(a) In `usePathSelection` load (`paths/index.ts:99-158`)**: when the loaded selection is the untouched default AND no completions exist, seed `structuredMonth = initialStructuredMonth(p)`. Requires threading `proficiency_level` + a completed-count into the hook.
   - **(b) In `structured-course.next()`**: accept an effective placement (already available via `context.placementLevel`) and, when the cursor is the untouched default and no completions exist, treat the effective start month as `max(cursorMonth, initialStructuredMonth(p))`. This keeps ALL derivation pure inside the policy and needs **no** new wiring beyond R9 — **RECOMMENDED** (smallest, purest, most testable). `context.placementLevel` already exists in `PathContext`.
   - Decision D4 records the (a)-vs-(b) choice; (b) is recommended.

4. **Accessible-start bound (§5.3.2, R11).** The flow layer needs a read-only "highest accessible month" from the paywall without importing paywall *mutation*. Reuse `canAccessLevel`/`hasFullContentAccess` (`src/lib/access.ts`) as a pure predicate. Because `src/paths/*` is deliberately dependency-light (`paths/types.ts:9-10`), the accessible-month clamp is best applied in the **wiring layer** (App / a small selector), passing an already-clamped effective start into the pure policy — keeping the policy paywall-blind. Decision D2 (whether to clamp at all vs. rely on open-time prompt).

5. **Goal Track first-at-level (§4.3).** Small change in `goal-track.ts:90-92`: prefer the first uncompleted track situation with `level >= context.placementLevel`, falling back to the current behavior. Pure; uses `context.placementLevel` (already present).

6. **Retroactivity (R13) — Settings.** No new code beyond TB-1: `setProficiencyLevel` (`proficiency.ts`) already updates `profiles.proficiency_level` + mirror + in-memory profile. Because the start is *derived* from `proficiency_level` and *bounded by resume* (§5.5), a later change automatically re-bases the **recommended** start for a learner who has not yet advanced, and is inert for a learner who has progress (resume wins). No progress is touched. This satisfies R13 with zero additional writes — verify with a test.

---

## 8. Resume-vs-initial precedence (RESOLVES §11 Q4 / DF11)

Precedence, highest first:
1. **Real progress / advanced cursor** (`user_situation_progress` has ≥1 completion, or the structured cursor is beyond `(1,1)`): the learner resumes exactly where they left off. Placement is ignored. (R12.)
2. **Placement-derived initial start** (no progress, cursor is untouched default): seed from `proficiency_level` per §4.
3. **Absolute default** (no proficiency, no progress): Month 1 / Day 1 (p→0).

This is the DF11 tie: TB-1a explicitly defers to resume. DF11's broader continuity work (restore last route/tab, resumable Daily Session/Practice/Quiz/Tutor) is out of TB-1a scope, but TB-1a's precedence rule is written to be compatible with it — when DF11 lands a richer resume signal, it slots in above the placement seed at precedence tier 1.

---

## 9. Decisions needing explicit owner sign-off

These gate a *fully* autonomous plan run. The plan (`plans/plan-2026-07-19-tb1a-proficiency-behavior.yaml`) encodes the RECOMMENDED answer for each so it can run, but each is flagged for owner confirmation.

| ID | Decision | Recommended | Why it needs sign-off |
| --- | --- | --- | --- |
| **D1** | Null-proficiency default for START derivation | `0` (complete beginner) | Changes today's hard-coded `1` default; affects where existing null-proficiency users land. |
| **D2** | Accessible-start bound vs. rely on open-time prompt | **Clamp** start down to highest accessible month (§5.3.2) | UX call: avoid stranding a placed free user on a paywalled CTA vs. purity of "flow never consults access." Both honor the invariant; only differ in first-CTA UX. |
| **D3** | Detect "real resume" without a new column | Cursor-beyond-default OR ≥1 completion (§6) | Confirms no new migration; owner may prefer an explicit bit (not recommended). |
| **D4** | Where to seed the structured initial cursor | **In `structured-course.next()`** (pure, option b, §7.3) | Architectural placement; (b) needs only the R9 wiring, keeps derivation pure. |
| **D5** | Adaptive scorer tuning (asymmetric "don't start below placement") | **Defer** — ship wiring only (§4.2) | Optional tuning; deferring keeps scope tight. |

**Structural mapping decisions (D‑map): the per-path start mappings in §4 themselves need owner confirmation** — specifically the structured `p → month = p+1` table (§4.1) and the goal-track `level >= p` rule (§4.3). They are grounded in the real curriculum (§2) but are product/pedagogy calls the owner should ratify.

---

## 10. Test plan (extends TB-1 §8)

**Unit (vitest, pure — `src/paths/__tests__` + `src/features/**`):**
- `initialStructuredMonth(p)` maps `0→1, 1→2, 2→3, 3→4, 4→5, 5→6`; clamps out-of-range.
- `structured-course.next()`: a placed learner (p=2) with no progress and untouched cursor gets a next action at/after Month 3 Day 1 (NOT "Continue Day 1"); a learner WITH a completion/advanced cursor resumes at their cursor regardless of placement (R12).
- Adaptive Guided: with `PathContext.placementLevel = 2`, `order()`/`recommendSituation` rank L2 content above L0 content; with `= 0`, the reverse. (Feeds off `adaptive-guided.ts:72`.)
- Goal Track: first recommended = first uncompleted track situation with `level >= p`; falls back when none.
- **Accessible-start clamp (R11):** placement-2 with `unlocked_level = 1` (no full access) yields a start bounded to the accessible month, NOT Month 3; admin/unlimited is unbounded.
- **Invariant, widened (R14):** deriving/seeding the start performs no `unlocked_level` write; raising `unlocked_level` leaves the derived start month unchanged.
- **Retroactivity (R13):** changing proficiency for a learner with progress does NOT move their resume point and does NOT touch completions; for a learner without progress it re-bases the recommended start.
- Null-proficiency (D1): p=null → start Month 1 / Day 1.

**E2E (Playwright — `tests/e2e/user/NN-proficiency-behavior.spec.ts`, next free number):**
1. Onboard fresh user choosing **"Basic conversation"** (placement 2); active path = Structured Course.
2. Assert the Home CTA starts **further in** than Day 1 of Month 1 (matching the accessible bound: with default `unlocked_level`, the start is the top of accessible content, and it is strictly ≥ a placement-0 baseline user's start captured in the same run).
3. **Invariant:** capture `unlocked_level` / paywall copy before and after; assert the placement start did **not** unlock paid content and did not move the paywall.
4. Change proficiency in Settings to **"Complete beginner"** with no progress yet → CTA re-bases toward Month 1. Change back → re-bases forward. Progress (if any completions existed) is never lost.
5. Comparison assertion (the reported bug): two fresh users placing at `0` vs `2` land at **different** start points (the "it makes a difference now" proof).
6. Regression: access-key unlock still raises `unlocked_level` and does not alter the proficiency-derived start.

Full gate before promotion: eslint/tsc/vitest + e2e regression (test-every-change + regression memory note; AGENTS §3). The e2e gate runs on `develop` (has live creds); the release worktree is deploy-only (reference-worktree-roles memory).

---

## 11. Non-goals

- No new DB column / migration (§6) unless the owner overrides D3.
- Does NOT touch the paywall mechanism, `handleUnlockLevel`, `canAccessLevel`'s logic, or the unlock modal (only *reads* `canAccessLevel` as a pure predicate for the accessible-start bound).
- Does NOT change onboarding placement UI or the TB-1 Settings control (only leverages the value they persist).
- Does NOT implement DF11's broader continuity (route/tab restore, resumable engines) — TB-1a only defers to the resume signal that already exists and stays compatible with future DF11.
- Does NOT tune the adaptive scorer beyond feeding it the real placement (D5 deferred).
- Does NOT add difficulty adaptation *within* a situation (future EN item).

---

## 12. Coordination / rollout

- **No migration** ⇒ no operator DB gate (unless D3 overridden). This is a code-only, derivation-only change — lower risk than TB-1.
- **Shared files:** `src/App.tsx` (wiring), `src/features/session/usePathContext.ts`, `src/paths/structured-course.ts`, `src/paths/goal-track.ts`, and possibly a new `src/paths/*` helper + tests. Reserve `App.tsx` (Lane-B-adjacent per TB-1 §9) before editing; the `src/paths/*` policies were conflict-free at TB-1 time — re-check the queue at build.
- **Sequence:** D-map + D1–D5 owner sign-off → R9 wiring (App + usePathContext default) → structured seed (pure, in `next()`) → goal-track first-at-level → accessible-start clamp in wiring → unit tests → widened invariant test → e2e → full gate → merge to `develop`. The release cut (`develop`→`main`, staging→approve→prod) stays a separate operator-gated step.
- **Gate:** this doc → **owner approval (esp. §9 decisions)** → build → e2e verified (AGENTS §3). Branch: `feat/tb1a-proficiency-behavior` off `origin/develop`, isolated worktree.
