// File: supabase/functions/_shared/audioStore.ts
// Description: Service-role helpers for the EN-8 TTS audio BUFFER bucket (public 'tts-audio').
//   uploadTtsClip() upserts a freshly-synthesized clip so the read-only Verpex pull cron can later
//   copy it to /audio and confirm deletion; deleteConfirmed() removes clips the cron reported it
//   copied (COORD-2 ROBUSTNESS-1 copy-confirmed deletion). BOTH are best-effort by contract: they
//   NEVER throw (a failure must not break the TTS response or the sync endpoint) and persist every
//   failure to public.logs (WARN) with the request/correlation/trace IDs. deleteConfirmed is
//   HARD-SCOPED to this bucket and to keyToServerPath-shaped object names, so a leaked sync token
//   can never delete other buckets/paths (Lane A token-hardening review).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-15

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { persistLog } from "./persistLog.ts";

// MUST match migration 00012_audio_buffer_bucket.sql and the client config.audio.supabaseAudioBucket.
export const AUDIO_BUCKET = "tts-audio";

// The ONLY object-name shape keyToServerPath() produces: [a-z0-9_]+ then '.pcm'. No '/', no '..',
// no ':' — so a name matching this can never traverse outside the bucket. Every write/delete is
// gated on this pattern as defense-in-depth (never trust a name from the network).
const OBJECT_RE = /^[a-z0-9_]+\.pcm$/i;

// Hard cap on a single copy-confirmed delete batch (bounds a hostile/oversized payload).
const MAX_DELETE_BATCH = 500;

export interface AudioStoreCtx {
  requestId: string;
  correlationId?: string;
  traceId?: string;
  userId?: string | null;
}

let cached: SupabaseClient | null = null;
const adminClient = (): SupabaseClient | null => {
  if (cached) return cached;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  cached = createClient(url, serviceKey);
  return cached;
};

const bytesFromBase64 = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const warn = (eventType: string, message: string, ctx: AudioStoreCtx, details?: Record<string, unknown>) =>
  persistLog({
    level: "WARN",
    category: "DATA_PROCESSING",
    eventType,
    message,
    requestId: ctx.requestId,
    correlationId: ctx.correlationId ?? ctx.requestId,
    traceId: ctx.traceId,
    userId: ctx.userId ?? null,
    details,
  });

/**
 * Upsert one hosted clip (raw PCM) into the public buffer bucket. Best-effort: returns without
 * throwing on any failure, persisting a WARN so the miss is visible in public.logs. `objectPath`
 * MUST be a keyToServerPath name (validated here); `pcmBase64` is the provider's base64 PCM.
 */
export async function uploadTtsClip(objectPath: string, pcmBase64: string, ctx: AudioStoreCtx): Promise<void> {
  try {
    if (!OBJECT_RE.test(objectPath)) {
      await warn("tts_writeback_bad_path", "TTS write-back rejected an unsafe object name.", ctx, { objectPath });
      return;
    }
    const admin = adminClient();
    if (!admin) {
      await warn("tts_writeback_unconfigured", "TTS write-back skipped: service-role client unavailable.", ctx, { objectPath });
      return;
    }
    const { error } = await admin.storage.from(AUDIO_BUCKET).upload(objectPath, bytesFromBase64(pcmBase64), {
      contentType: "application/octet-stream",
      upsert: true,
    });
    if (error) {
      await warn("tts_writeback_failed", "TTS write-back upload failed (best-effort; clip still served).", ctx, {
        objectPath,
        reason: error.message,
      });
    }
  } catch (e) {
    await warn("tts_writeback_threw", "TTS write-back threw (best-effort; clip still served).", ctx, {
      objectPath,
      reason: String(e),
    });
  }
}

/**
 * Copy-confirmed deletion: remove the objects the Verpex pull cron reported it copied to /audio.
 * HARD-SCOPED to AUDIO_BUCKET and to keyToServerPath-shaped names — any other name is rejected
 * (logged, not deleted), so a leaked sync token cannot reach another bucket/path. Best-effort:
 * never throws. Returns how many were deleted vs rejected for the caller's heartbeat summary.
 */
export async function deleteConfirmed(
  objectPaths: unknown,
  ctx: AudioStoreCtx,
): Promise<{ deleted: number; rejected: number }> {
  const list = Array.isArray(objectPaths) ? objectPaths.slice(0, MAX_DELETE_BATCH) : [];
  const safe = list.filter((p): p is string => typeof p === "string" && OBJECT_RE.test(p));
  const rejected = list.length - safe.length;
  if (rejected > 0) {
    await warn("audio_sync_rejected_keys", "Copy-confirm delete rejected unsafe object name(s).", ctx, { rejected });
  }
  if (safe.length === 0) return { deleted: 0, rejected };

  try {
    const admin = adminClient();
    if (!admin) {
      await warn("audio_sync_unconfigured", "Copy-confirm delete skipped: service-role client unavailable.", ctx, {});
      return { deleted: 0, rejected };
    }
    const { data, error } = await admin.storage.from(AUDIO_BUCKET).remove(safe);
    if (error) {
      await warn("audio_sync_delete_failed", "Copy-confirm delete failed (best-effort).", ctx, { reason: error.message });
      return { deleted: 0, rejected };
    }
    return { deleted: data?.length ?? safe.length, rejected };
  } catch (e) {
    await warn("audio_sync_delete_threw", "Copy-confirm delete threw (best-effort).", ctx, { reason: String(e) });
    return { deleted: 0, rejected };
  }
}
