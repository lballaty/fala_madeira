<?php
// File: deploy/verpex/audio-sync/config.example.php
// Description: EN-8 template for the Verpex audio-sync cron config. Copy to `config.php` ON THE
//   VERPEX BOX ONLY (never commit the real one), fill in the values, and `chmod 600 config.php`.
//   pull.php reads getenv() first, then this file — so you may instead set these as cPanel cron
//   environment variables and skip config.php entirely. NONE of these are secret Supabase service
//   creds: the anon key is public (shipped in the web bundle) and only grants read/list on the
//   public buffer bucket; AUDIO_SYNC_TOKEN is the one rotatable shared secret and MUST match the
//   edge function's AUDIO_SYNC_TOKEN env for that environment (staging and prod use DIFFERENT
//   tokens). Keep config.php out of the web root's served surface (it is PHP, so it never renders
//   its contents, but 600 perms + placement outside /audio are still required).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-16

return [
    // Public Supabase project base URL, e.g. https://gxlrmdfqcqimwwplrdgd.supabase.co
    'SUPABASE_URL'     => '',

    // Public anon key (NOT the service role key). Grants read/list on the public tts-audio bucket
    // via the tts_audio_public_read RLS policy (migration 00012). Safe to place here.
    'SUPABASE_ANON_KEY' => '',

    // Rotatable shared secret. MUST equal the edge function AUDIO_SYNC_TOKEN env for THIS environment.
    // Staging and production have SEPARATE tokens.
    'AUDIO_SYNC_TOKEN' => '',

    // Absolute path to the served /audio directory (REMOTE_PATH/audio), e.g.
    //   staging: /home/gomadeir/testfalamadeira.searchingfool.com/audio
    //   prod:    /home/gomadeir/falamadeira.searchingfool.com/audio
    'AUDIO_DIR'        => '',

    // Optional — defaults to SUPABASE_URL . '/functions/v1/log-sink'.
    // 'LOG_SINK_URL'   => '',

    // Optional — defaults to 'tts-audio' (must match migration 00012 + audioStore.ts + client config).
    // 'AUDIO_BUCKET'   => 'tts-audio',
];
