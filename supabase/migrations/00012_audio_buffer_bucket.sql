-- File: supabase/migrations/00012_audio_buffer_bucket.sql
-- Description: EN-8 — create the PUBLIC 'tts-audio' buffer bucket that stages pre-generated /
--   written-back TTS clips before the read-only Verpex pull cron copies them to /audio and
--   copy-confirms their deletion. Public read+list so the cron can pull with NO Supabase key;
--   writes/deletes are service-role only (RLS bypass — no INSERT/DELETE policy needed). A pg_cron
--   BACKSTOP reaps only true orphans older than 7 days (copy-confirmed deletion via the
--   audio-sync-confirm edge action is the PRIMARY reclaim path — COORD-2 ROBUSTNESS-1). Idempotent.
-- Author: Libor Ballaty (with assistant)
-- Created: 2026-07-15
-- NOT YET APPLIED: operator-gated. Lands in the SHARED prod DB (COORD-2 BLOCKING-2, owner-accepted).
--   Safe because runtime write-back is curated-only + env-flag-gated + non-blocking. Apply via the
--   Supabase Dashboard SQL editor (psql fails against cloud) once the Verpex feasibility spike is GO.

-- 1) Public buffer bucket (a small hot buffer; Verpex is the durable home).
insert into storage.buckets (id, name, public)
values ('tts-audio', 'tts-audio', true)
on conflict (id) do update set public = true;

-- 2) RLS: anon + authenticated may READ and LIST the buffer (the Verpex cron pulls with the anon
--    key, no service key). All writes/deletes go through the service role, which bypasses RLS, so
--    no INSERT/DELETE policy is created (that keeps the anonymous surface read-only).
drop policy if exists "tts_audio_public_read" on storage.objects;
create policy "tts_audio_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'tts-audio');

-- 3) pg_cron BACKSTOP ONLY: copy-confirmed deletion (the edge audio-sync-confirm action) is the
--    primary reclaim; this daily job removes only objects the cron never confirmed within 7 days,
--    so the buffer can never accumulate cost from a stalled cron. Idempotent re-schedule.
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'tts-audio-orphan-backstop') then
    perform cron.unschedule('tts-audio-orphan-backstop');
  end if;
  perform cron.schedule(
    'tts-audio-orphan-backstop',
    '0 3 * * *',
    $cron$ delete from storage.objects
           where bucket_id = 'tts-audio'
             and created_at < now() - interval '7 days' $cron$
  );
end $$;
