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
- `lesson_id`: `text` (NB: TEXT in live DB, not a UUID FK — see migration 00007 plan to migrate)
- `user_id`: `text` (NB: TEXT in live DB, not a UUID FK)
- `video_url`: `text`
- `note`: `text`
- `status`: `text` ('pending', 'approved', 'rejected')
- `created_at`: `timestamp with time zone`

### `lesson_requests`
Requests for new lesson topics.
- `id`: `uuid` (Primary Key)
- `user_id`: `uuid`
- `theme`: `text`
- `description`: `text`
- `status`: `text` ('pending', 'reviewed', 'implemented')
- `created_at`: `timestamp with time zone`

### `lesson_corrections`
User-submitted corrections for existing lessons.
- `id`: `uuid` (Primary Key)
- `lesson_id`: `text` (NB: TEXT in live DB, not a UUID FK — see migration 00007 plan to migrate)
- `user_id`: `text` (NB: TEXT in live DB, not a UUID FK)
- `correction_text`: `text`
- `status`: `text` ('pending', 'approved', 'rejected')
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
