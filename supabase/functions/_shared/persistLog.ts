// File: supabase/functions/_shared/persistLog.ts
// Description: Service-role persistence helper for edge-function error choke points
//   (OBSERVABILITY-CONTRACT §5/§6). Edge functions historically logged ERROR/CRITICAL events to
//   console only, so they never landed in public.logs and were invisible to support. This helper
//   inserts a structured row (level/category/event_type + correlation IDs + trace_id) via the
//   service-role client, bypassing RLS. It is best-effort by contract: it NEVER throws, so a
//   logging failure can never mask or replace the original error the caller is handling. The
//   paired user-visible surface stays the errorResponse envelope at the call site.
// Author: Observability plan (obs-edge-persist)
// Created: 2026-07-14

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type EdgeLogLevel = "CRITICAL" | "ERROR" | "WARN";
export type EdgeLogCategory =
  | "SYSTEM_HEALTH"
  | "SECURITY"
  | "DATA_PROCESSING"
  | "AI_DECISION"
  | "USER_ACTION";

export interface EdgeLogInput {
  level: EdgeLogLevel;
  category: EdgeLogCategory;
  eventType: string;
  message: string;
  // Per-request correlation IDs so an edge row joins the client's flow and support reference.
  requestId: string;
  correlationId?: string;
  traceId?: string;
  // Authenticated caller when known; null/omitted for pre-auth failures.
  userId?: string | null;
  details?: Record<string, unknown>;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Persist one edge-function ERROR/CRITICAL/WARN event to public.logs. Best-effort: swallows its
 * own failures (logging the failure to console as the sink-of-last-resort) so it can be awaited
 * inside a catch block without risk of throwing over the original error.
 */
export async function persistLog(input: EdgeLogInput): Promise<void> {
  try {
    const admin = adminClient();
    if (!admin) {
      console.error(
        JSON.stringify({ level: "ERROR", event: "persist_log_unconfigured", requestId: input.requestId }),
      );
      return;
    }
    const userId = input.userId && UUID_RE.test(input.userId) ? input.userId : null;
    const { error } = await admin.from("logs").insert({
      event: input.eventType,
      event_type: input.eventType,
      level: input.level,
      category: input.category,
      user_id: userId,
      request_id: input.requestId,
      correlation_id: input.correlationId ?? input.requestId,
      trace_id: input.traceId ?? null,
      details: JSON.stringify({ message: input.message, ...(input.details ?? {}) }),
      device_info: "edge",
      timestamp: new Date().toISOString(),
    });
    if (error) {
      console.error(
        JSON.stringify({ level: "ERROR", event: "persist_log_insert_failed", requestId: input.requestId, message: error.message }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({ level: "ERROR", event: "persist_log_threw", requestId: input.requestId, message: String(e) }),
    );
  }
}
