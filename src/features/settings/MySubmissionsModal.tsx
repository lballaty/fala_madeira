// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/MySubmissionsModal.tsx
// Description: "My Submissions" sheet (feedback-status-visibility). Read-only view of the
//   current user's own lesson corrections, lesson requests, support tickets, and video
//   suggestions, grouped by type, each showing its real current status and submitted date.
//   Owner-RLS SELECTs (migrations 00001/00003) mean these are only the caller's rows. Calm and
//   honest: it shows the true status per each table's vocabulary and never fabricates progress.
//   Presentational only — all data + loading/error state live in useSettings.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { MySubmissions } from './useSettings';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface MySubmissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: MySubmissions;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}

/** Local calendar date for a submitted-at timestamp (calm, no time-of-day noise). */
const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'Unknown date'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Status → pill colour. Yellow = still in the queue; green = resolved in the user's favour or
// shipped; grey = a closed/reviewed/rejected terminal state. Honest, not aspirational.
const statusPill = (status: string): string => {
  if (status === 'pending' || status === 'open' || status === 'in-progress') {
    return 'bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300';
  }
  if (status === 'approved' || status === 'implemented' || status === 'closed') {
    return 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300';
  }
  return 'bg-surface text-muted';
};

const StatusPill = ({ status }: { status: string }) => (
  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${statusPill(status)}`}>
    {status}
  </span>
);

const Group = ({
  title,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold text-ios-gray uppercase tracking-wide">{title}</h3>
      <span className="text-[10px] font-bold text-ios-blue">{count}</span>
    </div>
    {count === 0 ? (
      <p className="text-xs text-ios-gray italic px-1 py-2">{emptyLabel}</p>
    ) : (
      <div className="space-y-2">{children}</div>
    )}
  </section>
);

// Compact submitted row: title/primary text on the left, status pill + date on the right.
const Row = ({
  primary,
  secondary,
  status,
  createdAt,
}: {
  primary: string;
  secondary?: string;
  status: string;
  createdAt: string;
}) => (
  <div className="p-3 bg-ios-bg rounded-xl flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="text-xs font-semibold break-words">{primary}</p>
      {secondary && <p className="text-[11px] text-ios-gray mt-0.5 break-words">{secondary}</p>}
      <p className="text-[10px] text-ios-gray mt-1">Submitted {formatDate(createdAt)}</p>
    </div>
    <StatusPill status={status} />
  </div>
);

export const MySubmissionsModal = ({
  isOpen,
  onClose,
  submissions,
  isLoading,
  error,
  onRefresh,
}: MySubmissionsModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, isOpen, onClose);
  const { corrections, requests, tickets, videos } = submissions;
  const total = corrections.length + requests.length + tickets.length + videos.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="bg-card w-full max-w-lg rounded-t-[32px] sm:rounded-[40px] overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-ios-bg flex items-center justify-between">
              <div>
                <h2 id={titleId} className="text-xl font-bold tracking-tight">My Submissions</h2>
                <p className="text-[11px] text-ios-gray mt-0.5">
                  The current status of everything you have sent us.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => void onRefresh()}
                  disabled={isLoading}
                  aria-label="Refresh submissions"
                  title="Refresh"
                  className="p-2 bg-ios-bg rounded-full text-ios-blue disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={onClose} aria-label="Close" className="p-2 bg-ios-bg rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {error ? (
                <div className="p-4 bg-red-50 dark:bg-red-950/40 rounded-2xl border border-red-100 dark:border-red-900">
                  <p className="text-sm text-red-600 dark:text-red-300 font-medium">{error}</p>
                  <button
                    onClick={() => void onRefresh()}
                    className="mt-2 text-xs font-bold text-red-600 underline active:opacity-60"
                  >
                    Try again
                  </button>
                </div>
              ) : isLoading && total === 0 ? (
                <div className="flex items-center justify-center py-10 text-ios-gray">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Loading your submissions…</span>
                </div>
              ) : (
                <>
                  <Group
                    title="Lesson Corrections"
                    count={corrections.length}
                    emptyLabel="No corrections submitted yet."
                  >
                    {corrections.map((row) => (
                      <Row
                        key={row.id}
                        primary={`Lesson: ${row.lesson_id}`}
                        secondary={row.correction_text}
                        status={row.status}
                        createdAt={row.created_at}
                      />
                    ))}
                  </Group>

                  <Group
                    title="Lesson Requests"
                    count={requests.length}
                    emptyLabel="No lesson requests submitted yet."
                  >
                    {requests.map((row) => (
                      <Row
                        key={row.id}
                        primary={row.theme}
                        secondary={row.description}
                        status={row.status}
                        createdAt={row.created_at}
                      />
                    ))}
                  </Group>

                  <Group
                    title="Support Tickets"
                    count={tickets.length}
                    emptyLabel="No support tickets submitted yet."
                  >
                    {tickets.map((row) => (
                      <Row
                        key={row.id}
                        primary={row.subject}
                        secondary={row.description}
                        status={row.status}
                        createdAt={row.created_at}
                      />
                    ))}
                  </Group>

                  <Group
                    title="Video Suggestions"
                    count={videos.length}
                    emptyLabel="No video suggestions submitted yet."
                  >
                    {videos.map((row) => (
                      <Row
                        key={row.id}
                        primary={`Lesson: ${row.lesson_id}`}
                        secondary={row.note ? `"${row.note}"` : row.video_url}
                        status={row.status}
                        createdAt={row.created_at}
                      />
                    ))}
                  </Group>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MySubmissionsModal;
