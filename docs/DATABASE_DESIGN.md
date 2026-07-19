# FalaMadeira Database Design Document

This document provides a comprehensive overview of the Supabase database structure for FalaMadeira, including tables, fields, data types, and security policies.

## 1. Core Tables

### `profiles`
Stores user-specific profile information and progress.
- `id`: `uuid` (Primary Key, references `auth.users.id`)
- `email`: `text`
- `streak`: `integer` (Default: 0)
- `xp`: `integer` (Default: 0)
- `unlocked_level`: `integer` (Default: 1)
- `completed_lessons`: `text[]` (Array of lesson IDs)
- `last_active`: `timestamp with time zone`
- `selected_tutor_id`: `text` (Default: 't1')
- `active_month`: `integer` (Default: 1)
- `total_time_spent`: `integer` (Default: 0, in seconds)
- `role`: `text` (Default: 'user', can be 'admin')
- `completed_lessons_order`: `text[]`
- `subscription_tier`: `text` (Default: 'free')
- `voice_limit`: `integer`
- `voice_usage_today`: `integer` (Default: 0)
- `last_voice_usage_date`: `date`
- `has_accepted_terms`: `boolean` (Default: false)
- `has_accepted_ai_usage`: `boolean` (Default: false)
- `playback_speed`: `numeric` (Default: 1.0)
- `is_sound_enabled`: `boolean` (Default: true)
- `tts_provider`: `text` (NULL = platform default TTS chain azure→gemini; CHECK: 'azure', 'gemini', 'google', 'elevenlabs', 'openai', 'polly' or NULL — migration 00007)
- `tts_byo_key_ref`: `text` (NULL; reference ONLY — the NAME of an admin-registered edge/Vault secret holding the user's bring-your-own provider key. Raw API keys must NEVER be stored in this column — migration 00007)
- `proficiency_level`: `smallint` (NULL, no default — learner's self-described practical/placement level (0–5). WHOLLY separate from the paywall `unlocked_level` (separation invariant, TB-1). Owner-writable under the existing profiles self-update RLS — migration 00015)

### `lessons`
Stores both static curriculum lessons and user-created custom lessons.
- `id`: `uuid` (Primary Key)
- `user_id`: `uuid` (References `auth.users.id`, NULL for static lessons)
- `title`: `text`
- `description`: `text`
- `level`: `integer` (1-6)
- `day`: `integer` (1-30)
- `category`: `text` ('daily', 'social', 'travel', 'work', 'custom')
- `patterns`: `text[]`
- `vocabulary`: `jsonb` (Array of {word, translation, pronunciation})
- `is_static`: `boolean` (Default: false)
- `goals`: `text[]`
- `explanation`: `text`
- `video_url`: `text`
- `created_at`: `timestamp with time zone` (Default: now())

### `tickets`
User support tickets.
- `id`: `uuid` (Primary Key)
- `user_id`: `uuid` (References `auth.users.id`)
- `subject`: `text`
- `description`: `text`
- `status`: `text` ('open', 'in-progress', 'closed')
- `priority`: `text` ('low', 'medium', 'high')
- `created_at`: `timestamp with time zone` (Default: now())

### `logs`
Diagnostic logs for troubleshooting.
- `id`: `uuid` (Primary Key)
- `user_id`: `uuid` (References `auth.users.id`)
- `event`: `text`
- `details`: `text`
- `device_info`: `text`
- `timestamp`: `timestamp with time zone` (Default: now())

### `global_settings`
Application-wide configurations.
- `key`: `text` (Primary Key)
- `value`: `text`
- `updated_at`: `timestamp with time zone` (Default: now())

### `video_suggestions`
User-submitted video content suggestions.
- `id`: `uuid` (Primary Key)
- `lesson_id`: `text` (TEXT in live DB, not a UUID FK — holds STATIC string lesson ids, not `lessons.id` UUIDs, so a FK is unsafe; indexed `idx_video_suggestions_lesson_id` in 00008)
- `user_id`: `text` (TEXT in live DB, no FK — 00001 RLS compares `user_id = auth.uid()::text`; FK deferred in 00008 to avoid breaking that; indexed `idx_video_suggestions_user_id`)
- `video_url`: `text`
- `note`: `text`
- `status`: `text` ('pending', 'approved', 'rejected')
- `created_at`: `timestamp with time zone`

### `lesson_requests`
Requests for new lesson topics.
- `id`: `uuid` (Primary Key)
- `user_id`: `uuid` (FK → `auth.users.id` ON DELETE CASCADE — `lesson_requests_user_id_fkey`, added live by migration 00008; indexed `idx_lesson_requests_user_id`)
- `theme`: `text`
- `description`: `text`
- `status`: `text` ('pending', 'reviewed', 'implemented')
- `created_at`: `timestamp with time zone`

### `lesson_corrections`
User-submitted corrections for existing lessons.
- `id`: `uuid` (Primary Key)
- `lesson_id`: `text` (TEXT in live DB, not a UUID FK — holds STATIC string lesson ids, not `lessons.id` UUIDs, so a FK is unsafe; indexed `idx_lesson_corrections_lesson_id` in 00008)
- `user_id`: `text` (TEXT in live DB, no FK — 00001 RLS compares `user_id = auth.uid()::text`; FK deferred in 00008 to avoid breaking that; indexed `idx_lesson_corrections_user_id`)
- `correction_text`: `text`
- `status`: `text` ('pending', 'approved', 'rejected')
- `created_at`: `timestamp with time zone`

## 1b. Content Model Tables (migration 00006, applied 2026-07-09)

Modular content model per `docs/CONTENT-ARCHITECTURE.md` §9. Content lives as authoritative JSONB payloads (shapes defined in `src/content/schema.ts`) with denormalized scalar columns for querying. All timestamps `with time zone`; `updated_at` maintained by the shared `public.set_updated_at()` BEFORE UPDATE trigger.

### `content_packs`
The shippable, versioned modular content unit.
- `id`: `text` (Primary Key, e.g. 'seed-course-v1')
- `name`: `text`
- `version`: `text` (pack version, e.g. '1.0.0')
- `schema_version`: `text` (content schema the pack targets)
- `status`: `text` (Default: 'draft'; CHECK: 'draft', 'published', 'deprecated', 'archived' — code enum uses 'deprecated', data-model doc says 'archived'; the CHECK accepts both, treat as synonyms)
- `checksum`: `text` (sha256 hex of `canonicalPackPayload(pack)`)
- `payload`: `jsonb` (authoritative ContentPack JSON; nullable)
- `created_at` / `updated_at`: `timestamp with time zone`

### `situations`
Atomic content unit; `payload` is the full Situation JSON.
- `id`: `text` (Primary Key)
- `pack_id`: `text` (FK → `content_packs.id`, ON DELETE CASCADE)
- `payload`: `jsonb` (NOT NULL — full Situation object)
- `level`: `integer` (CHECK 0–5, practical levels)
- `cefr`: `text` (CHECK: 'A1', 'A2', 'B1', 'B2')
- `tracks`: `text[]` (track ids this situation serves; GIN-indexed)
- `course_month` / `course_day`: `integer` (nullable; Structured Course placement)
- `version`: `integer` (Default: 1)
- `created_at` / `updated_at`: `timestamp with time zone`

### `tracks`
Goal-oriented ordered collection of situation refs.
- `id`: `text` (Primary Key)
- `pack_id`: `text` (FK → `content_packs.id`, ON DELETE CASCADE)
- `name`: `text`
- `goal`: `text`
- `situation_ids`: `text[]` (curation order; soft, never a hard gate)
- `payload`: `jsonb` (nullable)
- `created_at` / `updated_at`: `timestamp with time zone`

### `user_track_selection`
Which goal track(s) a user picked. Design: history rows with `is_active` flag — PK `(user_id, track_id)`, and partial unique index `uq_user_track_selection_one_active` on `(user_id) WHERE is_active` enforces at most one active track per user while keeping switch history. `track_id` is a plain text ref (no FK) so selections survive pack re-publishes.
- `user_id`: `uuid` (FK → `auth.users.id`, ON DELETE CASCADE)
- `track_id`: `text`
- `is_active`: `boolean` (Default: true)
- `selected_at`: `timestamp with time zone`

### `user_situation_progress`
Per-situation, per-mode progress (non-linear). PK `(user_id, situation_id, mode)`.
- `user_id`: `uuid` (FK → `auth.users.id`, ON DELETE CASCADE)
- `situation_id`: `text`
- `mode`: `text` (engine name: 'listening', 'roleplay', … — free text)
- `status`: `text` (Default: 'in_progress')
- `score`: `jsonb`
- `updated_at`: `timestamp with time zone`

### `mastery_items`
SM-2 substrate with the 4-dimension weakness model. UNIQUE `(user_id, item_key, dimension)`; index on `(user_id, next_review)` for due queries.
- `id`: `uuid` (Primary Key, `gen_random_uuid()`)
- `user_id`: `uuid` (FK → `auth.users.id`, ON DELETE CASCADE)
- `item_key`: `text` (points at content: vocab word, pattern id, review-item id)
- `dimension`: `text` (CHECK: 'hear', 'say', 'retrieve', 'avoid')
- `ease`: `double precision` (Default: 2.5)
- `interval_days`: `double precision` (Default: 0)
- `repetitions`: `integer` (Default: 0)
- `next_review`: `timestamp with time zone`
- `last_grade`: `integer`
- `updated_at`: `timestamp with time zone`

### `missions_log`
Real-world mission attempts/completions.
- `id`: `uuid` (Primary Key, `gen_random_uuid()`)
- `user_id`: `uuid` (FK → `auth.users.id`, ON DELETE CASCADE)
- `situation_id`: `text`
- `status`: `text` (Default: 'planned')
- `notes`: `text`
- `completed_at`: `timestamp with time zone` (nullable)
- `created_at`: `timestamp with time zone`

### `pronunciation_attempts`
Per-item pronunciation scoring history.
- `id`: `uuid` (Primary Key, `gen_random_uuid()`)
- `user_id`: `uuid` (FK → `auth.users.id`, ON DELETE CASCADE)
- `item_key`: `text`
- `score`: `jsonb`
- `audio_ref`: `text` (nullable)
- `created_at`: `timestamp with time zone`

### `writing_submissions`
Writing prompts + AI/human feedback.
- `id`: `uuid` (Primary Key, `gen_random_uuid()`)
- `user_id`: `uuid` (FK → `auth.users.id`, ON DELETE CASCADE)
- `prompt_ref`: `text`
- `content`: `text`
- `feedback`: `jsonb` (nullable)
- `created_at`: `timestamp with time zone`

## 2. Security Policies (RLS)

Row Level Security is enabled on all tables to ensure data isolation.

### `profiles`
- **SELECT**: `auth.uid() = id` OR `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`
- **INSERT**: `auth.uid() = id`
- **UPDATE**: `auth.uid() = id` OR `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`

### `lessons`
- **SELECT**: `is_static = true` OR `auth.uid() = user_id`
- **INSERT**: `auth.uid() = user_id`
- **UPDATE**: `auth.uid() = user_id` OR `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`

### `tickets` & `logs`
- **SELECT**: `auth.uid() = user_id` OR `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`
- **INSERT**: `auth.uid() = user_id`
- **UPDATE**: `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`

### `global_settings`
- **SELECT**: `true` (Publicly readable)
- **ALL**: `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`

### Content tables: `content_packs`, `situations`, `tracks` (migration 00006)
- **SELECT**: pack `status = 'published'` (for `situations`/`tracks`: parent pack published via EXISTS subquery) OR `public.is_admin()`
- **ALL** (write): `public.is_admin()` (USING + WITH CHECK)

### User-state tables: `user_track_selection`, `user_situation_progress`, `mastery_items`, `missions_log` (migration 00006)
Owner RLS:
- **SELECT**: `auth.uid() = user_id` OR `public.is_admin()`
- **INSERT**: `auth.uid() = user_id`
- **UPDATE**: `auth.uid() = user_id` (USING + WITH CHECK)
- **DELETE**: `auth.uid() = user_id`

### `pronunciation_attempts` (migration 00006)
Append-only history: SELECT (owner or admin), INSERT (owner), DELETE (owner). No UPDATE policy.

### `writing_submissions` (migration 00006)
SELECT (owner or admin), INSERT (owner), DELETE (owner); **UPDATE**: owner OR admin (admin attaches `feedback`).

### Storage: `tts-audio` public bucket (EN-8, migration 00012)
A **public** Storage bucket `tts-audio` buffers pre-generated / write-back TTS clips (raw 24kHz PCM) before the read-only Verpex pull cron copies them to the durable `/audio` mirror and copy-confirms deletion. RLS: **`tts_audio_public_read`** grants anon SELECT on objects in this bucket (the clips are curated public content — no PII); writes are service-role only (pre-gen upload + the `ai-gateway` edge write-back). A pg_cron job **`tts-audio-orphan-backstop`** (daily) sweeps buffer objects the cron never confirmed, so a failed copy can't accumulate cost. Applied + verified live 2026-07-16. See CONTENT-ARCHITECTURE §10.1 for the client tier order.

## 3. Recommended Triggers & Functions

### Auto-create Profile on Signup
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

## 4. Data Types & Constraints
- **UUID**: Used for all primary keys to ensure global uniqueness.
- **JSONB**: Used for complex nested data like vocabulary to allow for future schema flexibility.
- **Timestamps**: All timestamps use `with time zone` to ensure consistency across different user locales.
- **Arrays**: PostgreSQL native arrays are used for simple lists like `completed_lessons` and `patterns`.
