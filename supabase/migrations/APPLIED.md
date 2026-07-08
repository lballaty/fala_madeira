# Migration Application Log

**File:** supabase/migrations/APPLIED.md
**Description:** Record of which migrations have been applied to the live Supabase project `gxlrmdfqcqimwwplrdgd` (PortugueseMadeira), when, and how. Supabase does not expose a reliable applied-migrations table for manually-run SQL, so this is the source of truth for application history.
**Author:** Libor Ballaty <libor@arionetworks.com>
**Created:** 2026-07-08
**Last Updated:** 2026-07-08
**Last Updated By:** production-readiness execution

| Migration | Applied | When | How | Notes |
|---|---|---|---|---|
| 00001_initial_schema.sql | ✅ (pre-existing) | before 2026-07-08 | unknown (dashboard or CLI) | All 8 tables + handle_new_user trigger confirmed live 2026-07-08. Re-run fails on non-idempotent policy CREATE — expected. |
| 00002_video_suggestions_policies.sql | ✅ (pre-existing) | before 2026-07-08 | unknown | Public-read policy for approved video_suggestions confirmed live. |
| 00003_profiles_columns_and_rls_fixes.sql | ✅ | 2026-07-08 | `node apply-migrations.js` (direct connection) | Adds is_admin() helper, conditional profile columns, ON CONFLICT trigger fix, hardened RLS. Idempotent (30 guards). |
| 00004_rls_gap_policies.sql | ✅ | 2026-07-08 | `node apply-migrations.js` (direct connection) | UPDATE policies for lesson_requests (uuid user_id) + lesson_corrections (text user_id), admin INSERT on global_settings, DELETE on profiles. Idempotent. |

## Connection method

`apply-migrations.js` connects directly via `postgresql://postgres:<pw>@db.gxlrmdfqcqimwwplrdgd.supabase.co:5432/postgres` (IPv6-reachable from the dev machine). The region-specific pooler host is NOT used (us-west-1 was wrong for this project → "tenant not found"). Requires `SUPABASE_DB_PASSWORD` in `.env.local`.

## Confirmed column-type facts (live DB, 2026-07-08)

- `profiles.selected_tutor_id` default = `'t1'` (not `'maria'` as older docs claimed)
- `video_suggestions.lesson_id` / `user_id` = **TEXT** (not UUID FK)
- `lesson_corrections.lesson_id` / `user_id` = **TEXT** (not UUID FK)
- `lesson_requests.user_id` = **UUID**
- `lessons.user_id` = UUID
