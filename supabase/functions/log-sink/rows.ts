// File: supabase/functions/log-sink/rows.ts
// Description: PURE payload validation + row mapping for the log-sink edge function (EN-27 Option-1
//   edge coverage). Extracted from index.ts so the sink's data handling — level/category defaulting,
//   spoofed-user_id → NULL gating, message/details clamping, batch caps — is unit-testable in vitest
//   without a Deno runtime (this file imports nothing from Deno or esm.sh). index.ts keeps the
//   Deno.serve HTTP wiring + throttle + service-role insert and calls these helpers.
// Author: EN-27 error-hardening (Option-1 edge coverage)
// Created: 2026-07-17

// --- Caps (abuse control for an anonymous-writable surface) ---
export const MAX_EVENTS_PER_BATCH = 100;
export const MAX_BODY_BYTES = 256 * 1024; // 256KB per request
export const MAX_MESSAGE_LEN = 2000;
export const MAX_DETAILS_BYTES = 8 * 1024; // per-event details cap

const LEVELS = new Set(["CRITICAL", "ERROR", "WARN", "INFO", "DEBUG"]);
const CATEGORIES = new Set(["SYSTEM_HEALTH", "SECURITY", "DATA_PROCESSING", "AI_DECISION", "USER_ACTION"]);

// A UUID-ish check so a spoofed/garbage user_id becomes NULL rather than failing the whole batch on
// the auth.users foreign key (anonymous rows are legitimately NULL).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ClientLogEvent {
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

export interface LogRow {
  event: string;
  event_type: string;
  level: string;
  category: string;
  user_id: string | null;
  session_id: string | null;
  request_id: string | null;
  correlation_id: string | null;
  trace_id: string | null;
  details: string | null;
  device_info: string;
  timestamp: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export const clampDetails = (details: unknown): string | null => {
  if (details == null) return null;
  let json: string;
  try {
    json = typeof details === "string" ? details : JSON.stringify(details);
  } catch {
    return null;
  }
  return json.length > MAX_DETAILS_BYTES ? json.slice(0, MAX_DETAILS_BYTES) : json;
};

export type BatchValidation =
  | { ok: true; events: ClientLogEvent[] }
  | { ok: false; code: string; message: string; status: number }
  | { ok: true; events: []; empty: true };

/**
 * Validate the parsed request body's `events` array against the batch caps. Returns a structured
 * verdict the handler maps to an errorResponse / early jsonResponse. (Body-size + JSON-parse checks
 * stay in the handler since they operate on the raw request text.)
 */
export function validateEventsBatch(body: { events?: unknown }): BatchValidation {
  const events = body.events;
  if (!Array.isArray(events)) {
    return { ok: false, code: "BAD_REQUEST", message: "Expected { events: [...] }.", status: 400 };
  }
  if (events.length === 0) {
    return { ok: true, events: [], empty: true };
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    return { ok: false, code: "TOO_MANY_EVENTS", message: `Batch exceeds ${MAX_EVENTS_PER_BATCH} events.`, status: 413 };
  }
  return { ok: true, events: events as ClientLogEvent[] };
}

/**
 * Map validated client events to public.logs rows: default unknown level/category, gate a spoofed
 * user_id to NULL, embed the (clamped) message inside details (the base row has no message column),
 * and clamp details to the byte cap.
 */
export function buildLogRows(
  events: ClientLogEvent[],
  opts: { deviceInfo: string; nowMs: number },
): LogRow[] {
  return events.map((e) => {
    const level = LEVELS.has(String(e.level)) ? String(e.level) : "ERROR";
    const category = CATEGORIES.has(String(e.category)) ? String(e.category) : "SYSTEM_HEALTH";
    const eventType = str(e.event_type) ?? "client_event";
    const message = str(e.message);
    const userId = str(e.user_id);
    return {
      event: eventType,
      event_type: eventType,
      level,
      category,
      user_id: userId && UUID_RE.test(userId) ? userId : null,
      session_id: str(e.session_id),
      request_id: str(e.request_id),
      correlation_id: str(e.correlation_id),
      trace_id: str(e.trace_id),
      details: clampDetails(
        message
          ? { message: message.slice(0, MAX_MESSAGE_LEN), ...(typeof e.details === "object" && e.details ? e.details : { details: e.details }) }
          : e.details,
      ),
      device_info: opts.deviceInfo,
      timestamp: str(e.timestamp) ?? new Date(opts.nowMs).toISOString(),
    };
  });
}
