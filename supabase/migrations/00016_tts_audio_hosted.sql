-- File: supabase/migrations/00016_tts_audio_hosted.sql
-- Description: EN-34 hosted-audio manifest. One row per curated clip that has been hosted, recording
--   WHAT is hosted and at WHICH generation — decoupling "what's hosted" from the transient tts-audio
--   buffer bucket. This is the source of truth for the versioned-regeneration loop (§11):
--     * generation      — per-key version. 1 = the legacy unversioned object name (the ~83 clips
--                         already hosted are generation 1 and need no re-host). An admin re-record
--                         (audio panel Enqueue-for-regeneration → audio-warm edge fn) bumps it, and
--                         the object is re-hosted at <base>.v<generation>.pcm (src/lib/audioKey.ts
--                         keyToServerPath), busting every cache layer.
--     * object_name     — the keyToServerPath(build_key, generation) name actually written.
--     * tiers           — which store(s) currently hold this generation ('bucket','verpex').
--   RLS (mirrors the tts_audio_* pattern for WRITES; RELAXED for reads — see below):
--     * SELECT is granted to anon + authenticated (USING true). DELIBERATE divergence from the
--       admin-only tts_audio_review policy: the browser client reads (build_key, generation) with the
--       USER's JWT to resolve each clip's current generation (src/lib/audioManifest.ts) so a
--       regenerated clip busts the device/URL cache. The data is non-sensitive PUBLIC curated-content
--       metadata (a text hash + an int + an object name) — no PII, no free-chat text — so a public
--       read is safe and is REQUIRED for the client cache-bust to work for every user.
--     * INSERT/UPDATE are admin-only (public.is_admin(), the 00003 SECURITY DEFINER helper). The
--       audio-warm edge function writes with the SERVICE ROLE, which bypasses RLS.
--   Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), append-only, same shape as 00014.
--   NOT YET APPLIED — apply is operator-gated (staging-first; the tts-audio bucket is shared
--   prod+staging). Numbering: next free after 00015. Author: claude-opus-runner. Created: 2026-07-19.

-- ---------------------------------------------------------------------------
-- tts_audio_hosted
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tts_audio_hosted (
  build_key    text PRIMARY KEY,
  generation   integer NOT NULL DEFAULT 1 CHECK (generation >= 1),
  object_name  text,
  hosted_at    timestamptz NOT NULL DEFAULT now(),
  tiers        text[] NOT NULL DEFAULT '{}'
);

-- Partial index matching the client manifest query (select build_key, generation WHERE generation
-- >= 2): only the regenerated exceptions are indexed, so the lookup stays tiny — empty until the
-- first re-record, one entry per regenerated clip thereafter.
CREATE INDEX IF NOT EXISTS tts_audio_hosted_regenerated_idx
  ON public.tts_audio_hosted (build_key)
  WHERE generation >= 2;

ALTER TABLE public.tts_audio_hosted ENABLE ROW LEVEL SECURITY;

-- Public read (see header): non-sensitive curated-content metadata the client needs for cache-bust.
DROP POLICY IF EXISTS "Anyone can read hosted manifest" ON public.tts_audio_hosted;
CREATE POLICY "Anyone can read hosted manifest"
  ON public.tts_audio_hosted FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes are admin-only via RLS; the audio-warm edge fn writes with the service role (bypasses RLS).
DROP POLICY IF EXISTS "Admins can insert hosted manifest" ON public.tts_audio_hosted;
CREATE POLICY "Admins can insert hosted manifest"
  ON public.tts_audio_hosted FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update hosted manifest" ON public.tts_audio_hosted;
CREATE POLICY "Admins can update hosted manifest"
  ON public.tts_audio_hosted FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
