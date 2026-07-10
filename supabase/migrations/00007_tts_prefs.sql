-- File: supabase/migrations/00007_tts_prefs.sql
-- Description: Per-user TTS provider preference (T4). Adds profiles.tts_provider (which
--   registered provider the user prefers; NULL = platform default chain azure -> gemini,
--   see supabase/functions/_shared/tts/router.ts) and profiles.tts_byo_key_ref — a
--   REFERENCE (edge-secret / Supabase Vault secret NAME) to a bring-your-own provider key
--   that an admin registers server-side. The raw key value must NEVER be stored in this
--   column or anywhere else in the database. RLS: no new policies needed — the existing
--   owner policies on profiles cover these columns (verified live 2026-07-09 via
--   pg_policies: "Users can update own profile" UPDATE, owner SELECT/INSERT, owner/admin
--   DELETE from 00004). Idempotent (ADD COLUMN IF NOT EXISTS; COMMENT ON is naturally
--   re-runnable).
-- Author: Libor Ballaty <libor@arionetworks.com>
-- Created: 2026-07-09

-- Preferred TTS provider. NULL = use the platform default chain. The CHECK mirrors the
-- ProviderId union in supabase/functions/_shared/tts/types.ts.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS tts_provider text NULL
    CHECK (
        tts_provider IN ('azure', 'gemini', 'google', 'elevenlabs', 'openai', 'polly')
        OR tts_provider IS NULL
    );

-- Bring-your-own-key REFERENCE: the NAME of a Supabase edge-function secret (or Vault
-- secret) that an admin registers out-of-band. The edge function resolves it via
-- Deno.env.get(<ref>); a stale/unresolvable ref is logged as WARN and the default chain
-- is used — TTS never hard-fails on a bad ref.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS tts_byo_key_ref text NULL;

COMMENT ON COLUMN public.profiles.tts_provider IS
    'Preferred TTS provider id (azure|gemini|google|elevenlabs|openai|polly). NULL = platform default chain (azure -> gemini).';

COMMENT ON COLUMN public.profiles.tts_byo_key_ref IS
    'SECURITY: reference ONLY — the NAME of an admin-registered edge/Vault secret holding the user''s bring-your-own provider key. Raw API keys must NEVER be stored in this column.';
