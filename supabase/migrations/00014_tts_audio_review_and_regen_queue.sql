-- File: supabase/migrations/00014_tts_audio_review_and_regen_queue.sql
-- Description: EN-23 admin audio-management panel data model. Two admin-scoped tables backing the
--   review->verdict->enqueue loop over EN-8 pre-generated TTS clips:
--     * tts_audio_review     — one row per reviewed clip: verdict + automated signals (byte/type/
--                              duration + silence/loudness scoring) + reviewer + notes.
--     * tts_audio_regen_queue — clips flagged for (re)generation; consumed by pregen-audio.mjs
--                              --from-queue (service-role) once EN-8 lands. status lifecycle
--                              pending -> claimed -> done|failed.
--   RLS: admin-only SELECT/INSERT/UPDATE via the null-safe public.is_admin() SECURITY DEFINER
--   helper (added in 00003, same pattern as 00009/00013). The CLI consumer uses the service-role
--   key which bypasses RLS. No PII: clip text is public course content.
--   Numbering: 00012 is EN-8's reserved audio-buffer migration (not yet on develop); 00013 exists
--   (EN-15 profiles admin RLS). This is the next free number (00014). Idempotent (IF NOT EXISTS /
--   DROP POLICY IF EXISTS). Author: claude-en23. Created: 2026-07-17.

-- ---------------------------------------------------------------------------
-- tts_audio_review
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tts_audio_review (
  build_key            text PRIMARY KEY,
  voice                text NOT NULL,
  text                 text NOT NULL,
  situation_id         text,
  level                smallint,
  verdict              text NOT NULL DEFAULT 'unreviewed'
                         CHECK (verdict IN ('good', 'bad', 're_record', 'unreviewed')),
  -- Automated basic signals.
  signal_bytes         integer,
  signal_content_type  text,
  signal_duration_ms   integer,
  signal_suspicious    boolean NOT NULL DEFAULT false,
  -- Automated silence/loudness scoring (Web Audio; pulled forward from §8 per owner 2026-07-17).
  signal_rms_dbfs      real,
  signal_peak_dbfs     real,
  signal_silent_ratio  real,
  signal_silent        boolean NOT NULL DEFAULT false,
  signal_dead_air_ms   integer,
  signal_scored_at     timestamptz,
  -- Reviewer + notes.
  reviewed_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tts_audio_review_level_situation_idx
  ON public.tts_audio_review (level, situation_id);
CREATE INDEX IF NOT EXISTS tts_audio_review_verdict_idx
  ON public.tts_audio_review (verdict);

ALTER TABLE public.tts_audio_review ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audio review" ON public.tts_audio_review;
CREATE POLICY "Admins can read audio review"
  ON public.tts_audio_review FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert audio review" ON public.tts_audio_review;
CREATE POLICY "Admins can insert audio review"
  ON public.tts_audio_review FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update audio review" ON public.tts_audio_review;
CREATE POLICY "Admins can update audio review"
  ON public.tts_audio_review FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- tts_audio_regen_queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tts_audio_regen_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_key     text NOT NULL,
  voice         text NOT NULL,
  text          text NOT NULL,
  situation_id  text,
  level         smallint,
  reason        text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'claimed', 'done', 'failed')),
  enqueued_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  completed_at  timestamptz
);

-- A clip should only have one live (pending/claimed) queue entry at a time; historical
-- done/failed rows are unconstrained so re-enqueue after a failed pass is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS tts_audio_regen_queue_live_build_key_idx
  ON public.tts_audio_regen_queue (build_key)
  WHERE status IN ('pending', 'claimed');
CREATE INDEX IF NOT EXISTS tts_audio_regen_queue_status_idx
  ON public.tts_audio_regen_queue (status);

ALTER TABLE public.tts_audio_regen_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read regen queue" ON public.tts_audio_regen_queue;
CREATE POLICY "Admins can read regen queue"
  ON public.tts_audio_regen_queue FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert regen queue" ON public.tts_audio_regen_queue;
CREATE POLICY "Admins can insert regen queue"
  ON public.tts_audio_regen_queue FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update regen queue" ON public.tts_audio_regen_queue;
CREATE POLICY "Admins can update regen queue"
  ON public.tts_audio_regen_queue FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
