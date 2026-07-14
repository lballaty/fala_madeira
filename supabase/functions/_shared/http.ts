// File: supabase/functions/_shared/http.ts
// Description: Shared CORS + structured error/response helpers for FalaMadeira edge functions.
//   Every error carries a machine-readable code, a human message, and a request id the
//   client can quote to support (aligns with the centralized error-handling standard).
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-08

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // NOTE: `traceparent` MUST stay listed — the client sends a W3C traceparent header on every
  // functions.invoke (OBSERVABILITY-CONTRACT §8). A custom request header triggers a CORS
  // preflight, and if it is not allowed here the browser blocks EVERY edge call (FunctionsFetchError).
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, traceparent",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function newRequestId(): string {
  return crypto.randomUUID();
}

// Parse a W3C `traceparent` header (version-format 00): `00-<32hex traceId>-<16hex spanId>-<2hex flags>`.
// Returns null on absence or malformed input so callers can thread trace_id when present and
// simply omit it otherwise. See OBSERVABILITY-CONTRACT §8.
export function parseTraceparent(
  header: string | null,
): { traceId: string; spanId: string } | null {
  if (!header) return null;
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i.exec(header.trim());
  return m ? { traceId: m[1], spanId: m[2] } : null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string,
  details?: unknown,
): Response {
  return jsonResponse(
    { error: { code, message, requestId, details: details ?? null } },
    status,
  );
}
