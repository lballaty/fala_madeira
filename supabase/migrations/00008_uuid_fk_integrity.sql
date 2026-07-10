-- File: supabase/migrations/00008_uuid_fk_integrity.sql
-- Description: FK/index integrity pass for the feedback tables (perf-efficiency-stability-safety
--   plan step). Adds supporting indexes on FK-candidate columns WHERE SAFE, and documents which
--   FK constraints are DEFERRED because the column type genuinely mismatches the referenced UUID
--   PK and/or the live RLS policies depend on the current TEXT type. Conservative by design: this
--   migration NEVER converts a column type or adds a constraint that would fail on existing data
--   or break a live RLS policy. Idempotent throughout (IF NOT EXISTS / DO-block guards).
--
--   Live-DB facts verified 2026-07-10 (information_schema.columns + row/orphan counts):
--     * lesson_requests.user_id       = uuid  → already FK'd to auth.users(id) since 00001. SAFE.
--     * video_suggestions.user_id     = TEXT  (RLS compares user_id = auth.uid()::text; 0 rows)
--     * video_suggestions.lesson_id   = TEXT  (references static string lesson ids, not lessons.id UUID)
--     * lesson_corrections.user_id    = TEXT  (RLS compares user_id = auth.uid()::text; 0 rows)
--     * lesson_corrections.lesson_id  = TEXT  (references static string lesson ids, not lessons.id UUID)
--
--   DEFERRED (NOT applied here — would be breaking or unsafe):
--     * FK video_suggestions.user_id  → auth.users(id): DEFERRED. The column is TEXT and the
--       migration-00001 RLS policies ("Users can view/create their own suggestions") compare
--       `user_id = auth.uid()::text`. A UUID FK requires converting the column to uuid, which
--       would break those `::text` policies. Both tables are empty today, so a future dedicated
--       migration could (a) rewrite the RLS policies to cast, (b) ALTER COLUMN ... TYPE uuid
--       USING user_id::uuid, then (c) add the FK — as one atomic, reviewed change. Not bundled
--       here to keep this pass non-breaking.
--     * FK lesson_corrections.user_id → auth.users(id): DEFERRED, same reason as above.
--     * FK *.lesson_id → public.lessons(id): DEFERRED. lesson_id holds STATIC string lesson ids
--       (e.g. the bundled curriculum's 'm1d1'-style ids from src/data/lessons.ts), which are NOT
--       UUIDs and do NOT exist as rows in public.lessons (whose id is a generated uuid PK). A FK
--       here would reject every real submission. This is a data-model divergence, not a cleanup
--       target — left as a documented TEXT ref.
--
--   APPLIED here (safe): supporting b-tree indexes on the owner-scoped filter columns. The
--   owner-RLS SELECTs (useSettings.loadMySubmissions, useLessons) filter each table by user_id;
--   these indexes back those filters and the join-shaped reads without touching types or policies.
-- Author: Libor Ballaty (with assistant)
-- Created: 2026-07-10

-- ===========================================================================
-- PART 1: SUPPORTING INDEXES (safe — no type/constraint/RLS change)
-- ===========================================================================

-- Owner-scoped reads filter on user_id (RLS + explicit .eq('user_id', ...) in the client).
CREATE INDEX IF NOT EXISTS idx_video_suggestions_user_id
    ON public.video_suggestions (user_id);

CREATE INDEX IF NOT EXISTS idx_lesson_corrections_user_id
    ON public.lesson_corrections (user_id);

-- lesson_requests.user_id is already a UUID FK; index backs the owner-RLS filter + FK checks.
CREATE INDEX IF NOT EXISTS idx_lesson_requests_user_id
    ON public.lesson_requests (user_id);

-- lesson_id is used to attach approved suggestions/corrections back to a lesson (client-side
-- join in useLessons.fetchApprovedVideos). Index the lookup even though no FK is safe here.
CREATE INDEX IF NOT EXISTS idx_video_suggestions_lesson_id
    ON public.video_suggestions (lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_corrections_lesson_id
    ON public.lesson_corrections (lesson_id);

-- ===========================================================================
-- PART 2: FK CONSTRAINTS — SAFE CASES ONLY
-- ===========================================================================

-- lesson_requests.user_id (uuid) already REFERENCES auth.users(id) ON DELETE CASCADE from
-- migration 00001. Guard idempotently: only add the constraint if it is somehow missing (e.g.
-- a hand-edited environment) — never duplicate it. Named to match the 00001 inline definition
-- convention. On the canonical project this is a no-op (constraint already present).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'lesson_requests'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'user_id'
    ) THEN
        ALTER TABLE public.lesson_requests
            ADD CONSTRAINT lesson_requests_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ===========================================================================
-- END OF MIGRATION
-- ===========================================================================
