-- FalaMadeira: Fixed Migration - Missing Tables and Columns
-- Generated: 2026-04-04
-- This SQL fixes the profiles table first, then creates missing tables

-- Ensure UUID extension exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================================================
-- PART 1: FIX EXISTING PROFILES TABLE (Add missing columns if needed)
-- ===========================================================================

-- Add role column to profiles if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'user';
    END IF;
END $$;

-- Add other potentially missing columns to profiles
DO $$
BEGIN
    -- Add completed_lessons_order if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'completed_lessons_order'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN completed_lessons_order text[] DEFAULT '{}';
    END IF;

    -- Add subscription_tier if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'subscription_tier'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN subscription_tier text DEFAULT 'free';
    END IF;

    -- Add voice_limit if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'voice_limit'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN voice_limit integer;
    END IF;

    -- Add voice_usage_today if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'voice_usage_today'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN voice_usage_today integer DEFAULT 0;
    END IF;

    -- Add last_voice_usage_date if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'last_voice_usage_date'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN last_voice_usage_date date;
    END IF;

    -- Add playback_speed if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'playback_speed'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN playback_speed numeric DEFAULT 1.0;
    END IF;

    -- Add is_sound_enabled if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'is_sound_enabled'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN is_sound_enabled boolean DEFAULT true;
    END IF;
END $$;

-- ===========================================================================
-- PART 2: CREATE MISSING TABLES
-- ===========================================================================

-- tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    subject text NOT NULL,
    description text,
    status text DEFAULT 'open',
    priority text DEFAULT 'medium',
    created_at timestamp with time zone DEFAULT now()
);

-- logs table
CREATE TABLE IF NOT EXISTS public.logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    event text NOT NULL,
    details text,
    device_info text,
    timestamp timestamp with time zone DEFAULT now()
);

-- global_settings table
CREATE TABLE IF NOT EXISTS public.global_settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamp with time zone DEFAULT now()
);

-- video_suggestions table
CREATE TABLE IF NOT EXISTS public.video_suggestions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id text,
    user_id text,
    video_url text NOT NULL,
    note text,
    status text DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT now()
);

-- lesson_corrections table
CREATE TABLE IF NOT EXISTS public.lesson_corrections (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id text,
    user_id text,
    correction_text text NOT NULL,
    status text DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT now()
);

-- ===========================================================================
-- PART 3: ENABLE ROW LEVEL SECURITY (RLS)
-- ===========================================================================

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_corrections ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- PART 4: CREATE SECURITY POLICIES (with proper role column check)
-- ===========================================================================

-- Helper function to safely check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin';
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- tickets policies
DROP POLICY IF EXISTS "Users can view their own tickets" ON public.tickets;
CREATE POLICY "Users can view their own tickets"
ON public.tickets FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can create tickets" ON public.tickets;
CREATE POLICY "Users can create tickets"
ON public.tickets FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.tickets;
CREATE POLICY "Admins can manage all tickets"
ON public.tickets FOR ALL
USING (public.is_admin());

-- logs policies
DROP POLICY IF EXISTS "Users can view their own logs" ON public.logs;
CREATE POLICY "Users can view their own logs"
ON public.logs FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can create logs" ON public.logs;
CREATE POLICY "Users can create logs"
ON public.logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all logs" ON public.logs;
CREATE POLICY "Admins can manage all logs"
ON public.logs FOR ALL
USING (public.is_admin());

-- global_settings policies
DROP POLICY IF EXISTS "Global settings are readable by all" ON public.global_settings;
CREATE POLICY "Global settings are readable by all"
ON public.global_settings FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage global settings" ON public.global_settings;
CREATE POLICY "Admins can manage global settings"
ON public.global_settings FOR ALL
USING (public.is_admin());

-- video_suggestions policies
DROP POLICY IF EXISTS "Users can view their own suggestions" ON public.video_suggestions;
CREATE POLICY "Users can view their own suggestions"
ON public.video_suggestions FOR SELECT
USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS "Users can create suggestions" ON public.video_suggestions;
CREATE POLICY "Users can create suggestions"
ON public.video_suggestions FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Anyone can view approved suggestions" ON public.video_suggestions;
CREATE POLICY "Anyone can view approved suggestions"
ON public.video_suggestions FOR SELECT
USING (status = 'approved');

DROP POLICY IF EXISTS "Admins can update suggestions" ON public.video_suggestions;
CREATE POLICY "Admins can update suggestions"
ON public.video_suggestions FOR UPDATE
USING (public.is_admin());

-- lesson_corrections policies
DROP POLICY IF EXISTS "Users can view their own corrections" ON public.lesson_corrections;
CREATE POLICY "Users can view their own corrections"
ON public.lesson_corrections FOR SELECT
USING (user_id = auth.uid()::text OR public.is_admin());

DROP POLICY IF EXISTS "Users can create corrections" ON public.lesson_corrections;
CREATE POLICY "Users can create corrections"
ON public.lesson_corrections FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

-- ===========================================================================
-- PART 5: CREATE TRIGGER FOR AUTO-PROFILE CREATION (if not exists)
-- ===========================================================================

-- Create or replace the function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ===========================================================================
-- END OF MIGRATION
-- ===========================================================================
