import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Dev-only diagnostic. This module cannot use src/lib/logger.ts (the logger imports
// getSupabase from here); missing config is surfaced loudly by the logger at the
// consumer sites (e.g. geminiService's EDGE_FN_UNCONFIGURED critical event).
if (import.meta.env.DEV) {
  console.log('Supabase Config Check:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 10) : 'none'
  });
}

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
};

// Export a dummy object that mimics the structure for initial type safety, 
// but we should use getSupabase() in our components.
export const supabase = getSupabase();
