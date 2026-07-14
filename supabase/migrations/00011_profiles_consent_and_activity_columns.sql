-- File: supabase/migrations/00011_profiles_consent_and_activity_columns.sql
-- Description: PF-13 fix — reconcile live prod schema drift on public.profiles. Four columns
--   defined in 00001_initial_schema.sql never made it onto the live prod table (confirmed missing
--   via information_schema 2026-07-14), so the client's writes to them silently failed (PGRST204 /
--   400). Two are GDPR consent flags (has_accepted_terms, has_accepted_ai_usage) that the signup +
--   onboarding flows write — meaning consent was not being persisted, a compliance gap. This
--   migration re-adds all four with the SAME types + defaults as 00001. Additive + idempotent
--   (ADD COLUMN IF NOT EXISTS), safe on the live table; existing rows take the column default.
--   Consent flags default to false (we do NOT fabricate prior consent) — existing users re-affirm
--   via the normal onboarding/consent path.
-- Author: PF-13 remediation (schema drift)
-- Created: 2026-07-14

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_accepted_terms boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_accepted_ai_usage boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_time_spent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_month integer DEFAULT 1;
