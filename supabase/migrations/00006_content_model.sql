-- File: supabase/migrations/00006_content_model.sql
-- Description: Modular content model (docs/CONTENT-ARCHITECTURE.md §9) — content_packs,
--   situations, tracks (authoritative JSONB payloads mirroring src/content/schema.ts),
--   plus per-user state: user_track_selection, user_situation_progress, mastery_items
--   (hear|say|retrieve|avoid SM-2 substrate), missions_log, pronunciation_attempts,
--   writing_submissions. Content tables: published-readable / admin-writable via the
--   null-safe public.is_admin() helper from migration 00003. User tables: owner RLS.
--   Idempotent throughout (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE).
-- Author: Libor Ballaty <libor@arionetworks.com>
-- Created: 2026-07-09

-- ===========================================================================
-- PART 0: SHARED updated_at TRIGGER FUNCTION
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- PART 1: CONTENT TABLES (packs -> situations / tracks)
-- ===========================================================================

-- content_packs: the shippable, versioned modular unit (§2.3). `payload` holds the
-- authoritative pack JSON (ContentPack shape); situations/tracks rows are the
-- queryable projection of it. `checksum` = sha256 hex of canonicalPackPayload(pack).
-- NB status vocabulary: src/content/schema.ts PACK_STATUSES uses 'deprecated' while
-- the plan/data-model doc says 'archived' — the CHECK accepts the union so neither
-- surface is rejected; treat 'deprecated' and 'archived' as synonyms for now.
CREATE TABLE IF NOT EXISTS public.content_packs (
    id text PRIMARY KEY,
    name text NOT NULL,
    version text NOT NULL,
    schema_version text,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'deprecated', 'archived')),
    checksum text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- situations: atomic content unit (§2.1). `payload` is the full Situation JSON
-- (phrase_patterns, vocabulary, dialogues, roleplay, mission, review_items, …);
-- the scalar columns are denormalized selectors for querying/recommendation.
CREATE TABLE IF NOT EXISTS public.situations (
    id text PRIMARY KEY,
    pack_id text NOT NULL REFERENCES public.content_packs(id) ON DELETE CASCADE,
    payload jsonb NOT NULL,
    level integer NOT NULL CHECK (level BETWEEN 0 AND 5),
    cefr text NOT NULL CHECK (cefr IN ('A1', 'A2', 'B1', 'B2')),
    tracks text[] NOT NULL DEFAULT '{}',
    course_month integer,
    course_day integer,
    version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_situations_pack_id ON public.situations (pack_id);
CREATE INDEX IF NOT EXISTS idx_situations_level ON public.situations (level);
CREATE INDEX IF NOT EXISTS idx_situations_tracks ON public.situations USING gin (tracks);
CREATE INDEX IF NOT EXISTS idx_situations_course
    ON public.situations (course_month, course_day)
    WHERE course_month IS NOT NULL;

-- tracks: goal-oriented ordered collection of situation refs (§2.2). Ordering
-- lives in situation_ids (curation order; soft, never a hard gate).
CREATE TABLE IF NOT EXISTS public.tracks (
    id text PRIMARY KEY,
    pack_id text NOT NULL REFERENCES public.content_packs(id) ON DELETE CASCADE,
    name text NOT NULL,
    goal text NOT NULL,
    situation_ids text[] NOT NULL DEFAULT '{}',
    payload jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracks_pack_id ON public.tracks (pack_id);

-- ===========================================================================
-- PART 2: PER-USER STATE TABLES
-- ===========================================================================

-- user_track_selection: which goal track(s) a user has picked (§5 path type 2).
-- Design choice: history rows with an is_active flag — PK (user_id, track_id)
-- keeps one row per track ever selected (re-selecting upserts selected_at /
-- is_active), and the partial unique index enforces AT MOST ONE active track
-- per user while preserving switch history. Switching = deactivate current row,
-- upsert the new one. track_id is a plain text ref (no FK) so selections survive
-- pack re-publishes and can reference tracks from packs not yet synced.
CREATE TABLE IF NOT EXISTS public.user_track_selection (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    track_id text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    selected_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, track_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_track_selection_one_active
    ON public.user_track_selection (user_id)
    WHERE is_active;

-- user_situation_progress: per-situation, per-mode progress (non-linear, §5).
-- mode = engine name ('listening', 'shadowing', 'patterns', 'roleplay', 'review',
-- 'mission', …) — free text so new engines need no migration.
CREATE TABLE IF NOT EXISTS public.user_situation_progress (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    situation_id text NOT NULL,
    mode text NOT NULL,
    status text NOT NULL DEFAULT 'in_progress',
    score jsonb,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, situation_id, mode)
);

-- mastery_items: SM-2 substrate with the 4-dimension weakness model (§6).
-- item_key points at content (vocab word, pattern id, review-item id, …).
CREATE TABLE IF NOT EXISTS public.mastery_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_key text NOT NULL,
    dimension text NOT NULL CHECK (dimension IN ('hear', 'say', 'retrieve', 'avoid')),
    ease double precision NOT NULL DEFAULT 2.5,
    interval_days double precision NOT NULL DEFAULT 0,
    repetitions integer NOT NULL DEFAULT 0,
    next_review timestamp with time zone,
    last_grade integer,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, item_key, dimension)
);

CREATE INDEX IF NOT EXISTS idx_mastery_items_due
    ON public.mastery_items (user_id, next_review);

-- missions_log: real-world mission attempts/completions (§9).
CREATE TABLE IF NOT EXISTS public.missions_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    situation_id text NOT NULL,
    status text NOT NULL DEFAULT 'planned',
    notes text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_log_user ON public.missions_log (user_id);

-- pronunciation_attempts: per-item pronunciation scoring history (§9).
CREATE TABLE IF NOT EXISTS public.pronunciation_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_key text NOT NULL,
    score jsonb,
    audio_ref text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pronunciation_attempts_user
    ON public.pronunciation_attempts (user_id, item_key);

-- writing_submissions: writing prompts + AI/human feedback (§9).
CREATE TABLE IF NOT EXISTS public.writing_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt_ref text,
    content text NOT NULL,
    feedback jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writing_submissions_user
    ON public.writing_submissions (user_id);

-- ===========================================================================
-- PART 3: updated_at TRIGGERS
-- ===========================================================================

DROP TRIGGER IF EXISTS set_content_packs_updated_at ON public.content_packs;
CREATE TRIGGER set_content_packs_updated_at
    BEFORE UPDATE ON public.content_packs
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_situations_updated_at ON public.situations;
CREATE TRIGGER set_situations_updated_at
    BEFORE UPDATE ON public.situations
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_tracks_updated_at ON public.tracks;
CREATE TRIGGER set_tracks_updated_at
    BEFORE UPDATE ON public.tracks
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_user_situation_progress_updated_at ON public.user_situation_progress;
CREATE TRIGGER set_user_situation_progress_updated_at
    BEFORE UPDATE ON public.user_situation_progress
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS set_mastery_items_updated_at ON public.mastery_items;
CREATE TRIGGER set_mastery_items_updated_at
    BEFORE UPDATE ON public.mastery_items
    FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ===========================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY
-- ===========================================================================

ALTER TABLE public.content_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.situations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_track_selection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_situation_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mastery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pronunciation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_submissions ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- PART 5: POLICIES — CONTENT TABLES (published-readable, admin-writable)
-- ===========================================================================

-- content_packs
DROP POLICY IF EXISTS "Published packs are readable by all" ON public.content_packs;
CREATE POLICY "Published packs are readable by all"
ON public.content_packs FOR SELECT
USING (status = 'published' OR public.is_admin());

DROP POLICY IF EXISTS "Admins can manage content packs" ON public.content_packs;
CREATE POLICY "Admins can manage content packs"
ON public.content_packs FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- situations (readable when the parent pack is published)
DROP POLICY IF EXISTS "Situations of published packs are readable by all" ON public.situations;
CREATE POLICY "Situations of published packs are readable by all"
ON public.situations FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.content_packs p
        WHERE p.id = pack_id AND p.status = 'published'
    )
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Admins can manage situations" ON public.situations;
CREATE POLICY "Admins can manage situations"
ON public.situations FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- tracks (readable when the parent pack is published)
DROP POLICY IF EXISTS "Tracks of published packs are readable by all" ON public.tracks;
CREATE POLICY "Tracks of published packs are readable by all"
ON public.tracks FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.content_packs p
        WHERE p.id = pack_id AND p.status = 'published'
    )
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Admins can manage tracks" ON public.tracks;
CREATE POLICY "Admins can manage tracks"
ON public.tracks FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ===========================================================================
-- PART 6: POLICIES — USER STATE TABLES (owner RLS; admin can view)
-- ===========================================================================

-- user_track_selection
DROP POLICY IF EXISTS "Users can view their own track selection" ON public.user_track_selection;
CREATE POLICY "Users can view their own track selection"
ON public.user_track_selection FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert their own track selection" ON public.user_track_selection;
CREATE POLICY "Users can insert their own track selection"
ON public.user_track_selection FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own track selection" ON public.user_track_selection;
CREATE POLICY "Users can update their own track selection"
ON public.user_track_selection FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own track selection" ON public.user_track_selection;
CREATE POLICY "Users can delete their own track selection"
ON public.user_track_selection FOR DELETE
USING (auth.uid() = user_id);

-- user_situation_progress
DROP POLICY IF EXISTS "Users can view their own situation progress" ON public.user_situation_progress;
CREATE POLICY "Users can view their own situation progress"
ON public.user_situation_progress FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert their own situation progress" ON public.user_situation_progress;
CREATE POLICY "Users can insert their own situation progress"
ON public.user_situation_progress FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own situation progress" ON public.user_situation_progress;
CREATE POLICY "Users can update their own situation progress"
ON public.user_situation_progress FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own situation progress" ON public.user_situation_progress;
CREATE POLICY "Users can delete their own situation progress"
ON public.user_situation_progress FOR DELETE
USING (auth.uid() = user_id);

-- mastery_items
DROP POLICY IF EXISTS "Users can view their own mastery items" ON public.mastery_items;
CREATE POLICY "Users can view their own mastery items"
ON public.mastery_items FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert their own mastery items" ON public.mastery_items;
CREATE POLICY "Users can insert their own mastery items"
ON public.mastery_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own mastery items" ON public.mastery_items;
CREATE POLICY "Users can update their own mastery items"
ON public.mastery_items FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own mastery items" ON public.mastery_items;
CREATE POLICY "Users can delete their own mastery items"
ON public.mastery_items FOR DELETE
USING (auth.uid() = user_id);

-- missions_log
DROP POLICY IF EXISTS "Users can view their own missions log" ON public.missions_log;
CREATE POLICY "Users can view their own missions log"
ON public.missions_log FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert their own missions log" ON public.missions_log;
CREATE POLICY "Users can insert their own missions log"
ON public.missions_log FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own missions log" ON public.missions_log;
CREATE POLICY "Users can update their own missions log"
ON public.missions_log FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own missions log" ON public.missions_log;
CREATE POLICY "Users can delete their own missions log"
ON public.missions_log FOR DELETE
USING (auth.uid() = user_id);

-- pronunciation_attempts
DROP POLICY IF EXISTS "Users can view their own pronunciation attempts" ON public.pronunciation_attempts;
CREATE POLICY "Users can view their own pronunciation attempts"
ON public.pronunciation_attempts FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert their own pronunciation attempts" ON public.pronunciation_attempts;
CREATE POLICY "Users can insert their own pronunciation attempts"
ON public.pronunciation_attempts FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own pronunciation attempts" ON public.pronunciation_attempts;
CREATE POLICY "Users can delete their own pronunciation attempts"
ON public.pronunciation_attempts FOR DELETE
USING (auth.uid() = user_id);

-- writing_submissions
DROP POLICY IF EXISTS "Users can view their own writing submissions" ON public.writing_submissions;
CREATE POLICY "Users can view their own writing submissions"
ON public.writing_submissions FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert their own writing submissions" ON public.writing_submissions;
CREATE POLICY "Users can insert their own writing submissions"
ON public.writing_submissions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- feedback is written by the review pipeline; owner may update their own row
-- (e.g. resubmit), admin may update to attach feedback
DROP POLICY IF EXISTS "Owner or admin can update writing submissions" ON public.writing_submissions;
CREATE POLICY "Owner or admin can update writing submissions"
ON public.writing_submissions FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete their own writing submissions" ON public.writing_submissions;
CREATE POLICY "Users can delete their own writing submissions"
ON public.writing_submissions FOR DELETE
USING (auth.uid() = user_id);

-- ===========================================================================
-- END OF MIGRATION
-- ===========================================================================
