# Supabase Security & Persistence Strategy

This document outlines the security and persistence strategy for FalaMadeira.

## 1. Persistence Strategy

The application uses an **offline-first** approach for user settings and configurations:
- **Local Storage:** Used for immediate state persistence and fast initial loads.
- **Supabase Sync:** States are synchronized with the `profiles` table in Supabase whenever they change.
- **Initial Load:** On login, the app fetches the user's profile from Supabase and updates the local state.

### Persisted Settings
- `playback_speed`: Synced to `profiles.playback_speed`.
- `is_sound_enabled`: Synced to `profiles.is_sound_enabled`.
- `selected_tutor_id`: Synced to `profiles.selected_tutor_id`.
- `unlocked_level`: Synced to `profiles.unlocked_level`.
- `active_month`: Synced to `profiles.active_month`.

## 2. Database Security (Row Level Security)

To ensure data security, you **MUST** enable Row Level Security (RLS) on all tables in your Supabase project. Below are the recommended policies.

### `profiles` Table
- **Enable RLS:** `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;`
- **Policies:**
    - **Select:** `CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);`
    - **Insert:** `CREATE POLICY "Users can create their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);`
    - **Update:** `CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);`
    - **Admin Access:** `CREATE POLICY "Admins can view all profiles" ON profiles FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');`

### `lessons` Table
- **Enable RLS:** `ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;`
- **Policies:**
    - **Select:** `CREATE POLICY "Public lessons are viewable by all" ON lessons FOR SELECT USING (is_static = true OR auth.uid() = user_id);`
    - **Insert:** `CREATE POLICY "Users can create their own lessons" ON lessons FOR INSERT WITH CHECK (auth.uid() = user_id);`
    - **Update:** `CREATE POLICY "Users can update their own lessons" ON lessons FOR UPDATE USING (auth.uid() = user_id);`

### `tickets` & `logs` Tables
- **Enable RLS:** `ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;`
- **Policies:**
    - **Select:** `CREATE POLICY "Users can view their own tickets" ON tickets FOR SELECT USING (auth.uid() = user_id);`
    - **Insert:** `CREATE POLICY "Users can create tickets" ON tickets FOR INSERT WITH CHECK (auth.uid() = user_id);`
    - **Admin Access:** `CREATE POLICY "Admins can manage all tickets" ON tickets FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');`

### `global_settings` Table
- **Enable RLS:** `ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;`
- **Policies:**
    - **Select:** `CREATE POLICY "Global settings are readable by all" ON global_settings FOR SELECT USING (true);`
    - **Admin Manage:** `CREATE POLICY "Admins can manage global settings" ON global_settings FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');`

## 3. Global Configuration

The `global_settings` table is used to store application-wide configurations that can be managed by admins:
- `voice_limit`: The default daily voice message limit for free users.

## 4. Implementation Details

The `App.tsx` file has been updated with `useEffect` hooks that automatically synchronize these states. This ensures that even if the app is updated or the user switches devices, their settings and progress remain intact.
