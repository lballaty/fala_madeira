// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/AdminView.tsx
// Description: Admin surface (A12/admin) — a full-screen overlay opened from Settings for admins.
//   Gated: renders nothing when the profile is not role='admin' (RLS is the real enforcement;
//   this is the UI gate). Two tabs: Review Queues (lesson_corrections / lesson_requests / tickets /
//   video_suggestions moderation via useAdminQueues), Content Studio (author/validate/publish
//   Situations/Tracks/Packs via useContentStudio), and User Access (EN-15 — grant a user content
//   access by setting their subscription_tier/unlocked_level via useUserAccess). Lazy-loaded from
//   App.tsx so its data hooks only mount for admins who open it. All data/writes live in the slice
//   hooks; this file is the shell + tab chrome.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SupabaseClient } from '@supabase/supabase-js';
import { ClipboardList, KeyRound, Lock, PenSquare, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { UserProfile } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';
import { useAdminQueues } from './useAdminQueues';
import { useContentStudio } from './useContentStudio';
import { useUserAccess } from './useUserAccess';
import { AdminReviewQueues } from './AdminReviewQueues';
import { ContentStudio } from './ContentStudio';
import { UserAccessPanel } from './UserAccessPanel';

interface AdminViewProps {
  supabase: SupabaseClient | null;
  profile: UserProfile | null;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
  onClose: () => void;
}

type AdminTab = 'queues' | 'studio' | 'access';

export default function AdminView({
  supabase,
  profile,
  showToast,
  handleSupabaseError,
  onClose,
}: AdminViewProps) {
  const isAdmin = profile?.role === 'admin';
  const [tab, setTab] = useState<AdminTab>('queues');

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Hooks must run unconditionally (Rules of Hooks); they no-op when !isAdmin
  // (they guard on isAdmin before any fetch/write).
  const queues = useAdminQueues({ supabase, isAdmin: !!isAdmin, showToast, handleSupabaseError });
  const studio = useContentStudio({ supabase, isAdmin: !!isAdmin, showToast, handleSupabaseError });
  const access = useUserAccess({
    supabase,
    isAdmin: !!isAdmin,
    actorId: profile?.id ?? null,
    showToast,
    handleSupabaseError,
  });

  // Trap focus within the admin overlay while it's mounted (admins only); Escape closes it.
  useFocusTrap(dialogRef, !!isAdmin, onClose);

  // Gate: non-admins get nothing (defense in depth on top of RLS).
  if (!isAdmin) {
    logger.warn('ADMIN_VIEW_DENIED', 'non-admin attempted to open the admin surface — denied', {
      category: 'SECURITY',
      details: { role: profile?.role ?? null },
    });
    return null;
  }

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ios-bg flex flex-col max-w-md mx-auto"
    >
      <header className="flex items-center justify-between px-5 pt-6 pb-3 border-b border-line bg-card safe-area-top">
        <h1 id={titleId} className="text-lg font-bold flex items-center">
          <Lock className="w-4 h-4 mr-2 text-ios-blue" />
          Admin
        </h1>
        <button onClick={onClose} className="text-ios-gray min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Close admin">
          <X className="w-5 h-5" />
        </button>
      </header>

      <nav className="flex border-b border-line bg-card">
        <button
          onClick={() => setTab('queues')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold',
            tab === 'queues' ? 'text-ios-blue border-b-2 border-ios-blue' : 'text-ios-gray',
          )}
        >
          <ClipboardList className="w-4 h-4" /> Review Queues
        </button>
        <button
          onClick={() => setTab('studio')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold',
            tab === 'studio' ? 'text-ios-blue border-b-2 border-ios-blue' : 'text-ios-gray',
          )}
        >
          <PenSquare className="w-4 h-4" /> Content Studio
        </button>
        <button
          onClick={() => setTab('access')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold',
            tab === 'access' ? 'text-ios-blue border-b-2 border-ios-blue' : 'text-ios-gray',
          )}
        >
          <KeyRound className="w-4 h-4" /> User Access
        </button>
      </nav>

      <main className="flex-1 overflow-y-auto no-scrollbar px-5 py-5">
        {tab === 'queues' && <AdminReviewQueues queues={queues} />}
        {tab === 'studio' && <ContentStudio studio={studio} />}
        {tab === 'access' && <UserAccessPanel access={access} />}
      </main>
    </motion.div>
  );
}
