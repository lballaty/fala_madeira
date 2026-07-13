-- File: supabase/migrations/00009_profiles_tutor_and_admin_request_visibility.sql
-- Description: Live-schema reconciliation and RLS repair for two production defects surfaced by
--   the e2e suite: (1) ensure profiles.selected_tutor_id exists live so tutor selection persists,
--   and (2) ensure admins can SELECT lesson_requests in the Admin Review queue. Idempotent.
-- Author: Codex
-- Created: 2026-07-13

-- profiles.selected_tutor_id was declared in 00001 but is missing live on the current project.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'selected_tutor_id'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN selected_tutor_id text DEFAULT 't1';
  END IF;
END $$;

-- lesson_requests SELECT must include admin visibility. Recreate the policy with the null-safe
-- public.is_admin() helper so Admin Review can see other users' requests.
DROP POLICY IF EXISTS "Users can view their own requests" ON public.lesson_requests;
CREATE POLICY "Users can view their own requests"
  ON public.lesson_requests
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
