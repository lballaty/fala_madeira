// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/auth/SupabaseSetupGuide.tsx
// Description: First-run setup screen extracted verbatim from App.tsx. Shown when no Supabase
//   credentials are configured; walks the operator through adding VITE_SUPABASE_URL and
//   VITE_SUPABASE_ANON_KEY.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { AlertTriangle, ExternalLink, Copy } from 'lucide-react';

export const SupabaseSetupGuide = () => (
  <div className="h-screen flex flex-col items-center justify-center p-8 bg-surface text-text space-y-8 text-center">
    <div className="w-20 h-20 bg-orange-100 dark:bg-orange-950/40 rounded-3xl flex items-center justify-center text-orange-600 dark:text-orange-300">
      <AlertTriangle className="w-10 h-10" />
    </div>
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Supabase Setup Required</h1>
      <p className="text-ios-gray text-sm leading-relaxed max-w-xs mx-auto">
        To enable user accounts, progress tracking, and lesson saving, you need to configure your Supabase credentials.
      </p>
    </div>

    <div className="w-full max-w-sm bg-card p-6 rounded-3xl ios-shadow space-y-6 text-left">
      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-ios-blue text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
          <p className="text-sm">Go to <a href="https://supabase.com/dashboard" target="_blank" className="text-ios-blue font-bold inline-flex items-center">Supabase Dashboard <ExternalLink className="w-3 h-3 ml-1" /></a></p>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-ios-blue text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
          <p className="text-sm">Copy your <b>Project URL</b> and <b>Anon Key</b> from Settings &gt; API.</p>
        </div>
        <div className="flex items-start space-x-3">
          <div className="w-6 h-6 rounded-full bg-ios-blue text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
          <p className="text-sm">Add them to the <b>Secrets</b> panel in AI Studio:</p>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <div className="p-3 bg-ios-bg rounded-xl flex items-center justify-between font-mono text-[10px]">
          <span>VITE_SUPABASE_URL</span>
          <Copy className="w-3 h-3 text-ios-gray" />
        </div>
        <div className="p-3 bg-ios-bg rounded-xl flex items-center justify-between font-mono text-[10px]">
          <span>VITE_SUPABASE_ANON_KEY</span>
          <Copy className="w-3 h-3 text-ios-gray" />
        </div>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg shadow-ios-blue/20"
      >
        I've added the keys, refresh
      </button>
    </div>
  </div>
);
