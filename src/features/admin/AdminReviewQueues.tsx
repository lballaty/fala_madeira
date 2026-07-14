// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/admin/AdminReviewQueues.tsx
// Description: Admin review-queue UI (A12/admin). Renders the four moderation queues from
//   useAdminQueues — lesson_corrections, lesson_requests, tickets, video_suggestions — as
//   compact cards with approve/reject/resolve actions. Pending items surface first; resolved
//   items show a status pill. Presentational only: all data + writes live in useAdminQueues.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useMemo, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { AdminQueuesState } from './useAdminQueues';

interface AdminReviewQueuesProps {
  queues: AdminQueuesState;
}

const statusPill = (status: string): string => {
  const pending = status === 'pending' || status === 'open';
  return pending
    ? 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300'
    : status === 'approved' || status === 'implemented' || status === 'closed'
      ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300'
      : 'bg-surface text-muted';
};

const Pill = ({ status }: { status: string }) => (
  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusPill(status)}`}>{status}</span>
);

const EmptyRow = ({ label }: { label: string }) => (
  <p className="text-xs text-ios-gray italic px-1 py-2">No {label}.</p>
);

const Section = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold text-ios-gray uppercase tracking-wide">{title}</h3>
      <span className="text-[10px] font-bold text-ios-blue">{count}</span>
    </div>
    <div className="space-y-2">{children}</div>
  </section>
);

const ActionButtons = ({
  onApprove,
  onReject,
  approveLabel,
  rejectLabel,
}: {
  onApprove: () => void;
  onReject: () => void;
  approveLabel: string;
  rejectLabel: string;
}) => (
  <div className="flex space-x-2 shrink-0">
    <button
      onClick={onApprove}
      title={approveLabel}
      aria-label={approveLabel}
      className="p-1.5 bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900 transition-colors"
    >
      <Check className="w-3.5 h-3.5" />
    </button>
    <button
      onClick={onReject}
      title={rejectLabel}
      aria-label={rejectLabel}
      className="p-1.5 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);

export const AdminReviewQueues = ({ queues }: AdminReviewQueuesProps) => {
  const {
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
  } = queues;

  const pendingCorrections = corrections.filter((c) => c.status === 'pending');
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in-progress');
  const pendingVideos = videos.filter((v) => v.status === 'pending');

  // Support-ticket triage: admins see ALL tickets (the data is already loaded), filterable by
  // status + free-text search. Closed tickets are now visible and reopenable — the old flat
  // open-only queue hid resolved tickets, so testers' reports vanished once triaged.
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketStatus, setTicketStatus] = useState<'all' | 'open' | 'in-progress' | 'closed'>('open');
  const filteredTickets = useMemo(() => {
    const q = ticketQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (ticketStatus !== 'all' && t.status !== ticketStatus) return false;
      if (!q) return true;
      return t.subject.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    });
  }, [tickets, ticketQuery, ticketStatus]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ios-gray">
          {pendingCorrections.length + pendingRequests.length + openTickets.length + pendingVideos.length} item(s)
          awaiting action
        </p>
        <button
          onClick={() => void refresh()}
          disabled={isLoading}
          className="flex items-center space-x-1 text-xs font-bold text-ios-blue disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <Section title="Lesson Corrections" count={pendingCorrections.length}>
        {pendingCorrections.length === 0 ? (
          <EmptyRow label="pending corrections" />
        ) : (
          pendingCorrections.map((row) => (
            <div key={row.id} className="p-3 bg-ios-bg rounded-xl flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-ios-blue">Lesson: {row.lesson_id}</p>
                <p className="text-xs mt-1 break-words">{row.correction_text}</p>
              </div>
              <ActionButtons
                onApprove={() => void resolveCorrection(row, 'approved')}
                onReject={() => void resolveCorrection(row, 'rejected')}
                approveLabel="Approve correction"
                rejectLabel="Reject correction"
              />
            </div>
          ))
        )}
      </Section>

      <Section title="Lesson Requests" count={pendingRequests.length}>
        {pendingRequests.length === 0 ? (
          <EmptyRow label="pending requests" />
        ) : (
          pendingRequests.map((row) => (
            <div key={row.id} className="p-3 bg-ios-bg rounded-xl flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-ios-blue">{row.theme}</p>
                <p className="text-xs mt-1 break-words">{row.description}</p>
              </div>
              <ActionButtons
                onApprove={() => void resolveRequest(row, 'implemented')}
                onReject={() => void resolveRequest(row, 'reviewed')}
                approveLabel="Mark implemented"
                rejectLabel="Mark reviewed"
              />
            </div>
          ))
        )}
      </Section>

      <Section title="Support Tickets" count={filteredTickets.length}>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={ticketQuery}
            onChange={(e) => setTicketQuery(e.target.value)}
            placeholder="Search subject or description…"
            aria-label="Search tickets"
            className="flex-1 min-w-0 text-xs px-2 py-1.5 bg-surface rounded-lg focus:outline-none"
          />
          <select
            value={ticketStatus}
            onChange={(e) => setTicketStatus(e.target.value as typeof ticketStatus)}
            aria-label="Filter tickets by status"
            className="text-xs py-1.5 px-2 bg-surface rounded-lg focus:outline-none"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="in-progress">In progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        {filteredTickets.length === 0 ? (
          <EmptyRow label="tickets match this filter" />
        ) : (
          filteredTickets.map((row) => (
            <div key={row.id} className="p-3 bg-ios-bg rounded-xl flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold text-ios-blue truncate">{row.subject}</p>
                  <Pill status={row.status} />
                </div>
                <p className="text-xs mt-1 break-words">{row.description}</p>
                <p className="text-[10px] text-ios-gray mt-1">
                  {row.user_id.slice(0, 8)} · {new Date(row.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {row.status !== 'closed' && (
                  <button
                    onClick={() => void resolveTicket(row, 'closed')}
                    aria-label="Close ticket"
                    className="px-2 py-1 text-[10px] font-bold bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900 transition-colors"
                  >
                    Close
                  </button>
                )}
                {row.status === 'open' && (
                  <button
                    onClick={() => void resolveTicket(row, 'in-progress')}
                    aria-label="Mark in-progress"
                    className="px-2 py-1 text-[10px] font-bold bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors"
                  >
                    In progress
                  </button>
                )}
                {row.status === 'closed' && (
                  <button
                    onClick={() => void resolveTicket(row, 'open')}
                    aria-label="Reopen ticket"
                    className="px-2 py-1 text-[10px] font-bold bg-yellow-100 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900 transition-colors"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Video Suggestions" count={pendingVideos.length}>
        {pendingVideos.length === 0 ? (
          <EmptyRow label="pending video suggestions" />
        ) : (
          pendingVideos.map((row) => (
            <div key={row.id} className="p-3 bg-ios-bg rounded-xl flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-ios-blue">Lesson: {row.lesson_id}</p>
                <p className="text-[10px] truncate mt-1">{row.video_url}</p>
                {row.note && <p className="text-[10px] text-ios-gray italic mt-1">"{row.note}"</p>}
              </div>
              <ActionButtons
                onApprove={() => void resolveVideo(row, 'approved')}
                onReject={() => void resolveVideo(row, 'rejected')}
                approveLabel="Approve video"
                rejectLabel="Reject video"
              />
            </div>
          ))
        )}
      </Section>
    </div>
  );
};
