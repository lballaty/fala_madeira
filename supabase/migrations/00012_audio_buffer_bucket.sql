-- File: supabase/migrations/00012_audio_buffer_bucket.sql
-- Description: EN-8 — create the PUBLIC 'tts-audio' buffer bucket that stages pre-generated /
--   written-back TTS clips before the read-only Verpex pull cron copies them to /audio and
--   copy-confirms their deletion. Public read+list so the cron can pull with NO Supabase key;
--   writes/deletes are service-role only (RLS bypass — no INSERT/DELETE policy needed). A pg_cron
--   BACKSTOP reaps only true orphans older than 7 days (copy-confirmed deletion via the
--   audio-sync-confirm edge action is the PRIMARY reclaim path — COORD-2 ROBUSTNESS-1). Idempotent.
-- Author: Libor Ballaty (with assistant)
-- Created: 2026-07-15
-- APPLIED 2026-07-16 to the SHARED prod DB (gxlrmdfqcqimwwplrdgd) via `node apply-migrations.js`
--   (owner-approved EN-8 staging trial; COORD-2 BLOCKING-2 accepted). Idempotent; safe because runtime
--   write-back is curated-only + env-flag-gated (TTS_BUFFER_WRITEBACK=OFF) + non-blocking.
-- VERIFIED LIVE 2026-07-19 via scripts/verify-migration-00012.mjs (Supabase Management API):
--   storage.buckets id=tts-audio public=true; policy tts_audio_public_read on storage.objects
--   (SELECT → anon,authenticated); pg_cron installed; cron.job tts-audio-orphan-backstop
--   schedule '0 3 * * *' active=true. See supabase/migrations/APPLIED.md (row 00012).

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
