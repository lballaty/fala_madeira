# Migration Application Log

**File:** supabase/migrations/APPLIED.md
**Description:** Record of which migrations have been applied to the live Supabase project `gxlrmdfqcqimwwplrdgd` (PortugueseMadeira), when, and how. Supabase does not expose a reliable applied-migrations table for manually-run SQL, so this is the source of truth for application history.
**Author:** Libor Ballaty <libor@arionetworks.com>
**Created:** 2026-07-08
**Last Updated:** 2026-07-10
**Last Updated By:** perf-efficiency-stability-safety execution

| Migration | Applied | When | How | Notes |
|---|---|---|---|---|
| 00001_initial_schema.sql | ✅ (pre-existing) | before 2026-07-08 | unknown (dashboard or CLI) | All 8 tables + handle_new_user trigger confirmed live 2026-07-08. Re-run fails on non-idempotent policy CREATE — expected. |
| 00002_video_suggestions_policies.sql | ✅ (pre-existing) | before 2026-07-08 | unknown | Public-read policy for approved video_suggestions confirmed live. |
| 00003_profiles_columns_and_rls_fixes.sql | ✅ | 2026-07-08 | `node apply-migrations.js` (direct connection) | Adds is_admin() helper, conditional profile columns, ON CONFLICT trigger fix, hardened RLS. Idempotent (30 guards). |
| 00004_rls_gap_policies.sql | ✅ | 2026-07-08 | `node apply-migrations.js` (direct connection) | UPDATE policies for lesson_requests (uuid user_id) + lesson_corrections (text user_id), admin INSERT on global_settings, DELETE on profiles. Idempotent. |
| 00005_global_settings_seed.sql | ✅ | 2026-07-09 | `node apply-migrations.js` (direct connection) | Seeds `level_unlock_key = 'MADEIRA2026'` into global_settings (unlock key moved out of client source). ON CONFLICT DO NOTHING — never overwrites an operator-rotated key. Row verified live 2026-07-09. |
| 00006_content_model.sql | ✅ | 2026-07-09 | `node apply-migrations.js` (direct connection) | Modular content model (CONTENT-ARCHITECTURE §9): content_packs, situations, tracks (JSONB payloads) + user_track_selection, user_situation_progress, mastery_items (hear\|say\|retrieve\|avoid), missions_log, pronunciation_attempts, writing_submissions. Published-readable/admin-writable content RLS, owner RLS on user tables, shared set_updated_at() trigger fn. All 9 tables + RLS + policies + triggers + partial-unique active-track index verified live 2026-07-09. Idempotent. |
| 00007_tts_prefs.sql | ✅ | 2026-07-09 | `node apply-migrations.js` (direct connection) | Per-user TTS preference: `profiles.tts_provider` (CHECK azure\|gemini\|google\|elevenlabs\|openai\|polly or NULL) + `profiles.tts_byo_key_ref` (secret NAME reference only — raw keys never stored; column COMMENT states this). Both columns + CHECK constraint + COMMENTs verified live 2026-07-09 (information_schema.columns / pg_constraint). RLS: existing owner policies on profiles cover the new columns (pg_policies: "Users can update own profile" UPDATE) — no new policies. Idempotent. |
| 00008_uuid_fk_integrity.sql | ✅ | 2026-07-10 | `node apply-migrations.js` (direct connection) | FK/index integrity pass for the feedback tables. **Applied (safe):** 5 supporting b-tree indexes verified live via pg_indexes — `idx_video_suggestions_user_id`, `idx_lesson_corrections_user_id`, `idx_lesson_requests_user_id`, `idx_video_suggestions_lesson_id`, `idx_lesson_corrections_lesson_id`. **FK added:** `lesson_requests_user_id_fkey (user_id → auth.users(id))` — the guard found the 00001 inline REFERENCES had NEVER actually been applied live, so this migration added it (verified live in pg_constraint: `FOREIGN KEY (user_id) REFERENCES auth.users(id)`). **Deferred (documented, NOT applied — would be breaking):** FK on `video_suggestions.user_id` / `lesson_corrections.user_id` → auth.users (columns are TEXT and 00001 RLS compares `user_id = auth.uid()::text`; a UUID FK needs a type conversion that breaks those policies — both tables are 0 rows so a future dedicated migration can rewrite RLS + convert + FK atomically); FK on `*.lesson_id` → lessons.id (lesson_id holds STATIC string lesson ids, not the UUID PK of public.lessons — a FK would reject every real submission). Data verified clean (0 non-uuid, 0 orphan) before apply. Idempotent (IF NOT EXISTS / DO-block guards). |
| 00009_profiles_tutor_and_admin_request_visibility.sql | ✅ applied | 2026-07-13 | applied live by Lane B runner via direct pg ~09:30 CEST; verified: column exists (default t1), policy = (auth.uid() = user_id) OR is_admin(); e2e run 2 confirmed both fixes in the UI | Repair two live defects surfaced by the e2e suite: add `profiles.selected_tutor_id` when missing, and recreate `lesson_requests` SELECT policy with `public.is_admin()` so admin review can see user requests. Idempotent. |

## Connection method

`apply-migrations.js` connects directly via `postgresql://postgres:<pw>@db.gxlrmdfqcqimwwplrdgd.supabase.co:5432/postgres` (IPv6-reachable from the dev machine). The region-specific pooler host is NOT used (us-west-1 was wrong for this project → "tenant not found"). Requires `SUPABASE_DB_PASSWORD` in `.env.local`.

## Confirmed column-type facts (live DB, 2026-07-08)

- `profiles.selected_tutor_id` default = `'t1'` (not `'maria'` as older docs claimed)
- `video_suggestions.lesson_id` / `user_id` = **TEXT** (not UUID FK)
- `lesson_corrections.lesson_id` / `user_id` = **TEXT** (not UUID FK)
- `lesson_requests.user_id` = **UUID** (FK → auth.users(id) added by migration 00008; verified live 2026-07-10)
- `lessons.user_id` = UUID

## FK / index integrity (migration 00008, verified live 2026-07-10)

- Indexes added on `video_suggestions(user_id)`, `video_suggestions(lesson_id)`, `lesson_corrections(user_id)`, `lesson_corrections(lesson_id)`, `lesson_requests(user_id)`.
- `lesson_requests.user_id` FK to `auth.users(id)` now present (was declared inline in 00001 but never applied live — 00008's guard added it).
- `video_suggestions.user_id` / `lesson_corrections.user_id` remain **TEXT with NO FK** (deferred — RLS `::text` dependency; both tables empty). `*.lesson_id` remain **TEXT with NO FK** (static string lesson ids, not the lessons.id UUID). See the 00008 row for the full deferral rationale.
