// File: supabase/functions/log-sink/index.ts
// Description: Service-role log sink for the client-side logger (OBSERVABILITY-CONTRACT §6/§7).
//   Accepts a batched array of client log events — INCLUDING anonymous / pre-auth events where
//   user_id is null — and inserts them into public.logs with the service-role client (RLS
//   bypassed). This is the write path that removes the auth.uid() = user_id limitation, so the
//   highest-severity class of events (boot failures, the pre-sign-in auth-lock stall) is finally
//   persisted. Payloads are size- and count-capped, and best-effort per-IP throttled, to keep the
//   anonymous-writable surface from being abused. Errors return the shared errorResponse envelope.
// Author: Observability plan (obs-log-sink)
// Created: 2026-07-14

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, errorResponse, jsonResponse, newRequestId } from "../_shared/http.ts";
import { deleteConfirmed } from "../_shared/audioStore.ts";
import { buildLogRows, MAX_BODY_BYTES, validateEventsBatch } from "./rows.ts";

// EN-8: cap on keys accepted per copy-confirm run (audioStore also hard-caps; this rejects early).
const MAX_SYNC_KEYS = 500;

/**
 * EN-8 copy-confirmed deletion endpoint (COORD-2 ROBUSTNESS-1). The read-only Verpex pull cron POSTs
 * { action: 'audio-sync-confirm', keys: [<keyToServerPath names copied to /audio>], summary } authed
 * by a ROTATABLE shared secret (AUDIO_SYNC_TOKEN env; never committed). We delete only the confirmed
 * keys from the tts-audio buffer (deleteConfirmed hard-scopes to that bucket + safe names) and write
 * an INFO heartbeat so a staleness alert can fire if the cron stops reporting. Fails LOUD (503) when
 * the token is unset — the delete surface is never open by default.
 */
async function handleAudioSyncConfirm(
  req: Request,
  body: { keys?: unknown; summary?: unknown },
  requestId: string,
  now: number,
): Promise<Response> {
  const expected = Deno.env.get("AUDIO_SYNC_TOKEN");
  if (!expected) {
    console.error(JSON.stringify({ level: "ERROR", requestId, event: "audio_sync_token_unset" }));
    return errorResponse("AUDIO_SYNC_UNCONFIGURED", "Audio sync is not configured.", 503, requestId);
  }
  if ((req.headers.get("x-audio-sync-token") ?? "") !== expected) {
    return errorResponse("UNAUTHENTICATED", "Invalid audio-sync token.", 401, requestId);
  }

  const keys = Array.isArray(body.keys) ? body.keys.slice(0, MAX_SYNC_KEYS) : [];
  const result = await deleteConfirmed(keys, { requestId, correlationId: requestId, userId: null });

  // INFO heartbeat via a direct insert (persistLog is WARN+ only): "the cron ran + what it did".
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  const { error } = await admin.from("logs").insert({
    event: "audio_sync_run",
    event_type: "audio_sync_run",
    level: "INFO",
    category: "DATA_PROCESSING",
    request_id: requestId,
    correlation_id: requestId,
    details: JSON.stringify({
      message: "Verpex audio pull cron reported a copy-confirm run",
      reported: keys.length,
      deleted: result.deleted,
      rejected: result.rejected,
      summary: typeof body.summary === "object" && body.summary ? body.summary : undefined,
    }),
    device_info: "verpex-cron",
    timestamp: new Date(now).toISOString(),
  });
  if (error) {
    console.error(JSON.stringify({ level: "ERROR", requestId, event: "audio_sync_heartbeat_failed", message: error.message }));
  }

  return jsonResponse({ deleted: result.deleted, rejected: result.rejected, requestId });
}

// Best-effort in-memory per-IP throttle. Edge instances are ephemeral, so this is a soft
// backstop per warm instance, not a global guarantee — the hard guarantees are the size/count
// caps above. Sliding window: MAX_REQ requests per WINDOW_MS.
const WINDOW_MS = 60_000;
const MAX_REQ_PER_WINDOW = 60;
const ipHits = new Map<string, number[]>();

const throttled = (ip: string, now: number): boolean => {
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > MAX_REQ_PER_WINDOW;
};

Deno.serve(async (req) => {
  const requestId = newRequestId();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Use POST.", 405, requestId);
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  // now is request-scoped; Date.now is available in the Deno edge runtime.
  const now = Date.now();
  if (throttled(ip, now)) {
    return errorResponse("RATE_LIMITED", "Too many log submissions.", 429, requestId);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return errorResponse("PAYLOAD_TOO_LARGE", "Log batch too large.", 413, requestId);
  }

  let body: { events?: unknown; action?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON body.", 400, requestId);
  }

  // EN-8: the Verpex pull cron reuses this throttled, service-role endpoint for copy-confirmed
  // deletion, authed by a shared token (not the client log-event path below).
  if (body && typeof body === "object" && body.action === "audio-sync-confirm") {
    return await handleAudioSyncConfirm(req, body as { keys?: unknown; summary?: unknown }, requestId, now);
  }

  // Batch caps + shape validation (pure — see rows.ts).
  const verdict = validateEventsBatch(body);
  if (!verdict.ok) {
    return errorResponse(verdict.code, verdict.message, verdict.status, requestId);
  }
  if ("empty" in verdict && verdict.empty) {
    return jsonResponse({ inserted: 0, requestId });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Map validated events to public.logs rows (pure — see rows.ts).
  const rows = buildLogRows(verdict.events, {
    deviceInfo: req.headers.get("user-agent") ?? "unknown",
    nowMs: now,
  });

  const { error } = await admin.from("logs").insert(rows);
  if (error) {
    // The sink's own failure is server-side; surface a structured envelope. Console is the
    // sink-of-last-resort here (we cannot recurse into the sink to log the sink's failure).
    console.error(JSON.stringify({ level: "ERROR", requestId, event: "log_sink_insert_failed", message: error.message }));
    // EN-27 P2: do NOT leak the raw DB error (schema/constraint internals) to the client. Ops gets
    // it from the console line above; the client gets a code + requestId to quote to support.
    return errorResponse("LOG_SINK_INSERT_FAILED", "Could not persist logs.", 502, requestId);
  }

  return jsonResponse({ inserted: rows.length, requestId });
});
