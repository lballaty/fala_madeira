-- FalaMadeira: Missing Tables and Security Policies
-- Generated: 2026-04-02
-- This SQL creates ONLY the tables missing from your Supabase database

-- Ensure UUID extension exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================================================
-- 1. CREATE MISSING TABLES
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
-- 2. ENABLE ROW LEVEL SECURITY (RLS)
-- ===========================================================================

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_corrections ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 3. CREATE SECURITY POLICIES
-- ===========================================================================

-- tickets policies
CREATE POLICY "Users can view their own tickets"
ON public.tickets FOR SELECT
USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Users can create tickets"
ON public.tickets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all tickets"
ON public.tickets FOR ALL
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- logs policies
CREATE POLICY "Users can view their own logs"
ON public.logs FOR SELECT
USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Users can create logs"
ON public.logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all logs"
ON public.logs FOR ALL
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- global_settings policies
CREATE POLICY "Global settings are readable by all"
ON public.global_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can manage global settings"
ON public.global_settings FOR ALL
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- video_suggestions policies
CREATE POLICY "Users can view their own suggestions"
ON public.video_suggestions FOR SELECT
USING (user_id = auth.uid()::text OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Users can create suggestions"
ON public.video_suggestions FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Anyone can view approved suggestions"
ON public.video_suggestions FOR SELECT
USING (status = 'approved');

CREATE POLICY "Admins can update suggestions"
ON public.video_suggestions FOR UPDATE
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- lesson_corrections policies
CREATE POLICY "Users can view their own corrections"
ON public.lesson_corrections FOR SELECT
USING (user_id = auth.uid()::text OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Users can create corrections"
ON public.lesson_corrections FOR INSERT
WITH CHECK (user_id = auth.uid()::text);

-- ===========================================================================
-- END OF MIGRATION
-- ===========================================================================
