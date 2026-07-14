-- File: supabase/migrations/00010_observability_logs_schema.sql
-- Description: First-class the observability fields on public.logs (was: everything stuffed into
--   the details text column). Additive + idempotent (ADD COLUMN IF NOT EXISTS), all nullable, so
--   it is safe on the live table and existing rows are untouched. user_id is already nullable,
--   which lets the service-role log-sink write anonymous/pre-auth diagnostic rows. RLS SELECT
--   (owner-or-admin) is unchanged; the service-role sink bypasses RLS for INSERT.
--   See docs/08-observability/OBSERVABILITY-CONTRACT.md §6.
-- Author: Observability plan (obs-schema)
-- Created: 2026-07-14

ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS trace_id text;

-- Helpful for querying a flow end-to-end and for support lookups by reference.
CREATE INDEX IF NOT EXISTS logs_correlation_id_idx ON public.logs (correlation_id);
CREATE INDEX IF NOT EXISTS logs_request_id_idx ON public.logs (request_id);
