# Migration Application Log

**File:** supabase/migrations/APPLIED.md
**Description:** Record of which migrations have been applied to the live Supabase project `gxlrmdfqcqimwwplrdgd` (PortugueseMadeira), when, and how. Supabase does not expose a reliable applied-migrations table for manually-run SQL, so this is the source of truth for application history.
**Author:** Libor Ballaty <libor@arionetworks.com>
**Created:** 2026-07-08
**Last Updated:** 2026-07-09
**Last Updated By:** tts-user-choice execution

| Migration | Applied | When | How | Notes |
|---|---|---|---|---|
| 00001_initial_schema.sql | ✅ (pre-existing) | before 2026-07-08 | unknown (dashboard or CLI) | All 8 tables + handle_new_user trigger confirmed live 2026-07-08. Re-run fails on non-idempotent policy CREATE — expected. |
| 00002_video_suggestions_policies.sql | ✅ (pre-existing) | before 2026-07-08 | unknown | Public-read policy for approved video_suggestions confirmed live. |
| 00003_profiles_columns_and_rls_fixes.sql | ✅ | 2026-07-08 | `node apply-migrations.js` (direct connection) | Adds is_admin() helper, conditional profile columns, ON CONFLICT trigger fix, hardened RLS. Idempotent (30 guards). |
| 00004_rls_gap_policies.sql | ✅ | 2026-07-08 | `node apply-migrations.js` (direct connection) | UPDATE policies for lesson_requests (uuid user_id) + lesson_corrections (text user_id), admin INSERT on global_settings, DELETE on profiles. Idempotent. |
| 00005_global_settings_seed.sql | ✅ | 2026-07-09 | `node apply-migrations.js` (direct connection) | Seeds `level_unlock_key = 'MADEIRA2026'` into global_settings (unlock key moved out of client source). ON CONFLICT DO NOTHING — never overwrites an operator-rotated key. Row verified live 2026-07-09. |
| 00006_content_model.sql | ✅ | 2026-07-09 | `node apply-migrations.js` (direct connection) | Modular content model (CONTENT-ARCHITECTURE §9): content_packs, situations, tracks (JSONB payloads) + user_track_selection, user_situation_progress, mastery_items (hear\|say\|retrieve\|avoid), missions_log, pronunciation_attempts, writing_submissions. Published-readable/admin-writable content RLS, owner RLS on user tables, shared set_updated_at() trigger fn. All 9 tables + RLS + policies + triggers + partial-unique active-track index verified live 2026-07-09. Idempotent. |
| 00007_tts_prefs.sql | ✅ | 2026-07-09 | `node apply-migrations.js` (direct connection) | Per-user TTS preference: `profiles.tts_provider` (CHECK azure\|gemini\|google\|elevenlabs\|openai\|polly or NULL) + `profiles.tts_byo_key_ref` (secret NAME reference only — raw keys never stored; column COMMENT states this). Both columns + CHECK constraint + COMMENTs verified live 2026-07-09 (information_schema.columns / pg_constraint). RLS: existing owner policies on profiles cover the new columns (pg_policies: "Users can update own profile" UPDATE) — no new policies. Idempotent. |

## Connection method

`apply-migrations.js` connects directly via `postgresql://postgres:<pw>@db.gxlrmdfqcqimwwplrdgd.supabase.co:5432/postgres` (IPv6-reachable from the dev machine). The region-specific pooler host is NOT used (us-west-1 was wrong for this project → "tenant not found"). Requires `SUPABASE_DB_PASSWORD` in `.env.local`.

## Confirmed column-type facts (live DB, 2026-07-08)

- `profiles.selected_tutor_id` default = `'t1'` (not `'maria'` as older docs claimed)
- `video_suggestions.lesson_id` / `user_id` = **TEXT** (not UUID FK)
- `lesson_corrections.lesson_id` / `user_id` = **TEXT** (not UUID FK)
- `lesson_requests.user_id` = **UUID**
- `lessons.user_id` = UUID
