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

// --- Caps (abuse control for an anonymous-writable surface) ---
const MAX_EVENTS_PER_BATCH = 100;
const MAX_BODY_BYTES = 256 * 1024; // 256KB per request
const MAX_MESSAGE_LEN = 2000;
const MAX_DETAILS_BYTES = 8 * 1024; // per-event details cap

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

const LEVELS = new Set(["CRITICAL", "ERROR", "WARN", "INFO", "DEBUG"]);
const CATEGORIES = new Set([
  "SYSTEM_HEALTH",
  "SECURITY",
  "DATA_PROCESSING",
  "AI_DECISION",
  "USER_ACTION",
]);

// A UUID-ish check so a spoofed/garbage user_id becomes NULL rather than failing the whole
// batch on the auth.users foreign key (anonymous rows are legitimately NULL).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ClientLogEvent {
  level?: unknown;
  category?: unknown;
  event_type?: unknown;
  message?: unknown;
  details?: unknown;
  session_id?: unknown;
  request_id?: unknown;
  correlation_id?: unknown;
  trace_id?: unknown;
  user_id?: unknown;
  timestamp?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

const clampDetails = (details: unknown): string | null => {
  if (details == null) return null;
  let json: string;
  try {
    json = typeof details === "string" ? details : JSON.stringify(details);
  } catch {
    return null;
  }
  return json.length > MAX_DETAILS_BYTES ? json.slice(0, MAX_DETAILS_BYTES) : json;
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

  const events = body.events;
  if (!Array.isArray(events)) {
    return errorResponse("BAD_REQUEST", "Expected { events: [...] }.", 400, requestId);
  }
  if (events.length === 0) {
    return jsonResponse({ inserted: 0, requestId });
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    return errorResponse(
      "TOO_MANY_EVENTS",
      `Batch exceeds ${MAX_EVENTS_PER_BATCH} events.`,
      413,
      requestId,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const rows = (events as ClientLogEvent[]).map((e) => {
    const level = LEVELS.has(String(e.level)) ? String(e.level) : "ERROR";
    const category = CATEGORIES.has(String(e.category)) ? String(e.category) : "SYSTEM_HEALTH";
    const eventType = str(e.event_type) ?? "client_event";
    const message = str(e.message);
    const userId = str(e.user_id);
    return {
      // event is NOT NULL on the table; event_type mirrors it as a first-class column.
      event: eventType,
      event_type: eventType,
      level,
      category,
      // FK to auth.users: only pass through a well-formed UUID, else NULL (anonymous row).
      user_id: userId && UUID_RE.test(userId) ? userId : null,
      session_id: str(e.session_id),
      request_id: str(e.request_id),
      correlation_id: str(e.correlation_id),
      trace_id: str(e.trace_id),
      details: clampDetails(
        // Keep the message inside details (the base row has no message column) alongside
        // whatever structured details the client sent.
        message
          ? { message: message.slice(0, MAX_MESSAGE_LEN), ...(typeof e.details === "object" && e.details ? e.details : { details: e.details }) }
          : e.details,
      ),
      device_info: req.headers.get("user-agent") ?? "unknown",
      timestamp: str(e.timestamp) ?? new Date(now).toISOString(),
    };
  });

  const { error } = await admin.from("logs").insert(rows);
  if (error) {
    // The sink's own failure is server-side; surface a structured envelope. Console is the
    // sink-of-last-resort here (we cannot recurse into the sink to log the sink's failure).
    console.error(JSON.stringify({ level: "ERROR", requestId, event: "log_sink_insert_failed", message: error.message }));
    return errorResponse("LOG_SINK_INSERT_FAILED", "Could not persist logs.", 502, requestId, {
      dbMessage: error.message,
    });
  }

  return jsonResponse({ inserted: rows.length, requestId });
});
