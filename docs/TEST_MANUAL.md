# FalaMadeira Test Manual

This document outlines the test cases and procedures to verify the functionality of the FalaMadeira language learning application.

## 1. Authentication
- [ ] **Signup:** Create a new account with email and password.
- [ ] **Login:** Access the app with existing credentials.
- [ ] **Password Reset:** Request a reset link and verify the flow.
- [ ] **Magic Link:** Test passwordless login via email.
- [ ] **Logout:** Ensure session is cleared and user is redirected to login.

## 2. Home Dashboard
- [ ] **Progress Overview:** Verify level name and unlocked level display.
- [ ] **Streak Tracking:** Confirm streak increments correctly (simulated or real).
- [ ] **Curriculum Shortcut:** Test "Start Today's Lesson" button.
- [ ] **Level Unlock:** Test the "Key" icon and unlock modal.

## 3. Learning Curriculum
- [ ] **Month Selection:** Switch between months and verify lesson lists.
- [ ] **Lesson Completion:** Complete a quiz and verify the checkmark appears.
- [ ] **Review Mode:** Toggle "Review Mode" and verify drag-and-drop reordering for completed lessons.
- [ ] **YouTube Indicator:** Verify the YouTube icon appears for lessons with videos.

## 4. Lesson Details & Practice
- [ ] **Video Player:** Play a YouTube video within the lesson modal.
- [ ] **Suggest Video:** Submit a video suggestion and verify it appears in the Admin Panel.
- [ ] **Vocab Lookup:** Open the lookup tool and search for words.
- [ ] **Correction Report:** Submit a correction and verify success toast.
- [ ] **Practice Session:** Start an AI session and verify context-aware greeting.
- [ ] **Quiz:** Complete a quiz and verify XP gain.

## 5. AI Tutor & Voice
- [ ] **Chat:** Send text messages and receive AI responses.
- [ ] **Voice Input:** Use the Mic button to transcribe speech.
- [ ] **Voice Limits:** Verify the daily limit (default 5) triggers the Upgrade Modal.
- [ ] **TTS (Listening):** Play AI responses using the "Listen" button.
- [ ] **Inactivity Prompt:** Wait 45s during a session and verify the AI prompts the user.

## 6. Settings & Profile
- [ ] **Profile Stats:** Verify time spent and streak display.
- [ ] **Audio Speed:** Adjust the slider and verify TTS playback speed changes.
- [ ] **Tutor Selection:** Switch tutors and verify avatar/name updates in Chat.
- [ ] **Admin Mode:** Toggle Admin Mode and verify the "Pending Suggestions" panel appears.
- [ ] **Global Limits:** (Admin) Adjust the global voice limit and verify it affects new sessions.

## 7. Monetization
- [ ] **Upgrade Modal:** Click "Upgrade Now" and verify the Stripe redirect toast.
- [ ] **Tier Benefits:** Verify the modal lists correct features.

## 8. Automated tests — how the suite is structured (dev reference)

- **Unit/component (vitest):** `npm run test:run`. Config `vitest.config.ts` scans `src/**/*.{test,spec}.{ts,tsx}` **and** `supabase/functions/**/*.{test,spec}.ts`.
- **E2E (Playwright, live backend):** `npm run test:e2e` (needs `.env.local`). `@smoke`/`@clean`/`@mobile` projects; the `@clean` lane fails on any console/network error during core journeys.
- **Ship gate:** `bash scripts/preflight.sh` (eslint, tsc, vitest, build, e2e coverage contract, standards, CORS, help-drift, and **observability `--strict`** — the HARD gate that fails the build on any bare `console.error/warn` in an error path).

### Edge-function unit tests (the pure-core pattern — EN-27)

Edge functions (`supabase/functions/**`) run on **Deno**: they import from `https://esm.sh/...` and use `Deno.serve`/`Deno.env`, which **vitest (Node) cannot load**. There is no `deno` in the dev/CI environment yet (that harness is tracked as **EN-24**). To keep edge error-handling fully unit-tested without deno, follow this pattern (used by every EN-27 edge fix):

1. Put the **decision logic** (the part worth testing — validation, retries, limit math, provider fallback, error/persist branching) in a **pure sibling module** that imports **nothing** from `https://…` and never touches `Deno.*`. Inject every runtime dependency (DB client, `persistLog`, `Deno.env.get`, `Date.now`) as a function argument.
2. Make the `Deno.serve` handler a **thin wrapper** that binds the real dependencies and calls the pure module.
3. **Unit-test the pure module in vitest** (it lives under `supabase/functions/**` which the config already scans).

Reference implementations (each file header explains it):
- `supabase/functions/_shared/deleteUserData.ts` ← `delete-account/index.ts` (partial-failure / privacy)
- `supabase/functions/_shared/tts/routeCore.ts` ← `_shared/tts/router.ts` (provider-failure persist / EF-37)
- `supabase/functions/log-sink/rows.ts` ← `log-sink/index.ts` (batch caps + row mapping)
- `supabase/functions/ai-gateway/voiceLimit.ts` ← `ai-gateway/index.ts` (voice-limit precedence)

**The thin `Deno.serve` glue — agentic review checklist (in lieu of a deno harness):** the request→response wrapper that reads the request, calls the pure core, and formats the response is **not** automatically tested (the `deno test` harness was declined by owner decision 2026-07-17 — EN-24). Instead it is covered by a **mandatory agentic review activity**: any diff touching `supabase/functions/**` gets a `/code-review` (or `/security-review` for auth/secrets) that confirms the handler —

- [ ] calls the **pure, unit-tested core** for its decision (no decision logic re-implemented inline in the handler);
- [ ] checks `{ error }` on **every** Supabase call and does not proceed on failure (supabase-js returns errors, it does not throw);
- [ ] returns the canonical **`errorResponse(code, message, status, requestId, …)`** envelope on every failure — never a bare string, a raw `500`, or a leaked `dbMessage`/internal detail;
- [ ] `persistLog`s ERROR/CRITICAL failures (paired log + user-visible envelope, correlation IDs threaded);
- [ ] never introduces a bare `console.error/warn` in an error path (also enforced by the observability `--strict` HARD gate).

This checklist + the vitest core test together are the change's Definition of Done for edge work (routed in `AGENTS.md §4`). EN-24 still tracks the optional full deno harness that would additionally automate the glue, but it is no longer required for EN-27.
