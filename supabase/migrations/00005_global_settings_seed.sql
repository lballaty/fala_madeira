-- File: supabase/migrations/00005_global_settings_seed.sql
-- Description: Seed the level_unlock_key row in public.global_settings. Moves the level
--   unlock key out of client source (ENGINEERING-STANDARDS §7 — no secret-like unlock
--   constants in code). The client (useLessons.handleUnlockLevel) reads this row at unlock
--   time and DENIES the unlock if it is unreachable or missing — there is no hardcoded
--   fallback key.
-- Author: Libor Ballaty <libor@arionetworks.com>
-- Created: 2026-07-09

-- 'MADEIRA2026' is only the seeded INITIAL value (matching the key that was previously
-- hardcoded, so existing instructor-distributed keys keep working). The operator rotates
-- it directly in the DB (admin RLS: "Admins can manage global settings"):
--   UPDATE public.global_settings SET value = '<new-key>', updated_at = now()
--   WHERE key = 'level_unlock_key';
-- Idempotent: ON CONFLICT DO NOTHING means re-running this migration NEVER overwrites an
-- operator-rotated key.
INSERT INTO public.global_settings (key, value)
VALUES ('level_unlock_key', 'MADEIRA2026')
ON CONFLICT (key) DO NOTHING;
