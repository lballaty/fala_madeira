-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Core Tables

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    streak integer DEFAULT 0,
    xp integer DEFAULT 0,
    unlocked_level integer DEFAULT 1,
    completed_lessons text[] DEFAULT '{}',
    last_active timestamp with time zone,
    selected_tutor_id text DEFAULT 't1',
    active_month integer DEFAULT 1,
    total_time_spent integer DEFAULT 0,
    role text DEFAULT 'user',
    completed_lessons_order text[] DEFAULT '{}',
    subscription_tier text DEFAULT 'free',
    voice_limit integer,
    voice_usage_today integer DEFAULT 0,
    last_voice_usage_date date,
    has_accepted_terms boolean DEFAULT false,
    has_accepted_ai_usage boolean DEFAULT false,
    playback_speed numeric DEFAULT 1.0,
    is_sound_enabled boolean DEFAULT true
);

-- lessons
CREATE TABLE IF NOT EXISTS public.lessons (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    level integer,
    day integer,
    category text,
    patterns text[] DEFAULT '{}',
    vocabulary jsonb DEFAULT '[]'::jsonb,
    is_static boolean DEFAULT false,
    goals text[] DEFAULT '{}',
    explanation text,
    video_url text,
    created_at timestamp with time zone DEFAULT now()
);

-- tickets
CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    subject text NOT NULL,
    description text,
    status text DEFAULT 'open',
    priority text DEFAULT 'medium',
    created_at timestamp with time zone DEFAULT now()
);

-- logs
CREATE TABLE IF NOT EXISTS public.logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    event text NOT NULL,
    details text,
    device_info text,
    timestamp timestamp with time zone DEFAULT now()
);

-- global_settings
CREATE TABLE IF NOT EXISTS public.global_settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamp with time zone DEFAULT now()
);

-- video_suggestions
CREATE TABLE IF NOT EXISTS public.video_suggestions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id text,
    user_id text,
    video_url text NOT NULL,
    note text,
    status text DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT now()
);

-- lesson_requests
CREATE TABLE IF NOT EXISTS public.lesson_requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    theme text NOT NULL,
    description text,
    status text DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT now()
);

-- lesson_corrections
CREATE TABLE IF NOT EXISTS public.lesson_corrections (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id text,
    user_id text,
    correction_text text NOT NULL,
    status text DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Security Policies (RLS)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_corrections ENABLE ROW LEVEL SECURITY;

-- profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Users can create their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- lessons policies
CREATE POLICY "Public lessons are viewable by all" ON public.lessons FOR SELECT USING (is_static = true OR auth.uid() = user_id);
CREATE POLICY "Users can create their own lessons" ON public.lessons FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lessons" ON public.lessons FOR UPDATE USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- tickets policies
CREATE POLICY "Users can view their own tickets" ON public.tickets FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Users can create tickets" ON public.tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all tickets" ON public.tickets FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- logs policies
CREATE POLICY "Users can view their own logs" ON public.logs FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Users can create logs" ON public.logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all logs" ON public.logs FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- global_settings policies
CREATE POLICY "Global settings are readable by all" ON public.global_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage global settings" ON public.global_settings FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- video_suggestions policies
CREATE POLICY "Users can view their own suggestions" ON public.video_suggestions FOR SELECT USING (user_id = auth.uid()::text OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Users can create suggestions" ON public.video_suggestions FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- lesson_requests policies
CREATE POLICY "Users can view their own requests" ON public.lesson_requests FOR SELECT USING (auth.uid() = user_id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Users can create requests" ON public.lesson_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- lesson_corrections policies
CREATE POLICY "Users can view their own corrections" ON public.lesson_corrections FOR SELECT USING (user_id = auth.uid()::text OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "Users can create corrections" ON public.lesson_corrections FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- 3. Triggers & Functions

-- Auto-create Profile on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists to avoid errors on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
