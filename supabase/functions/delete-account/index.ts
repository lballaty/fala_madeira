// File: supabase/functions/delete-account/index.ts
// Description: Authenticated account deletion. Verifies the caller's JWT, removes the user's
//   rows across all owned tables, then deletes the auth user via the service role. Replaces
//   the broken client-side supabase.auth.admin.deleteUser() call (admin API is server-only).
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-07-08

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, errorResponse, jsonResponse, newRequestId } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const requestId = newRequestId();

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
    // Owned-row cleanup. user_id is UUID on some tables and TEXT on others.
    await admin.from("lessons").delete().eq("user_id", uid);
    await admin.from("lesson_requests").delete().eq("user_id", uid);
    await admin.from("tickets").delete().eq("user_id", uid);
    await admin.from("logs").delete().eq("user_id", uid);
    await admin.from("video_suggestions").delete().eq("user_id", uidText);
    await admin.from("lesson_corrections").delete().eq("user_id", uidText);
    await admin.from("profiles").delete().eq("id", uid);

    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw delErr;

    return jsonResponse({ deleted: true, requestId });
  } catch (e) {
    console.error(JSON.stringify({ level: "ERROR", requestId, userId: uid, message: String(e) }));
    return errorResponse("DELETE_FAILED", "Could not fully delete the account. Contact support.", 500, requestId);
  }
});
