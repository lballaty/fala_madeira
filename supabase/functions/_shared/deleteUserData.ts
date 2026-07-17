// File: supabase/functions/_shared/deleteUserData.ts
// Description: Runtime-agnostic orchestration for account owned-row deletion (EN-27 WP-A, P0.1).
//   supabase-js returns PostgREST failures in `{ error }` rather than throwing, so the previous
//   inline `await admin.from(t).delete()` sequence could fail a table delete, never surface it, and
//   the caller would still report `{ deleted: true }` — a partially-deleted (privacy/GDPR) account
//   reported as success. This module awaits each delete through an injected executor and STOPS on
//   the first `{ error }`, returning a structured failure the caller must handle (persistLog + a
//   500 envelope). It has ZERO Deno/network imports so it is unit-testable under vitest with a fake
//   executor — the guard against this bug regressing.
// Author: EN-27 error-hardening plan (WP-A a1)
// Created: 2026-07-17

/** One owned-row deletion: `DELETE FROM <table> WHERE <column> = <value>`. */
export interface DeleteStep {
  table: string;
  column: string;
  value: string;
}

/**
 * Injected delete executor — the caller binds this to its real client
 * (e.g. `(t, c, v) => admin.from(t).delete().eq(c, v)`), the test binds a fake.
 * Mirrors the supabase-js shape: failures arrive in `{ error }`, they do not throw.
 */
export type DeleteExecutor = (
  table: string,
  column: string,
  value: string,
) => Promise<{ error: unknown }>;

export interface DeleteUserDataResult {
  /** true only when EVERY owned-row delete succeeded. Never true on any failure. */
  ok: boolean;
  /** how many deletes completed before returning (all of them when ok). */
  stepsCompleted: number;
  /** the table whose delete returned an error (set only when ok === false). */
  failedTable?: string;
  /** the underlying error from the failing delete (set only when ok === false). */
  error?: unknown;
}

/**
 * Delete every owned row for a user, fail-fast on the first error.
 *
 * `uid` is the UUID form (used by tables whose user column is uuid); `uidText` is the string form
 * (used by tables whose user column is text — video_suggestions, lesson_corrections). On the first
 * `{ error }` it returns `{ ok: false, failedTable, error, stepsCompleted }` WITHOUT attempting the
 * remaining tables, so the caller can log exactly where it stopped and refuse to report success.
 */
export async function deleteUserData(
  exec: DeleteExecutor,
  uid: string,
  uidText: string,
): Promise<DeleteUserDataResult> {
  const steps: DeleteStep[] = [
    { table: "lessons", column: "user_id", value: uid },
    { table: "lesson_requests", column: "user_id", value: uid },
    { table: "tickets", column: "user_id", value: uid },
    { table: "logs", column: "user_id", value: uid },
    { table: "video_suggestions", column: "user_id", value: uidText },
    { table: "lesson_corrections", column: "user_id", value: uidText },
    { table: "profiles", column: "id", value: uid },
  ];

  let stepsCompleted = 0;
  for (const step of steps) {
    const { error } = await exec(step.table, step.column, step.value);
    if (error) {
      return { ok: false, stepsCompleted, failedTable: step.table, error };
    }
    stepsCompleted += 1;
  }
  return { ok: true, stepsCompleted };
}
