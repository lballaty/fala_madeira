-- File: supabase/migrations/00017_audio_warm_cron.sql
-- Description: EN-34 §5 A4(i)/A5 — schedule the `audio-warm` edge function on a fixed cadence via
--   pg_cron → pg_net (net.http_post), plus a stall-alert companion. Two idempotent jobs:
--     * audio-warm-tick        — every 30 min: POST the audio-warm function so it drains the regen
--                                queue then warms the next batch of un-hosted clips. Coverage climbs
--                                with NO manual babysitting (the whole point of EN-34 vs the one-off
--                                warm that stalled at 83/527 and was forgotten).
--     * audio-warm-stall-check — every 30 min (offset): if the last K=3 `audio_warm_run` heartbeats
--                                all made ZERO progress (no uploads, no regen drained) and none ended
--                                on a benign stop_reason, write ONE `audio_warm_stall` ERROR to
--                                public.logs so a silent stall is never "forgotten" (G3).
--
--   SECRETS — NO HARDCODED URL OR KEY (observability/no-fallback standard): the function URL and the
--   caller secret are read from Supabase Vault at run time. Before/at apply the OPERATOR must set:
--     select vault.create_secret('https://<project-ref>.functions.supabase.co/audio-warm', 'audio_warm_url');
--     select vault.create_secret('<AUDIO_WARM_SECRET or the service-role key>',            'audio_warm_secret');
--   (audio-warm accepts `Authorization: Bearer <AUDIO_WARM_SECRET>` — preferred, least-privilege — or
--   the service-role key.) The tick job fails loudly (its net.http_post errors into net._http_response)
--   if a secret is missing, rather than silently POSTing an unauthenticated/blank request.
--
--   Idempotent (unschedule-then-schedule; create extension if not exists). NOT YET APPLIED — apply is
--   operator-gated (staging-first; the tts-audio bucket is shared prod+staging), same as 00016.
--   Cadence + K mirror the locked EN-34 defaults (§10 #4: --max 15 / 30 min; stall K=3).
--   Author: claude-opus-runner. Created: 2026-07-19.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) audio-warm-tick — POST the edge function every 30 minutes with the per-tick batch budget.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'audio-warm-tick') then
    perform cron.unschedule('audio-warm-tick');
  end if;
  perform cron.schedule(
    'audio-warm-tick',
    '*/30 * * * *',
    $cron$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'audio_warm_url'),
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'audio_warm_secret')
                   ),
        body    := jsonb_build_object('max', 15)
      );
    $cron$
  );
end $$;

-- 2) audio-warm-stall-check — K=3 zero-progress guard. Offset 15 min from the tick so it evaluates
--    after a tick has had time to run. Emits ONE ERROR when stalled (deduped: only if no stall alert
--    has been logged since the oldest of the 3 evaluated runs), so a stall surfaces without spamming.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'audio-warm-stall-check') then
    perform cron.unschedule('audio-warm-stall-check');
  end if;
  perform cron.schedule(
    'audio-warm-stall-check',
    '15,45 * * * *',
    $cron$
      with recent as (
        select (details::jsonb) as d, timestamp
        from public.logs
        where event_type = 'audio_warm_run'
        order by timestamp desc
        limit 3
      )
      insert into public.logs (event, event_type, level, category, details, timestamp)
      select
        'audio_warm_stall',
        'audio_warm_stall',
        'ERROR',
        'SYSTEM_HEALTH',
        jsonb_build_object(
          'message', 'audio-warm made zero progress for 3 consecutive runs — curated-audio coverage is stalled (check provider rate-limit / TB-13 key).',
          'runs', 3
        )::text,
        now()
      where (select count(*) from recent) >= 3
        -- every one of the last 3 runs made no progress and did not end benignly
        and not exists (
          select 1 from recent
          where coalesce((d->>'uploaded')::int, 0) > 0
             or coalesce((d->>'regen_drained')::int, 0) > 0
             or (d->>'stop_reason') in ('complete', 'idle', 'nothing_to_do')
        )
        -- dedupe: don't re-alert until a newer run batch has been evaluated
        and not exists (
          select 1 from public.logs
          where event_type = 'audio_warm_stall'
            and timestamp > (select min(timestamp) from recent)
        );
    $cron$
  );
end $$;
