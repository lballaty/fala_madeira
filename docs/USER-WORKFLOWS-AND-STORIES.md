# FalaMadeira — User Workflows & User Stories (navigation-first)

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/USER-WORKFLOWS-AND-STORIES.md
**Description:** Canonical, navigation-first description of how a user is expected to move through FalaMadeira, the user stories per destination, and the cross-cutting requirement that configuration, choices, progress, and results **persist and are recalled** so a returning or interrupted user *continues* rather than restarts. Grounded in the current code (file:line cited); "as-is" persistence gaps are called out explicitly and tracked as DF11 / TB-7.
**Author:** Libor Ballaty
**Created:** 2026-07-14
**Last Updated:** 2026-07-14
**Last Updated By:** Libor Ballaty

---

## 0. How to read this

- **Sections 1–2** describe the navigation model and the primary end-to-end journeys — "the way a user is likely to use it."
- **Section 3** gives user stories per navigation destination.
- **Section 4** is the cross-cutting, foundational requirement: **continuity & persistence** (owner requirement 2026-07-14, DF11). It states what MUST persist, what MUST be recalled, and how interruptions are handled.
- **Sections 5–6** are the *as-is* truth: the persistence inventory and the interruption points where progress is currently lost. These are the gap list the requirement closes.

**Guiding principle (owner, 2026-07-14):** *"It should flow the way a user is likely to use it, but expect that things can be interrupted — so progress and configuration and choices must persist. A returning user must not be treated like a first-time user."*

---

## 1. Navigation model

### 1.1 Gates on load (in order) — `src/App.tsx`
1. **Supabase configured?** no → `SupabaseSetupGuide` (`App.tsx:216`).
2. **Auth loading?** → spinner (`App.tsx:220`).
3. **Signed in?** no → `AuthScreen` (`App.tsx:228`).
4. **Onboarded?** signed-in but `onboarding.isLoaded && !onboarding.isComplete` → `OnboardingFlow` (`App.tsx:244`).
5. Otherwise → the **main tab shell**, landing on `activeTab` (initialized to `'home'`, `App.tsx:79`).

### 1.2 Primary destinations (tabs) — `NAV_ITEMS` `App.tsx:66`
| # | Tab | View | Purpose |
|---|-----|------|---------|
| 1 | **Home** | `HomeView` | Dashboard: progress ring, streak, today's path CTA, review-due count, coach focus |
| 2 | **Learning** | `LearningView` | 6-month curriculum; lesson detail; request/suggest/correct/vocab; level unlock |
| 3 | **Practice** | `PracticeHubView` | 8 engines (Listening, Speaking, Patterns, Simulator, Missions, Vocabulary, Phrases, Culture) + situation browser + quiz |
| 4 | **Tutor** | `TutorChatView` | Free-form AI conversation; voice in/out; save-as-lesson; AI-Practice modal |
| 5 | **Profile** | `SettingsView` | Profile, audio/TTS, offline downloads, path switcher, support, legal, account |

Overlays (not tabs): **Admin** (`role==='admin'`), **Daily Session** (from Home CTA).

---

## 2. Primary end-to-end journeys

### 2.1 First-run (new user) — the expected happy path
1. Sign up → land in **Onboarding** (`src/features/onboarding/OnboardingFlow.tsx`).
2. **Welcome** → **Placement** (complete beginner / a few words / basic chat → L0/L1/L2) → **Path** (Structured / Goal Track / Adaptive Guided / Free) → **Track** (Goal Track only) → **First words** ("Bom dia!" listen + optional say-it-back) → **Consent** (Terms + AI-use).
3. Finish → land on **Home**, path-appropriate CTA ready.

**Story:** *As a new user, I want a short guided setup that picks a sensible starting point and my learning path, so that the app is tailored before I start — and I answer each setup question exactly once.*

### 2.2 Returning user — MUST continue, not restart (the requirement)
1. Sign in → **NO onboarding, NO re-consent** (already completed).
2. Land where the user is most likely to resume: their **last-active area** (at minimum Home with an accurate "continue" CTA).
3. All prior configuration (path, track, tutor, audio prefs), progress (completed lessons, situation progress, mastery, XP, streak), and results are **recalled from the server** and reflected immediately.

**Story:** *As a returning user, I want the app to remember who I am and everything I've set and done — on any device — so that I continue from where I was instead of starting over.*
**Acceptance:** signing in on a **fresh browser/device** shows the main shell (not onboarding), does not re-ask consent, and reflects server-side progress. (See §4 for full criteria.)

### 2.3 Daily learning loop
1. Home → "Start today's session" → **Daily Session** overlay (adaptive) OR "Continue to [Situation]" → **Practice** engine.
2. Work through segments/drills; results feed mastery (SM-2) + progress + XP/streak.
3. Session recap → back to Home with updated ring/streak.

**Story:** *As a daily learner, I want a one-tap "today's session" that adapts to what I need next, so that I make steady progress without deciding what to study.*
**Interruption story:** *As a learner who gets interrupted mid-session, I want to resume the session where I left off, so that an interruption doesn't cost me my progress or force a restart.*

---

## 3. User stories per destination

### 3.1 Onboarding (`src/features/onboarding/`)
- *As a new user, I set a starting level so content matches me* — persists `placementLevel`.
- *As a new user, I choose how I want to learn (path)* — persists path type (+ active track for Goal Track → `user_track_selection`).
- *As a new user, I accept Terms + AI-use once* — persists `profiles.has_accepted_terms` / `has_accepted_ai_usage`.
- **Requirement:** every one of these answers is durable server-side and is **not asked again** on any later login/device.

### 3.2 Home (`src/features/home/`)
- *As a learner, I see my progress, streak, and what to do next at a glance.*
- *As a learner, I tap one CTA to start the right next activity for my path.*
- *As a learner, I see how many review items are due and jump straight to them.*
- **Requirement:** the CTA and counts reflect **server-recalled** progress on every login; the landing view respects where the user last was (§4.2).

### 3.3 Learning (`src/features/learning/`)
- *As a learner, I browse the 6-month curriculum and open a lesson's detail.*
- *As a learner, I start AI practice or take a quiz from a lesson.*
- *As a learner, I request a similar lesson / suggest a video / submit a correction / look up vocab.*
- **Requirement:** completed lessons, custom order, active month persist (they do, DB). **Gap:** in-progress modal drafts must not be lost on interruption (§6).

### 3.4 Practice (`src/features/practice/`)
- *As a learner, I pick any of the 8 engines and practice, with soft (not blocking) prerequisites.*
- *As a learner, I browse situations by track/level and enter an engine on a specific situation.*
- **Requirement:** situation progress + mastery persist (they do, DB). **Gap:** the current engine session (position, typed answer, playback) must survive tab-switch/reload (§6).

### 3.5 Tutor (`src/features/tutor/`)
- *As a learner, I chat freely with the tutor by text or voice and hear replies.*
- *As a learner, I run a lesson-focused AI-Practice session.*
- *As a learner, I save a good exchange as a custom lesson.*
- **Requirement:** voice usage + saved lessons persist (they do, DB). **Gap:** chat history + AI-Practice history + input draft are memory-only and lost on tab-switch/reload (§6) — decide what should persist (at least the current session).

### 3.6 Profile / Settings (`src/features/settings/`)
- *As a user, I set audio, playback speed, TTS provider, and tutor — and they stick.*
- *As a user, I switch my learning path.*
- *As a user, I download audio for offline and see cache usage.*
- *As a user, I get support, read legal pages, change password, delete account, or sign out.*
- **Requirement:** all settings persist (DB + local mirror). Offline downloads survive SW upgrades (verified — separate IndexedDB tier).

---

## 4. Cross-cutting requirement — Continuity & Persistence (DF11, foundational)

> The app MUST treat a returning user as returning, and an interrupted user as resumable. Nothing the user configured, chose, achieved, or was midway through should silently vanish.

### 4.1 What MUST persist server-side (per user) and be recalled on login
- **Identity of "returning":** onboarding-complete + placement level. *(As-is gap: client-only — §5.)*
- **Choices/config:** path type, active track, tutor, audio/TTS/playback prefs. *(Mostly DB today; path type is client-mirrored.)*
- **Consent:** Terms + AI-use. *(DB today — but the gate ignores it, §5.)*
- **Progress/results:** completed lessons (+order), per-situation-mode progress, mastery (SM-2), XP, streak, unlocked level, active month, total time. *(DB today.)*

### 4.2 What MUST be recalled/restored into the UI on login
- Skip onboarding and consent entirely if already completed (gate on a **server** signal; use client storage only as an accelerator/fallback).
- Short-circuit any individual setup step whose answer already exists server-side (e.g., never re-ask consent when `has_accepted_terms` is true; don't re-ask track when an active `user_track_selection` exists).
- Restore the **last-active area** (at minimum last tab; ideally last route/situation) so the user reopens where they were. *(As-is: always boots to Home — §5.)*

### 4.3 Interruption resilience (multi-step flows)
- A flow that spans multiple steps (onboarding, daily session, a practice engine drill, a quiz, an AI-practice session) MUST persist enough state to **resume** after tab-switch, reload, or crash — or, where resume is out of scope, MUST make the loss explicit rather than silently discarding.
- Priority order (highest learner-cost first): **Daily Session** > **Practice engine drill / Quiz** > **AI-Practice session** > **Tutor free-chat** > **Learning modal drafts**.

### 4.4 Acceptance criteria (testable)
1. Sign in on a **fresh browser/device** for an already-onboarded account → main shell, **no onboarding, no re-consent**; progress/streak/XP reflect the server.
2. Clearing site data then signing in → same as (1) (no first-run restart).
3. Completing onboarding writes the completion signal to the **DB**; a later login reads it from the DB.
4. Reopening the app restores the last-active tab (min) / route (target).
5. Interrupting a Daily Session and returning resumes at the same segment (not segment 0).
6. Each interruptible flow either resumes or explicitly tells the user what wasn't saved.

---

## 5. As-is persistence inventory (source of truth today)

✅ survives new device (DB) · 🟡 client-only (per device) · ❌ not persisted

| Item | Where | New device? |
|---|---|---|
| Onboarding-complete + placement | client `platform.storage` (`onboarding:record:<userId>`) | 🟡 → **restarts onboarding (TB-7)** |
| Path type | client mirror (`usePathSelection`) | 🟡 |
| Active track | `user_track_selection` | ✅ |
| Consent (Terms/AI) | `profiles.has_accepted_terms` / `has_accepted_ai_usage` | ✅ (but gate ignores it → re-asked) |
| Completed lessons (+order) | `profiles.completed_lessons(_order)` | ✅ |
| Situation progress | `user_situation_progress` | ✅ |
| Mastery (SM-2) | `mastery_items` | ✅ |
| XP / streak / unlocked level / active month / total time | `profiles.*` | ✅ |
| Audio/speed/TTS/tutor | `localStorage` + `profiles.*` | ✅ (prefs are device-wide + DB) |
| Offline audio + settings | IndexedDB / SW cache + `localStorage` | 🟡 (device) |
| Support tickets / custom lessons / suggestions / corrections | DB tables | ✅ |
| **Last-active tab / route** | — | ❌ (always Home, `App.tsx:79`) |
| Practice routing state | memory (`usePractice`) | ❌ |
| Tutor chat / AI-practice history / input draft | memory (`useTutorSession`) | ❌ |
| Daily-session segment position | memory (`useDailySession`) | ❌ |
| Learning modal drafts / unlock-key draft | memory | ❌ |

---

## 6. As-is interruption points (progress currently lost)

Lost on tab-switch / reload / crash (state held in component memory only):
1. **Daily Session** segment position + baseline mastery snapshot (`useDailySession`) → restarts at segment 0; recap delta lost.
2. **Practice engine** in-drill state (word selection, dictation text, playback index) → re-initializes.
3. **Quiz** question index + answers (`PracticeQuiz`) → resets to Q1.
4. **AI-Practice** session history + per-item grades (`useTutorSession`) → conversation + SM-2 grades lost.
5. **Tutor free-chat** history + input draft + Gemini session → lost.
6. **Learning modal drafts** (request/suggest/correct/vocab) + unlock-key draft → cleared.
7. **Last-active tab** never restored → always reopens on Home.

---

## 7. Open decisions & links
- **DF11** (REQUIREMENTS-TRACKER) — this requirement, fix direction, and the empirical question of whether same-device re-login also restarts (IndexedDB→memory fallback on staging).
- **TB-7** (TESTER-FEEDBACK-TRACKER) — the owner-found defect (restart + re-consent every login) with confirmed root cause.
- **Owner decision:** does TB-7 gate the prod promotion of staged `2026.07.14.2`?
- **Design follow-up:** which interruptible flows are *resume* vs *explicit-loss* in the first pass (§4.3 priority order).
