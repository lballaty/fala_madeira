-- File: supabase/migrations/00013_profiles_admin_select_update.sql
-- NOTE: renumbered 00012 -> 00013 to avoid colliding with EN-8's reserved 00012 (audio buffer).
--   Already applied live under the 00012 filename on 2026-07-15; re-applying is a safe no-op
--   (idempotent DROP IF EXISTS / CREATE). See APPLIED.md.
-- Description: Live-schema RLS repair for EN-15. The profiles SELECT and UPDATE policies live on
--   the current project as "Users can view own profile" / "Users can update own profile" with
--   only `auth.uid() = id` — they carry NO admin bypass (verified live via pg_policies
--   2026-07-15: admin sees only its own profile row; admin UPDATE of another profile affects 0
--   rows). This blocks the EN-15 admin "grant content access" control (look up a user by email +
--   set their subscription_tier/unlocked_level) and contradicts the 00001 doc claim that admins
--   can SELECT/UPDATE any profile. Recreate both policies with the null-safe public.is_admin()
--   SECURITY DEFINER helper (added in 00003, already used by the profiles DELETE policy "Owner or
--   admin can delete profiles" and by 00009's lesson_requests fix) so admins regain full-profile
--   SELECT + UPDATE without the self-referential RLS recursion the helper was built to avoid.
--   Idempotent (DROP ... IF EXISTS before CREATE). No column/data changes.
-- Author: Lane A (with assistant)
-- Created: 2026-07-15

-- SELECT: owner OR admin (mirrors the live DELETE policy pattern).
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

-- UPDATE: owner OR admin. WITH CHECK mirrors USING so an admin's write is not rejected on the
-- post-update row check.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());
