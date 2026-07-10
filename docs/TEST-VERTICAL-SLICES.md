# FalaMadeira — Vertical-Slice Test Map

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/docs/TEST-VERTICAL-SLICES.md
**Description:** The vertical-slice test contract that the Playwright e2e step (`vertical-slice-e2e`) implements. Each slice maps a UI entry point to its client path, edge function/RPC, DB tables, and the concrete backend evidence (row + correlation_id) the test must assert per ENGINEERING-STANDARDS §9. Slices for not-yet-built features are documented as the forward contract and marked `planned (step-id)`.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-09
**Last Updated:** 2026-07-09
**Last Updated By:** execute-plan (vertical-slice-map step)

---

## 0. Evidence model — how correlation_id ties a UI action to backend rows

E2E verification is **UI action → backend evidence**, never UI-only (ENGINEERING-STANDARDS §9). The ID scheme (implemented in `src/lib/logger.ts` and `supabase/functions/_shared/http.ts`):

| ID | Origin | Scope | Where it appears |
|---|---|---|---|
| `session_id` | client `logger` (`SESSION_ID`, one per page load) | app session | every `LogEvent`; inside `public.logs.details` JSON; in the `user_report` Send-Logs payload (`details.sessionId`) |
| `request_id` | client `logger` (uuid per log event) | one log event | every `LogEvent`; inside `public.logs.details` JSON |
| `correlation_id` | defaults to the event's own `request_id`; **set to the edge function's `requestId`** at the single edge-error choke point in `src/services/geminiService.ts` (`invokeEdgeFunction`) | one request-level flow | inside `public.logs.details` JSON; joins client log ↔ edge-function log line |
| edge `requestId` | `newRequestId()` per edge invocation (`_shared/http.ts`) | one edge call | echoed in EVERY response body — success (`{..., requestId}`) and error envelope (`{ error: { code, message, requestId, details } }`); also in the edge function's own `console` JSON log line |
| user-visible `Ref` | `shortRef(correlation/request id)` — first 8 hex chars | support pivot | toast/error text `"... (Ref: abc12345)"` via `userMessage()` |

**Persistence (what a backend log row actually looks like).** The client logger batch-inserts **ERROR/CRITICAL** events into `public.logs` (RLS: `auth.uid() = user_id`, so only while signed in; queued offline and flushed on reconnect). Row shape:

- `logs.user_id` = the signed-in user
- `logs.event` = the logger `event_type` (e.g. `edge_fn_error`, `user_report`)
- `logs.details` = JSON **string** containing `level`, `category`, `message`, `session_id`, `request_id`, `correlation_id`, `details`
- `logs.device_info`, `logs.timestamp`

**Canonical evidence query** (run via service-role or as the test user; Playwright captures the ID first):

```sql
SELECT id, event, details, timestamp
FROM public.logs
WHERE user_id = :test_user_id
  AND details LIKE '%"correlation_id":"' || :captured_id || '"%'
ORDER BY timestamp DESC;
```

**How Playwright captures the join key per slice:**

1. **Edge-function slices:** intercept the response (`page.on('response')` on `/functions/v1/*`) and read `requestId` from the JSON body. On failure the client logs with `correlation_id = requestId`, so the same value pivots into `public.logs`.
2. **Direct-table slices (PostgREST):** happy paths write **domain rows** (see per-slice evidence); assert the row itself (values + `user_id` + timestamp window). See gap G1 below — happy paths do not currently persist a log row.
3. **`Ref` in toasts:** on visible errors, parse `(Ref: xxxxxxxx)` from the toast text and match it against `substring(replace(correlation_id,'-',''),1,8)` in the `logs.details` JSON.
4. **Session pivot:** trigger Settings → Support → "Collect Logs" (`user_report` row); its `details` JSON carries `sessionId` + the full ring-buffer snapshot (`recentLogs[*].correlation_id`), giving backend evidence for INFO-level actions in the same session.

### Known evidence gaps the e2e step must design around

- **G1 — happy paths persist no log row.** Only ERROR/CRITICAL events reach `public.logs`. For success flows the backend evidence is the **domain row** (e.g. `profiles.completed_lessons`, `tickets` insert), plus optionally a `user_report` Send-Logs row to snapshot the session's INFO events with their `correlation_id`s.
- **G2 — edge functions do not write `public.logs`.** They log JSON (with `requestId`) to the Supabase function console only. The DB-side join exists only when the *client* logs the flow (error paths) or via the echoed `requestId` captured from the network response.
- **G3 — no request header propagation yet.** The client does not send an `x-correlation-id` header to edge functions (ENGINEERING-STANDARDS §3.1 target); the join is response-side (`requestId` echo). Tests must capture from the response body, not assume a client-chosen ID.
- **G4 — `session_id` is not exposed to the page context.** `logger.getSessionId()` is module-internal; recommend the e2e step add a DEV-only `window` hook or rely on capture paths 1–4 above.
- **G5 — quiz completion evidence is an array mutation**, not a row insert: `profiles.completed_lessons` gains the lesson id only when score ≥ 3 (`usePractice.handleQuizComplete`). Assert array membership, not row count.
- **G6 — STT-dependent flows** (voice usage increment, speaking engine) need a mocked speech adapter or manual pass; real mic input is not automatable headlessly.

---

## 1. Slice index

| # | Slice | Status |
|---|---|---|
| S1 | Auth: sign-up / sign-in / reset | implemented |
| S2 | Structured-course lesson + quiz completion | implemented (legacy lessons shape; content-model rebind planned: `path-types`) |
| S3 | AI tutor chat / practice (gemini edge fn) | implemented |
| S4 | Learner feedback: video suggestion, lesson request, correction | implemented |
| S5 | Support ticket + diagnostic Send Logs | implemented |
| S6 | Admin review (video-suggestion moderation) | implemented (partial; full studio: `admin-and-content-studio`) |
| S7 | Account deletion | implemented |
| S8 | Goal track selection | planned (`path-types`) |
| S9 | Engine: Listening | planned (`engine-listening`) |
| S10 | Engine: Speaking / Pronunciation | planned (`engine-speaking-pronunciation`) |
| S11 | Engine: Pattern Builder | planned (`engine-pattern-builder`) |
| S12 | Engine: Situation Simulator | planned (`engine-situation-simulator`) |
| S13 | Engine: Missions | planned (`engine-missions`) |
| S14 | Vocabulary / SRS review | planned (`mode-vocab-review`, `srs-adaptive-engine`) |
| S15 | Adaptive Guided daily session | planned (`path-types`) |
| S16 | Coach Focus card + recap | planned (`coach-feedback-loop`) |
| S17 | Offline write queue + sync | planned (`offline-sync-queue`) |
| S18 | Admin Content Studio (author/publish pack) | planned (`admin-and-content-studio`) |

---

## 2. Implemented slices (automatable now)

### S1 — Auth: sign-up / sign-in / reset

- **Status:** implemented
- **UI entry:** `AuthScreen` (`src/features/auth/AuthScreen.tsx`) — email+password sign-in, sign-up, magic link, password reset; rendered by `App.tsx` whenever `!user`.
- **Client path:** `AuthScreen` handlers → `supabase.auth.signInWithPassword / signUp / signInWithOtp / resetPasswordForEmail / updateUser`; then `useAuth` (`src/features/auth/useAuth.ts`) bootstrap (`getUser` + `onAuthStateChange`) fetches/creates the profile and calls `logger.setUser(userId)` (unblocks log-queue flushing).
- **Edge fn/RPC:** none (Supabase GoTrue directly).
- **DB tables:** reads `profiles` (select by `id`); writes `profiles` (insert on first login via `useAuth` fallback creation; `handle_new_user` trigger normally creates it), `auth.users` (managed).
- **Backend evidence:** `profiles` row exists with `id = auth.uid()` and `email = test email`; on first sign-up assert the row's defaults (`role='user'`, `streak=0`). For the correlation tie: force one failure (wrong password) and assert the toast shows a code/`Ref`; auth failures are client-logged, so a `public.logs` row with matching `correlation_id` in `details` appears after sign-in succeeds and the queue flushes.
- **Failure paths:** wrong password (calm message, no lockout surprise), expired session mid-app (`handleSupabaseError` routes to re-auth), signed-out log queue holds events until sign-in (assert flush-after-login), offline sign-in attempt.

### S2 — Structured-course lesson + quiz completion

- **Status:** implemented (legacy `lessons` table shape; rebind to `situations`/`user_situation_progress` lands with `path-types`)
- **UI entry:** Learning tab → `LearningView` (`src/features/learning/LearningView.tsx`) → open a lesson (`LessonDetailModal`) → "Practice/Quiz" → `PracticeQuiz` (`src/features/practice/PracticeQuiz.tsx`) → complete ≥ 3 correct.
- **Client path:** `useLessons` (`src/features/learning/useLessons.ts`, fetches static + custom lessons, month unlock via `global_settings` unlock key) → `usePractice.handleQuizComplete` (`src/features/practice/usePractice.ts`).
- **Edge fn/RPC:** none for the quiz itself; TTS phrase playback goes through `gemini` edge fn action `tts` (see S3).
- **DB tables:** reads `lessons` (static + own custom), `global_settings` (unlock key), `profiles`; writes `profiles.completed_lessons` (array append on score ≥ 3), `profiles.active_month` (month switch), `profiles.total_time_spent` (via `useTimeTracking`).
- **Backend evidence:** `profiles.completed_lessons @> ARRAY[:lesson_id]` for the test user after quiz completion (G5: array membership, score ≥ 3 required). No log row on success (G1); to get a correlation_id-bearing record, run Send Logs afterwards and assert the `user_report` row's `recentLogs` includes the session's quiz events.
- **Failure paths:** score < 3 (no write — assert array unchanged), profile update error surfaces via `handleSupabaseError` → ERROR row in `public.logs` with `correlation_id`, offline completion (currently lost — becomes S17's queue).

### S3 — AI tutor chat / practice (gemini edge fn)

- **Status:** implemented
- **UI entry:** Tutor tab → `TutorChatView` send message; or Home/Learning → "AI Practice" → `TutorPracticeModal` (`startAIPractice`).
- **Client path:** `useTutorSession` (`src/features/tutor/useTutorSession.ts`) → `src/services/geminiService.ts` `invokeEdgeFunction('gemini', { action: 'chat' | 'generate-lesson' | 'translate' | 'tts', ... })` with the session JWT; stateless server, history sent per turn; TTS audio cached via the audio adapter.
- **Edge fn/RPC:** `gemini` (`supabase/functions/gemini/index.ts`) — JWT-verified; actions `chat`, `generate-lesson`, `translate`, `tts` (provider router in `_shared/tts/`).
- **DB tables:** writes `profiles.voice_usage_today` + `last_voice_usage_date` (STT increments — G6), `lessons` (insert when saving a generated lesson via `saveGeneratedLesson`); reads `profiles` (voice limit), `global_settings` (global voice limit).
- **Backend evidence:** capture `requestId` from the `/functions/v1/gemini` response body (echoed on success and in the error envelope). Happy path: assert the response envelope carries `requestId` and, for `generate-lesson` + save, that a `lessons` row (`user_id = test user`, matching title) exists. Failure path: force a 4xx (e.g. unknown action via request interception, or signed-out call) and assert a `public.logs` row whose `details` JSON has `"event":"edge_fn_error"`-style `event_type` and `correlation_id` equal to the captured server `requestId` — this is the canonical client↔edge join.
- **Failure paths:** AI unavailable/502 (`GEMINI_ERROR` code + Ref in toast, logged), auth expiry mid-chat (401 `UNAUTHENTICATED`), voice limit reached (UpgradeModal path), TTS provider fallback chain, offline send (honest failure, no silent drop).

### S4 — Learner feedback: video suggestion, lesson request, correction

- **Status:** implemented
- **UI entry:** Learning tab lesson detail → "Suggest video" (`SuggestVideoModal`), "Request lesson" (`RequestLessonModal`), "Correction" (`CorrectionModal`).
- **Client path:** `useLessonModals` (`src/features/learning/useLessonModals.ts`) → direct PostgREST inserts.
- **Edge fn/RPC:** none.
- **DB tables:** writes `video_suggestions` (status `pending`; NB `user_id`/`lesson_id` are TEXT columns), `lesson_requests`, `lesson_corrections`.
- **Backend evidence:** the inserted row (`user_id = test user`, submitted text, `status='pending'`, `created_at` in the test window). On induced failure, `handleSupabaseError` → `public.logs` ERROR row with `correlation_id` in `details`.
- **Failure paths:** RLS rejection (signed-out insert must 401/403), duplicate submissions, offline submit.

### S5 — Support ticket + diagnostic Send Logs

- **Status:** implemented — this is the one happy-path slice with **direct correlation_id backend evidence**.
- **UI entry:** Settings tab → Support (`SupportModal`) → submit ticket; → "Collect Logs" (confirmation modal) → send.
- **Client path:** `useSettings.handleOpenTicket` / `useSettings.handleCollectLogs` (`src/features/settings/useSettings.ts`); Send Logs serializes `logger.getSessionId()` + `logger.getRecentLogs()` (ring buffer, each event carrying `session_id`/`request_id`/`correlation_id`).
- **Edge fn/RPC:** none.
- **DB tables:** writes `tickets` (insert, `status='open'`, `priority='medium'`), `logs` (insert `event='user_report'`).
- **Backend evidence:** (a) `tickets` row for the test user with the submitted subject; (b) `logs` row with `event='user_report'` whose `details` JSON contains `sessionId` and `recentLogs[*].correlation_id` — assert at least one `correlation_id` from an action performed earlier in the same test session appears. This makes S5 the standard "session pivot" finisher for other slices' INFO-level evidence.
- **Failure paths:** empty-field validation, insert failure (ERROR log row with its own correlation_id), consent-decline path (no row written).

### S6 — Admin review (video-suggestion moderation)

- **Status:** implemented (partial — moderation queue only; authoring studio is S18)
- **UI entry:** Settings → enable admin mode (admin-role account) → `AdminPanel` (`src/features/settings/AdminPanel.tsx`) → approve/reject a pending video suggestion.
- **Client path:** `useLessons.handleApproveSuggestion` / `handleRejectSuggestion` (`src/features/learning/useLessons.ts`) → PostgREST updates.
- **Edge fn/RPC:** none; authorization is RLS (`public.is_admin()` / `profiles.role='admin'`), never client state.
- **DB tables:** reads `video_suggestions` (all rows as admin); writes `video_suggestions.status` (`approved`/`rejected`), `lessons.video_url` (on approve).
- **Backend evidence:** `video_suggestions` row status flipped + `lessons.video_url` updated. **Negative evidence is mandatory:** the same update as a non-admin user must fail RLS (0 rows affected) — assert both sides.
- **Failure paths:** non-admin update attempt (RLS block), admin mode toggled client-side without the role (server must still refuse), approve with missing lesson.

### S7 — Account deletion

- **Status:** implemented
- **UI entry:** Settings tab → Delete account → `ConfirmationModal` (destructive confirm).
- **Client path:** `SettingsView` → `geminiService.deleteAccount()` → `invokeEdgeFunction('delete-account')` with session JWT.
- **Edge fn/RPC:** `delete-account` (`supabase/functions/delete-account/index.ts`) — verifies JWT, service-role deletes owned rows, then deletes the auth user.
- **DB tables:** deletes from `lessons`, `lesson_requests`, `tickets`, `logs`, `video_suggestions` (TEXT uid), `lesson_corrections` (TEXT uid), `profiles`, then `auth.users`.
- **Backend evidence:** capture `requestId` from the response (`{ deleted: true, requestId }`); then assert (service-role) **zero rows** remain in every listed table for the deleted uid and the auth user is gone. Note: `public.logs` rows for the user are deleted too — the correlation evidence for this slice is the response `requestId` + the edge function's console log line carrying the same `requestId`, not a surviving DB row (G2). Use a **dedicated throwaway user** per run.
- **Failure paths:** unauthenticated call (401 `UNAUTHENTICATED` envelope with `requestId`), partial-delete failure (`DELETE_FAILED` 500 + Ref shown to user), post-deletion sign-in must fail. **Gap:** rows in the new 00006 user-state tables (`user_track_selection`, `user_situation_progress`, `mastery_items`, `missions_log`, `pronunciation_attempts`, `writing_submissions`) are NOT yet cleaned by this function — they rely on `ON DELETE CASCADE` from `auth.users`, which does hold (FK to `auth.users(id)`); the e2e must assert the cascade actually emptied them.

---

## 3. Planned slices (forward contract — implement with the named step, then automate)

The contract below is fixed by `plans/plan-2026-07-09-full-product.yaml` + `docs/CONTENT-ARCHITECTURE.md` (§2 content model, §5 paths, §6/6b mastery+coach, §9 data model) and migration `00006_content_model.sql` (tables already live). Hook/component names are the plan's target shape; tests are written against this contract when the step lands.

### S8 — Goal track selection — planned (`path-types`)

- **UI entry:** onboarding path picker / Settings path switcher → choose a Goal Track (e.g. Survival).
- **Client path:** `src/features/onboarding/` + `src/paths/goal-track.ts` policy → PostgREST upsert.
- **Edge fn/RPC:** none.
- **DB tables:** reads `tracks`, `situations` (published packs only — RLS via parent `content_packs.status='published'`); writes `user_track_selection` (upsert; partial unique index enforces one active track).
- **Backend evidence:** `user_track_selection` row (`user_id`, chosen `track_id`, `is_active=true`); on switching, old row `is_active=false`, exactly one active row (assert the unique-index invariant). Correlation: selection failures log ERROR with `correlation_id`; happy path is the domain row (G1).
- **Failure paths:** switching tracks preserves history, selecting a track from an unpublished pack (read must be RLS-blocked), offline selection queued (S17).

### S9 — Engine: Listening — planned (`engine-listening`)

- **UI entry:** Practice hub → Listening → pick a Situation → play dialogue (speeds/voices/noise), transcript reveal, dictation check.
- **Client path:** `src/features/practice/listening/` consuming `situation.payload.dialogues` via `src/content/repository.ts` + TTS/audio adapters.
- **Edge fn/RPC:** `gemini` action `tts` (or dedicated `speak` fn) for dialogue audio; offline plays from cached audio.
- **DB tables:** reads `situations`; writes `user_situation_progress` (PK `(user_id, situation_id, mode='listening')`, `status`, `score` jsonb).
- **Backend evidence:** `user_situation_progress` row with `mode='listening'` and a `score` payload matching the completed exercise; TTS network `requestId` captured per audio fetch joins any playback failure to the `public.logs` row via `correlation_id`.
- **Failure paths:** TTS provider fallback chain (Azure → … → Web Speech), offline playback from cache (no network calls asserted), empty-audio provider defect retry (Gemini `finishReason=OTHER`).

### S10 — Engine: Speaking / Pronunciation — planned (`engine-speaking-pronunciation`)

- **UI entry:** Practice hub → Speaking → repeat/shadow an item → record-and-compare feedback.
- **Client path:** `src/features/practice/speaking/` using `src/platform/speech.ts` + audio adapter.
- **Edge fn/RPC:** `gemini` (scoring/error-analyst action, post `prompt-hardening`); STT via platform adapter (G6 — mock in e2e).
- **DB tables:** writes `pronunciation_attempts` (append-only: `user_id`, `item_key`, `score` jsonb, optional `audio_ref`), `mastery_items` (dimension `say`), `user_situation_progress` (`mode='shadowing'`).
- **Backend evidence:** new `pronunciation_attempts` row per attempt (count increments; append-only — no UPDATE policy exists, assert updates fail), `mastery_items` row for the item with `dimension='say'` updated. Scoring-call `requestId` from the network joins failures via `correlation_id` in `public.logs`.
- **Failure paths:** mic permission denied (calm message, logged), STT unavailable on iOS Safari (adapter fallback), AI scoring unavailable → deterministic local feedback fallback.

### S11 — Engine: Pattern Builder — planned (`engine-pattern-builder`)

- **UI entry:** Practice hub → Patterns → substitution drill over `situation.payload.phrase_patterns`.
- **Client path:** `src/features/practice/patterns/` (pure client logic over repository content).
- **Edge fn/RPC:** none (offline-capable core mode); optional TTS per S9.
- **DB tables:** reads `situations`; writes `user_situation_progress` (`mode='patterns'`), `mastery_items` (dimension `retrieve`/`avoid`).
- **Backend evidence:** `user_situation_progress` row `(user_id, situation_id, 'patterns')` with updated `score`/`updated_at`; corresponding `mastery_items` grade change (`last_grade`, `repetitions` incremented).
- **Failure paths:** fully offline drill (writes queue — S17), malformed pattern content rejected by schema (validator, not renderer crash).

### S12 — Engine: Situation Simulator — planned (`engine-situation-simulator`)

- **UI entry:** Practice hub → Simulator → pick Situation + difficulty (L1 guided → L5 messy) → branching roleplay.
- **Client path:** `src/features/practice/simulator/` consuming `situation.payload.roleplay` → `geminiService` → `gemini` edge fn (roleplay/scenario actions per `prompt-hardening`).
- **Edge fn/RPC:** `gemini` (JWT-verified; level-locked prompts).
- **DB tables:** reads `situations`; writes `user_situation_progress` (`mode='roleplay'`), `mastery_items` (dimensions per error analysis).
- **Backend evidence:** per-turn edge `requestId` captured from responses; completion writes the `user_situation_progress` row (`mode='roleplay'`, `score` with turn stats). Forced AI failure mid-roleplay must yield a `public.logs` row whose `correlation_id` equals the captured `requestId`.
- **Failure paths:** AI unavailable → honest degradation (offer scripted dialogue, never silent), auth expiry mid-session, level-lock respected (response vocab within learner level — content assertion).

### S13 — Engine: Missions — planned (`engine-missions`)

- **UI entry:** Practice hub → Missions → pick a real-world mission → prep → mark attempted/completed → after-action review.
- **Client path:** `src/features/practice/missions/` consuming `situation.payload.mission`.
- **Edge fn/RPC:** none for logging; optional AI after-action review via `gemini`.
- **DB tables:** writes `missions_log` (`user_id`, `situation_id`, `status` planned→attempted→completed, `notes`, `completed_at`).
- **Backend evidence:** `missions_log` row transitions (`status='completed'`, `completed_at` set, notes text persisted). Offline completion is the flagship S17 case: complete offline, reconnect, assert the row appears with the original (client-side) timestamp semantics.
- **Failure paths:** offline mission completion (queued), duplicate completion, RLS cross-user read blocked.

### S14 — Vocabulary / SRS review — planned (`mode-vocab-review`, `srs-adaptive-engine`)

- **UI entry:** Practice hub → Vocabulary/Review → graded flashcards from due items.
- **Client path:** `src/features/practice/vocabulary/` → `src/lib/srs.ts` (SM-2 + hear/say/retrieve/avoid steering) → PostgREST upserts.
- **Edge fn/RPC:** none (deterministic, offline-capable).
- **DB tables:** reads/writes `mastery_items` (UNIQUE `(user_id, item_key, dimension)`; `ease`, `interval_days`, `repetitions`, `next_review`, `last_grade`).
- **Backend evidence:** after grading a card, the `mastery_items` row for `(item_key, dimension)` shows the new `last_grade`, incremented `repetitions`, and `next_review` moved per SM-2 (exact values unit-tested in `src/lib/__tests__/`; e2e asserts direction + persistence).
- **Failure paths:** offline review session (queued writes, no lost grades), due-query correctness after clock skew, first-ever review creates the row (insert path).

### S15 — Adaptive Guided daily session — planned (`path-types`)

- **UI entry:** Home → "Start today's session" (daily-session composer output: ~30-min mixed sequence).
- **Client path:** `src/paths/adaptive-guided.ts` + daily-session composer → chains engine slices S9/S11/S14.
- **Edge fn/RPC:** whatever the composed engines use (TTS, gemini).
- **DB tables:** reads `mastery_items` (due), `user_situation_progress`, `situations`; writes the composed engines' tables per segment.
- **Backend evidence:** one session produces multiple rows across tables in the same window: ≥1 `user_situation_progress` update, ≥1 `mastery_items` grade, and (if the composer logs a session summary event on error) a `public.logs` row joinable by `correlation_id`. Assert the composition is recommendation-only: every suggested item is also directly reachable (no hard lock — CONTENT-ARCHITECTURE §5/§12).
- **Failure paths:** session interrupted mid-way (partial progress persists), offline session (deterministic composition from local data), engine segment failure skips gracefully.

### S16 — Coach Focus card + recap — planned (`coach-feedback-loop`)

- **UI entry:** Home → Focus card ("why" explanation visible); after-session recap screen.
- **Client path:** `src/lib/coach.ts` (deterministic scoring/prioritization over local + fetched results) → optional AI narrative via `gemini` error-analyst action.
- **Edge fn/RPC:** `gemini` (narrative only; deterministic fallback offline).
- **DB tables:** reads `mastery_items`, `user_situation_progress`, `pronunciation_attempts`, `missions_log`; writes none required (derived data is computed, not stored — ENGINEERING-STANDARDS §2); AI-narrative failures write `public.logs`.
- **Backend evidence:** primarily **input-consistency evidence**: seed known weakness data (low `mastery_items.last_grade` on a `say` item), assert the Focus card surfaces that item with an explanation. AI-narrative path: capture `requestId`; force failure and assert deterministic fallback text renders AND a `public.logs` row with matching `correlation_id` exists.
- **Failure paths:** offline (deterministic coach only — must still render), AI narrative timeout → fallback, empty history (calm cold-start, no fabricated insight).

### S17 — Offline write queue + sync — planned (`offline-sync-queue`)

- **UI entry:** any progress-writing action performed while offline (Playwright `context.setOffline(true)`): quiz complete, review grade, mission complete; then reconnect.
- **Client path:** `src/lib/sync-queue.ts` behind the storage adapter; reconnect flush; the logger's own persist queue follows the same reconnect discipline.
- **Edge fn/RPC:** none (PostgREST writes on flush).
- **DB tables:** writes on reconnect: `user_situation_progress`, `mastery_items`, `missions_log`, `profiles` counters (server-side increments), `logs` (queued ERROR events flush too).
- **Backend evidence:** while offline assert **zero** new rows; after reconnect assert every queued write landed exactly once (per-item timestamps, last-write-wins) AND queued ERROR log events appear in `public.logs` with their original `correlation_id`/`session_id` — proving the correlation chain survives the offline gap.
- **Failure paths:** flush failure retries without data loss (kill network mid-flush), duplicate-flush idempotency, queue overflow bound, conflicting write from a second device (LWW semantics).

### S18 — Admin Content Studio (author/validate/publish pack) — planned (`admin-and-content-studio`)

- **UI entry:** Admin area → Content Studio → author a Situation/Track → validate → publish pack.
- **Client path:** `src/features/admin/` → validator (`scripts/validate-content.mjs` logic) → PostgREST writes as admin.
- **Edge fn/RPC:** none required (RLS `public.is_admin()` gates writes); optionally a publish fn later.
- **DB tables:** writes `content_packs` (status draft→published, `checksum`), `situations`, `tracks`; reads all as admin (draft packs visible to admin only).
- **Backend evidence:** `content_packs` row transitions to `status='published'` with a non-null `checksum`; child `situations` rows become readable to a **non-admin** user only after publish (assert the RLS flip: pre-publish anon/user SELECT returns nothing, post-publish it returns the situation). Non-admin write attempts must fail (0 rows).
- **Failure paths:** validation rejects bad EU-PT content before any write, checksum mismatch on client fetch triggers re-fetch + logged event (`correlation_id` in `public.logs`), draft leak to non-admin (must never happen).

---

## 4. Notes for the `vertical-slice-e2e` implementer

1. **Test users:** one persistent learner, one admin (`profiles.role='admin'`), one throwaway per account-deletion run (S7).
2. **Order-sensitive:** run S7 last within its user's scope; S5 (Send Logs) is the session-pivot finisher — run it at the end of each learner journey to persist that session's INFO events with their `correlation_id`s.
3. **Backend assertion channel:** a small helper using the service-role key OUTSIDE the browser context (Node side of Playwright) queries the tables above; never ship that key to the page.
4. **The two evidence classes:** domain-row evidence (happy paths, G1) and `public.logs` correlation_id evidence (failure paths, Send Logs, offline flush). Every slice's test must assert at least one; slices S3/S5/S7/S12/S17 must assert the correlation_id class explicitly.
5. **Smoke subset (`@smoke`):** S1 sign-in, S2 lesson open, S3 one chat turn (requestId echo asserted), S5 Send Logs row — used by `local-server-test` and `post-deploy-smoke`.
