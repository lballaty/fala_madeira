// File: supabase/functions/delete-account/index.ts
// Description: Authenticated account deletion. Verifies the caller's JWT, removes the user's
//   rows across all owned tables, then deletes the auth user via the service role. Replaces
//   the broken client-side supabase.auth.admin.deleteUser() call (admin API is server-only).
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-08

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, errorResponse, jsonResponse, newRequestId, parseTraceparent } from "../_shared/http.ts";
import { persistLog } from "../_shared/persistLog.ts";
import { deleteUserData } from "../_shared/deleteUserData.ts";

Deno.serve(async (req) => {
  const requestId = newRequestId();
  const trace = parseTraceparent(req.headers.get("traceparent"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Use POST.", 405, requestId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return errorResponse("UNAUTHENTICATED", "You must be signed in.", 401, requestId);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const uid = user.id;
  const uidText = String(uid);

  try {
    // Owned-row cleanup via the pure orchestrator. supabase-js returns failures in `{ error }`
    // (it does NOT throw), so a per-table failure must be checked explicitly — otherwise a
    // partially-deleted account would be reported as `{ deleted: true }` (EN-27 P0.1). The
    // orchestrator stops on the first error; we persist exactly where it stopped and return 500.
    const result = await deleteUserData(
      (table, column, value) => admin.from(table).delete().eq(column, value),
      uid,
      uidText,
    );
    if (!result.ok) {
      await persistLog({
        level: "ERROR",
        category: "SECURITY",
        eventType: "account_delete_step_failed",
        message: `owned-row deletion failed at table '${result.failedTable}': ${String(result.error)}`,
        requestId,
        correlationId: requestId,
        traceId: trace?.traceId,
        userId: uid,
        details: { failedTable: result.failedTable, stepsCompleted: result.stepsCompleted },
      });
      return errorResponse(
        "DELETE_FAILED",
        "Could not fully delete the account. Contact support.",
        500,
        requestId,
        { traceId: trace?.traceId },
      );
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return jsonResponse({ deleted: true, requestId });
  } catch (e) {
    // Account deletion is security/data-critical: persist the failure with correlation IDs
    // (OBSERVABILITY-CONTRACT §5) so support can trace a partially-deleted account.
    await persistLog({
      level: "ERROR",
      category: "SECURITY",
      eventType: "account_delete_failed",
      message: String(e),
      requestId,
      correlationId: requestId,
      traceId: trace?.traceId,
      userId: uid,
      details: {},
    });
    return errorResponse("DELETE_FAILED", "Could not fully delete the account. Contact support.", 500, requestId, {
      traceId: trace?.traceId,
    });
  }
});
