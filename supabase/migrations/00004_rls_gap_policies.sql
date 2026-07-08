-- File: supabase/migrations/00004_rls_gap_policies.sql
-- Description: Close RLS coverage gaps found in the 2026-07-08 audit — add UPDATE
--   policies for admin review workflows and a DELETE policy on profiles. All
--   guarded with DROP POLICY IF EXISTS for idempotent re-runs and use the
--   null-safe public.is_admin() helper from migration 00003.
-- Author: Libor Ballaty <libor@arionetworks.com>
-- Created: 2026-07-08

-- lesson_requests: owner or admin may update (admin marks reviewed/implemented)
-- NB: lesson_requests.user_id is UUID (unlike lesson_corrections.user_id which is TEXT)
DROP POLICY IF EXISTS "Owner or admin can update lesson_requests" ON public.lesson_requests;
CREATE POLICY "Owner or admin can update lesson_requests"
  ON public.lesson_requests
  FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- lesson_corrections: owner or admin may update (admin resolves corrections)
DROP POLICY IF EXISTS "Owner or admin can update lesson_corrections" ON public.lesson_corrections;
CREATE POLICY "Owner or admin can update lesson_corrections"
  ON public.lesson_corrections
  FOR UPDATE
  USING (auth.uid()::text = user_id OR public.is_admin())
  WITH CHECK (auth.uid()::text = user_id OR public.is_admin());

-- global_settings: explicit admin INSERT (defence-in-depth alongside any ALL policy)
DROP POLICY IF EXISTS "Admins can insert global_settings" ON public.global_settings;
CREATE POLICY "Admins can insert global_settings"
  ON public.global_settings
  FOR INSERT
  WITH CHECK (public.is_admin());

-- profiles: owner or admin may delete (account-deletion path; the delete-account
-- edge function uses the service role which bypasses RLS, this is defence-in-depth)
DROP POLICY IF EXISTS "Owner or admin can delete profiles" ON public.profiles;
CREATE POLICY "Owner or admin can delete profiles"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id OR public.is_admin());
