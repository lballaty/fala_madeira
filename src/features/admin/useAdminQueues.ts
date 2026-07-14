// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/useAdminQueues.ts
// Description: Admin review-queue data hook (A12/admin). Loads the four moderation queues that
//   already exist in the schema — lesson_corrections, lesson_requests, tickets,
//   video_suggestions — and exposes approve/reject/resolve actions. Every action performs an
//   RLS-gated UPDATE (admin RLS from migrations 00001/00003/00004) with an optimistic in-memory
//   update rolled back on failure, and routes failures through src/lib/logger + handleSupabaseError
//   so nothing fails silently. Admin-only: RLS enforces the write, the caller (AdminView) gates
//   the render. No hardcoded fallbacks — a missing Supabase client fails loudly through the logger.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { LessonCorrection, LessonRequest, Ticket, VideoSuggestion } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { logger } from '../../lib/logger';

/** The four moderation surfaces this queue hook manages (each maps to a table). */
export type QueueKind = 'corrections' | 'requests' | 'tickets' | 'videos';

interface AdminQueuesDeps {
  supabase: SupabaseClient | null;
  isAdmin: boolean;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
}

export interface AdminQueuesState {
  corrections: LessonCorrection[];
  requests: LessonRequest[];
  tickets: Ticket[];
  videos: VideoSuggestion[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  /** Correction: approve (status→approved) or reject (status→rejected). */
  resolveCorrection: (row: LessonCorrection, decision: 'approved' | 'rejected') => Promise<void>;
  /** Lesson request: mark reviewed or implemented. */
  resolveRequest: (row: LessonRequest, status: 'reviewed' | 'implemented') => Promise<void>;
  /** Support ticket: reopen, mark in-progress, or close. */
  resolveTicket: (row: Ticket, status: 'open' | 'in-progress' | 'closed') => Promise<void>;
  /** Video suggestion: approve or reject. */
  resolveVideo: (row: VideoSuggestion, decision: 'approved' | 'rejected') => Promise<void>;
}

const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

export const useAdminQueues = ({
  supabase,
  isAdmin,
  showToast,
  handleSupabaseError,
}: AdminQueuesDeps): AdminQueuesState => {
  const [corrections, setCorrections] = useState<LessonCorrection[]>([]);
  const [requests, setRequests] = useState<LessonRequest[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [videos, setVideos] = useState<VideoSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    const correlationId = newCorrelationId();
    setIsLoading(true);
    try {
      // Admin RLS grants SELECT across all rows on these tables (00001/00003/00004).
      const [c, r, t, v] = await Promise.all([
        supabase.from('lesson_corrections').select('*').order('created_at', { ascending: false }),
        supabase.from('lesson_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('tickets').select('*').order('created_at', { ascending: false }),
        supabase.from('video_suggestions').select('*').order('created_at', { ascending: false }),
      ]);

      if (c.error) throw c.error;
      if (r.error) throw r.error;
      if (t.error) throw t.error;
      if (v.error) throw v.error;

      setCorrections((c.data ?? []) as LessonCorrection[]);
      setRequests((r.data ?? []) as LessonRequest[]);
      setTickets((t.data ?? []) as Ticket[]);
      setVideos((v.data ?? []) as VideoSuggestion[]);
      logger.info('ADMIN_QUEUES_LOADED', 'admin review queues loaded', {
        category: 'DATA_PROCESSING',
        correlationId,
        details: {
          corrections: c.data?.length ?? 0,
          requests: r.data?.length ?? 0,
          tickets: t.data?.length ?? 0,
          videos: v.data?.length ?? 0,
        },
      });
    } catch (error) {
      logger.error('ADMIN_QUEUES_LOAD_FAILED', 'could not load admin review queues', {
        category: 'DATA_PROCESSING',
        correlationId,
        error,
      });
      handleSupabaseError(error, 'refresh', 'admin_queues');
    } finally {
      setIsLoading(false);
    }
  }, [supabase, isAdmin, handleSupabaseError]);

  // Initial load on becoming admin. State updates live in refresh's promise callbacks
  // (deferred via a microtask) so no setState fires synchronously in the effect body.
  useEffect(() => {
    if (!isAdmin) return;
    void Promise.resolve().then(() => refresh());
  }, [isAdmin, refresh]);

  // Generic optimistic status update: applies the new status locally, writes the RLS-gated
  // UPDATE, and rolls the local state back on failure (never a silent failure).
  const updateStatus = useCallback(
    async <T extends { id: string; status: string }>(
      table: string,
      row: T,
      nextStatus: string,
      setList: React.Dispatch<React.SetStateAction<T[]>>,
      successMessage: string,
    ): Promise<void> => {
      if (!supabase) {
        logger.error('ADMIN_QUEUE_NO_CLIENT', `cannot update ${table}: Supabase client unavailable`, {
          category: 'DATA_PROCESSING',
          details: { table, rowId: row.id },
        });
        showToast('Not connected — cannot save', 'error');
        return;
      }
      const correlationId = newCorrelationId();
      const previousStatus = row.status;
      // Optimistic: reflect the new status immediately.
      setList((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: nextStatus } : item)));
      try {
        const { error } = await supabase.from(table).update({ status: nextStatus }).eq('id', row.id);
        if (error) throw error;
        logger.info('ADMIN_QUEUE_RESOLVED', `${table} row ${row.id} → ${nextStatus}`, {
          category: 'USER_ACTION',
          correlationId,
          details: { table, rowId: row.id, from: previousStatus, to: nextStatus },
        });
        showToast(successMessage, 'success');
      } catch (error) {
        // Roll back the optimistic update.
        setList((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: previousStatus } : item)));
        logger.error('ADMIN_QUEUE_UPDATE_FAILED', `failed to update ${table} row ${row.id}`, {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
          details: { table, rowId: row.id, attemptedStatus: nextStatus },
        });
        handleSupabaseError(error, 'updateStatus', table);
      }
    },
    [supabase, showToast, handleSupabaseError],
  );

  const resolveCorrection = useCallback(
    (row: LessonCorrection, decision: 'approved' | 'rejected') =>
      updateStatus('lesson_corrections', row, decision, setCorrections, `Correction ${decision}`),
    [updateStatus],
  );

  const resolveRequest = useCallback(
    (row: LessonRequest, status: 'reviewed' | 'implemented') =>
      updateStatus('lesson_requests', row, status, setRequests, `Request marked ${status}`),
    [updateStatus],
  );

  const resolveTicket = useCallback(
    (row: Ticket, status: 'open' | 'in-progress' | 'closed') =>
      updateStatus('tickets', row, status, setTickets, `Ticket marked ${status}`),
    [updateStatus],
  );

  const resolveVideo = useCallback(
    (row: VideoSuggestion, decision: 'approved' | 'rejected') =>
      updateStatus('video_suggestions', row, decision, setVideos, `Video ${decision}`),
    [updateStatus],
  );

  return {
    corrections,
    requests,
    tickets,
    videos,
    isLoading,
    refresh,
    resolveCorrection,
    resolveRequest,
    resolveTicket,
    resolveVideo,
  };
};
