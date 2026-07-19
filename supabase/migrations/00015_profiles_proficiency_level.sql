-- File: supabase/migrations/00015_profiles_proficiency_level.sql
-- Description: TB-1 (Option B) — add public.profiles.proficiency_level, the learner's self-described
--   practical/placement level, WHOLLY SEPARATE from the paywall unlocked_level (docs/
--   TB-1-PROFICIENCY-LEVEL-REQUIREMENTS.md §2 separation invariant: proficiency_level ⟂ unlocked_level).
--   Written from onboarding placement (PracticalLevel 0/1/2 today; the column is not capped so the
--   full 0..5 practical domain — src/content/schema.ts — is forward-usable) and from the Settings
--   "Your level" control. Nullable with NO default: null = "not yet placed", the honest neutral state
--   (§4/§6). We do NOT default to 0 — that would fabricate "complete beginner" for existing rows that
--   never placed. Owner-writable under the existing profiles self-update RLS (same policy that already
--   lets a user write has_accepted_terms etc. via .eq('id', user.id)); no new grant is needed.
--   Additive + idempotent (ADD COLUMN IF NOT EXISTS), safe on the live table — matches the house
--   style of 00011_profiles_consent_and_activity_columns.sql. No change to unlocked_level.
-- Author: TB-1 Option B (proficiency_level)
-- Created: 2026-07-19

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS proficiency_level smallint;
