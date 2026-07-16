# EN-8 Verpex Audio-Sync Cron

**File:** deploy/verpex/audio-sync/README.md
**Description:** Operator guide for the read-only Verpex reconciliation cron (`pull.php`) that copies pre-generated / written-back TTS clips from the public Supabase `tts-audio` buffer to the durable Verpex `/audio` store, then copy-confirms deletion from the buffer.
**Author:** Libor Ballaty (with assistant)
**Created:** 2026-07-16
**Last Updated:** 2026-07-16
**Last Updated By:** EN-8 Phase 6

## What this is

The EN-8 lookup order is `device cache → device pinned → Verpex /audio → Supabase buffer → provider`. The edge `tts` write-back and the pre-gen script stage clips into the **public Supabase `tts-audio` bucket** (a small hot buffer). This cron is the durable-home leg: it pulls each buffered clip onto the Verpex box under `REMOTE_PATH/audio/` and then tells the edge to delete only the clips it confirmed present on Verpex. Verpex is the source of truth; Supabase stays small.

- **Read-only against Supabase:** uses the **public anon key** (no service key) to list + GET the public bucket.
- **Copy-confirmed deletion (COORD-2 ROBUSTNESS-1):** deletion happens edge-side via the `audio-sync-confirm` action, gated by the rotatable `AUDIO_SYNC_TOKEN`, and only for names this cron reports it copied.
- **Idempotent:** a clip already present on Verpex with the right byte length is re-confirmed (so the buffer copy is reclaimed) but never re-downloaded.
- **Path-traversal-hardened:** object names must match `^[a-z0-9_]+\.pcm$` (the only shape `keyToServerPath()` emits).
- **Bounded:** connect/read timeouts on every call; ≤500 keys confirmed per run.
- **Observable:** each run POSTs an INFO heartbeat (via `audio-sync-confirm`) to `public.logs`; hard failures also POST an ERROR event and exit non-zero (cPanel cron mail).

## Prerequisites (sequencing — COORD-2 BLOCKING-2)

Deploy this cron on **both** staging and prod **before** the `TTS_BUFFER_WRITEBACK` flag is flipped, so nothing accumulates unreclaimed in the buffer. Order:

1. Apply migration `00012_audio_buffer_bucket.sql` (Supabase Dashboard SQL editor).
2. Deploy edge functions `gemini` + `log-sink`; set `AUDIO_SYNC_TOKEN` (a distinct value per environment).
3. Install this cron on staging **and** prod (below).
4. Only then flip `TTS_BUFFER_WRITEBACK=on`.

## Install (operator-run, per environment)

> **Governance:** any write to the Verpex box or Supabase is operator-gated and staging-first. Present the plan and get explicit approval before running these on a live box.

```sh
# 1. Copy the script into a NON-SPA-fallback location at the web root.
#    Canonical served path: https://<host>/audio-sync/pull.php
mkdir -p <REMOTE_PATH>/audio-sync
scp deploy/verpex/audio-sync/pull.php  <VERPEX_USER>@<VERPEX_HOST>:<REMOTE_PATH>/audio-sync/pull.php

# 2. Create config.php on the box from the template, fill it in, lock it down.
scp deploy/verpex/audio-sync/config.example.php <VERPEX_USER>@<VERPEX_HOST>:<REMOTE_PATH>/audio-sync/config.php
#   then edit <REMOTE_PATH>/audio-sync/config.php  (SUPABASE_URL, SUPABASE_ANON_KEY,
#   AUDIO_SYNC_TOKEN, AUDIO_DIR=<REMOTE_PATH>/audio) and:
chmod 600 <REMOTE_PATH>/audio-sync/config.php

# 3. Smoke-test on the box (CLI needs no token):
php <REMOTE_PATH>/audio-sync/pull.php

# 4. Register the cPanel cron (every 15 minutes):
#    */15 * * * *  php <REMOTE_PATH>/audio-sync/pull.php >/dev/null 2>&1
```

`AUDIO_DIR` **must** be `<REMOTE_PATH>/audio` — the same dir the client fetches from (`VITE_AUDIO_VERPEX_BASE`, default `/audio`) and the same dir `scripts/deploy-verpex.sh` now excludes from `rsync --delete` so a web deploy never wipes hosted audio.

## Web invocation

`pull.php` runs headless via CLI cron. If invoked over HTTP it requires the token
(`?token=<AUDIO_SYNC_TOKEN>` or an `x-audio-sync-token` header) and returns **403** otherwise —
an anonymous web caller can never trigger a reconciliation run. (Plan validation curls it expecting
`200|403`.)

## Config keys

See `config.example.php`. `SUPABASE_ANON_KEY` is the **public** key (safe on the box); the only real
secret is `AUDIO_SYNC_TOKEN`, which must match the edge function env for that environment and is
**distinct** for staging vs prod.

## Failure modes & recovery

| Symptom | Cause | Recovery |
|---|---|---|
| Exit 2, `verpex_pull_unconfigured` | missing config key | fill `config.php` / cron env |
| Exit 1, `verpex_pull_list_failed` | anon list blocked / bucket missing | confirm migration 00012 applied + bucket public |
| `download_failed` / `size_mismatch` per clip | transient buffer/network | clip stays in buffer; next run retries |
| `confirm_failed` | token mismatch / edge down | buffer NOT reclaimed this run; next run re-confirms; 7-day pg_cron backstop is the final net |

The 7-day `pg_cron` orphan backstop (migration 00012) reaps anything the cron never confirms, so a
stalled cron can never accumulate unbounded buffer cost.
