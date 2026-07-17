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
import { buildLogRows, MAX_BODY_BYTES, validateEventsBatch } from "./rows.ts";

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

  let body: { events?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON body.", 400, requestId);
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
