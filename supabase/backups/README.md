# Supabase Backups — Full Backup & Restore Runbook

**File:** /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/supabase/backups/README.md
**Description:** How FalaMadeira's Supabase database is backed up and restored. Covers creating a full backup, restoring fully (disaster recovery), and resetting just the app data after test runs dirty the DB. States precisely what a database dump does and does NOT cover for a managed Supabase project.
**Author:** assistant (for Libor Ballaty)
**Created:** 2026-07-11
**Last Updated:** 2026-07-12
**Last Updated By:** assistant

## Layout

```
supabase/backups/
  README.md          <- this file (committed)
  backup-restore.sh  <- helper: dump / restore-full / reset-appdata / verify-local (committed)
  <YYYY-MM-DD_HHMMSS>/   <- one snapshot (GITIGNORED — contains auth PII + role password hashes)
      full-database.dump          (pg_dump custom, full DB, owner+privileges)
      full-database.sql           (plain SQL, full DB)
      public-schema-and-data.sql  (public schema only)
      roles.sql                   (cluster roles — apply first on a fresh target)
      MANIFEST.md                 (what was captured + verification + row-count baseline)
```

The dump files are **gitignored on purpose**: they contain `auth.users` rows (emails + bcrypt
hashes) and role password hashes. They live on disk in the repo for restores but are never
pushed to git history. If you deliberately want a snapshot in version control, `git add -f` it
and accept the secret-exposure trade-off.

## What IS in the backup (database-level, complete)

All non-system schemas with DDL **and** data, ownership + privileges preserved:
`public`, `auth`, `storage`, `realtime`, `vault`, `graphql`, `graphql_public`, `extensions`,
`pgbouncer` — plus `CREATE EXTENSION` statements and all 44 cluster roles. This restores the
**entire database** into a Supabase-compatible target.

## What is NOT in the backup (lives outside the database)

A Postgres dump cannot capture platform-level configuration. For a true from-scratch project
rebuild you also need:

- **Edge function code** — already in this repo under `supabase/functions/`.
- **Edge function secrets** (`GEMINI_API_KEY`, etc.) — Supabase platform config, re-set via
  `supabase secrets set …` or the dashboard. Reference values are in `.env` / `.env.local`.
- **Auth settings** — providers, redirect URLs, email templates, **JWT secret**, rate limits.
- **API / project keys** — anon + service_role keys are project config (anon key is in `.env.local`).
- **Storage object bytes** — only metadata rows are in the DB; actual files live in S3. (N/A here:
  `storage.objects` = 0, so there are no files to back up.)
- **Scheduled jobs / webhooks** (pg_cron, database webhooks) if any are configured at the platform level.

For the day-to-day goal — **reset the DB to a clean state after tests dirty it** — none of the
above matters; you only restore data (see "Reset app data" below).

## Restore target compatibility

- ✅ **Another Supabase project**, or a local **`supabase start`** stack — restores fully; the
  platform provides `supabase_vault`, the managed roles bootstrap, and the auth/storage services.
- ⚠️ **Vanilla PostgreSQL** — restores everything EXCEPT the `supabase_vault` extension and a few
  managed pieces; fine for inspecting/validating data, not a working Supabase API.

---

## Procedures

Set the target connection once (example uses the live project — point it at a **restore target**,
not prod, unless you truly intend to overwrite prod):

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export PGPASSWORD='<db-password>'                 # from .env.local SUPABASE_DB_PASSWORD
TARGET='host=<host> port=5432 dbname=postgres user=postgres sslmode=require'
DIR=/Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/supabase/backups/<snapshot>
```

### A. Create a new full backup

```bash
bash supabase/backups/backup-restore.sh dump
```
Writes a fresh timestamped snapshot dir (dumps + roles + MANIFEST) and prints a verification summary.

### B. Full restore (disaster recovery, into a FRESH Supabase project)

```bash
# 1. roles first (a fresh cluster needs the Supabase roles before owned objects load)
psql "$TARGET" -v ON_ERROR_STOP=0 -f "$DIR/roles.sql"
# 2. full database (custom format; --clean --if-exists makes it idempotent)
pg_restore -d "$TARGET" --clean --if-exists --no-comments "$DIR/full-database.dump"
```
On a fresh Supabase project some auth/storage objects already exist (created by the platform);
`--clean --if-exists` handles that. Review the output — "already exists" / role notices are
expected; hard ERRORs on `public` objects are not.

### C. Reset app data in the SAME project (the common post-test cleanup)

This restores only `public` table **data** to the snapshot state without touching schema, auth,
or platform config. It TRUNCATEs the app tables first, so **all rows written since the snapshot
are discarded** (that's the point).

```bash
bash supabase/backups/backup-restore.sh reset-appdata "$DIR" "$TARGET"
```
Prompts for confirmation, then: `TRUNCATE` public app tables (RESTART IDENTITY CASCADE) →
`pg_restore --data-only --schema=public` from `full-database.dump`. If test signups created
`auth.users` rows you also want gone, delete them explicitly (they cascade to `public.profiles`).

### D. Verify a snapshot restores (local, containerized)

Requires Docker. Spins a throwaway `supabase/postgres` (or `postgres:17`) container, applies
roles + full dump, and checks row counts against the MANIFEST baseline:

```bash
bash supabase/backups/backup-restore.sh verify-local "$DIR"
```

## Cadence

Take a fresh `dump` before each test session that will write to the DB, and keep the last known
"golden" snapshot around. Reset with procedure C between sessions.
