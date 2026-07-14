// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/logger.ts
// Description: Centralized client-side logger (ENGINEERING-STANDARDS §3.1). Every error path
//   in src/ routes through this module. Carries correlation IDs (session_id per app session,
//   request_id per invocation, correlation_id for request-level flows, user_id when known),
//   structured level/category/event_type/details. Persistence tiers: (a) in-memory ring
//   buffer that feeds the diagnostic-logs UI ("Send Logs" in SupportModal), (b) best-effort
//   batched insert of ERROR/CRITICAL events into the existing `public.logs` table (RLS
//   requires an authenticated user; events are queued locally while offline/signed-out and
//   flushed on the next timer tick), (c) dev-only console echo behind import.meta.env.DEV.
//   Also exports userMessage(code, message, ref) — the canonical user-visible error surface
//   ("message (Ref: abc12345)") so support can pivot from a toast to the matching log record.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { getSupabase } from './supabase';
import { config } from '../config';

export type LogLevel = 'CRITICAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export type LogCategory =
  | 'SYSTEM_HEALTH'
  | 'SECURITY'
  | 'DATA_PROCESSING'
  | 'AI_DECISION'
  | 'USER_ACTION';

export interface LogEvent {
  level: LogLevel;
  category: LogCategory;
  event_type: string;
  message: string;
  details?: Record<string, unknown>;
  session_id: string;
  request_id: string;
  correlation_id: string;
  user_id: string | null;
  timestamp: string;
}

export interface LogOptions {
  category?: LogCategory;
  details?: Record<string, unknown>;
  /** Request-level ID propagated across a flow (e.g. edge-function requestId). Defaults to the event's own request_id. */
  correlationId?: string;
  /** Raw error object; serialized into details.error. */
  error?: unknown;
}

const uuid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;

// One app session = one module lifetime (page load).
const SESSION_ID = uuid();

// Tier (a): in-memory ring buffer feeding the diagnostic-logs UI.
const RING_BUFFER_MAX = config.logging.ringBufferMax;
const ringBuffer: LogEvent[] = [];

// Tier (b): ERROR/CRITICAL persistence queue → the service-role `log-sink` edge function
// (batched, best-effort). The sink inserts with service-role, so anonymous/pre-auth events
// (user_id = null) persist too — the old direct table insert was RLS-gated on
// auth.uid() = user_id and silently dropped signed-out events (OBSERVABILITY-CONTRACT §6/§7).
// Events still queue locally while offline and flush on the next timer tick.
const PERSIST_QUEUE_MAX = config.logging.persistQueueMax;
const FLUSH_INTERVAL_MS = config.logging.flushIntervalMs;
const FLUSH_BATCH_TRIGGER = config.logging.flushBatchTrigger;
const persistQueue: LogEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

let currentUserId: string | null = null;

const serializeError = (err: unknown): Record<string, unknown> => {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: import.meta.env.DEV ? err.stack : undefined };
  }
  if (err && typeof err === 'object') {
    const errObj = err as { message?: unknown; code?: unknown; details?: unknown };
    return { message: errObj.message ?? String(err), code: errObj.code, details: errObj.details };
  }
  return { message: String(err) };
};

// Best-effort human-readable message from an unknown thrown value (Error instance,
// Supabase error object, or primitive). Returns undefined when no message exists so
// callers can fall back: `errorMessage(err) || 'Operation failed'`.
export const errorMessage = (err: unknown): string | undefined => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    return message == null ? undefined : String(message);
  }
  return undefined;
};

const devEcho = (event: LogEvent) => {
  if (!import.meta.env.DEV) return;
  const line = `[${event.level}] [${event.category}] ${event.event_type}: ${event.message} (req: ${event.request_id.slice(0, 8)})`;
  if (event.level === 'CRITICAL' || event.level === 'ERROR') console.error(line, event.details ?? ''); // dev echo only; import.meta.env.DEV guarded above
  else if (event.level === 'WARN') console.warn(line, event.details ?? ''); // dev echo only; import.meta.env.DEV guarded above
  else console.log(line, event.details ?? '');
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPersistQueue();
  }, FLUSH_INTERVAL_MS);
};

/** Best-effort batched write of queued ERROR/CRITICAL events to the log-sink. Never throws. */
export const flushPersistQueue = async (): Promise<void> => {
  if (isFlushing || persistQueue.length === 0) return;
  const supabase = getSupabase();
  // No client yet (very early boot) — hold and retry on the next tick. NOTE: unlike before, we
  // no longer gate on a signed-in user: the log-sink writes with service-role, so pre-auth and
  // signed-out events (user_id = null) now persist too (OBSERVABILITY-CONTRACT §7).
  if (!supabase) {
    scheduleFlush();
    return;
  }

  isFlushing = true;
  const batch = persistQueue.splice(0, persistQueue.length);
  try {
    // Post the events verbatim; the sink validates, size/rate-caps, and maps them onto the
    // public.logs schema (level/category/event_type/correlation IDs/trace_id + details).
    const { error } = await supabase.functions.invoke('log-sink', { body: { events: batch } });
    if (error) {
      // Requeue (bounded) so the next timer tick retries — e.g. transient offline.
      persistQueue.unshift(...batch.slice(0, PERSIST_QUEUE_MAX - persistQueue.length));
      scheduleFlush();
    }
  } catch {
    // Persistence is best-effort by contract; the ring buffer still holds the events.
    persistQueue.unshift(...batch.slice(0, PERSIST_QUEUE_MAX - persistQueue.length));
    scheduleFlush();
  } finally {
    isFlushing = false;
  }
};

const record = (level: LogLevel, eventType: string, message: string, options: LogOptions = {}): LogEvent => {
  const requestId = uuid();
  const details = { ...(options.details ?? {}) };
  if (options.error !== undefined) details.error = serializeError(options.error);

  const event: LogEvent = {
    level,
    category: options.category ?? 'SYSTEM_HEALTH',
    event_type: eventType,
    message,
    details: Object.keys(details).length > 0 ? details : undefined,
    session_id: SESSION_ID,
    request_id: requestId,
    correlation_id: options.correlationId ?? requestId,
    user_id: currentUserId,
    timestamp: new Date().toISOString(),
  };

  ringBuffer.push(event);
  if (ringBuffer.length > RING_BUFFER_MAX) ringBuffer.shift();

  if (level === 'CRITICAL' || level === 'ERROR') {
    if (persistQueue.length < PERSIST_QUEUE_MAX) persistQueue.push(event);
    if (persistQueue.length >= FLUSH_BATCH_TRIGGER) void flushPersistQueue();
    else scheduleFlush();
  }

  devEcho(event);
  return event;
};

export const logger = {
  critical: (eventType: string, message: string, options?: LogOptions) => record('CRITICAL', eventType, message, options),
  error: (eventType: string, message: string, options?: LogOptions) => record('ERROR', eventType, message, options),
  warn: (eventType: string, message: string, options?: LogOptions) => record('WARN', eventType, message, options),
  info: (eventType: string, message: string, options?: LogOptions) => record('INFO', eventType, message, options),
  debug: (eventType: string, message: string, options?: LogOptions) => record('DEBUG', eventType, message, options),

  /** Called by the auth slice whenever the signed-in user changes; unblocks queue flushing. */
  setUser(userId: string | null) {
    currentUserId = userId;
    if (userId && persistQueue.length > 0) void flushPersistQueue();
  },

  getSessionId: () => SESSION_ID,

  /** Snapshot of the ring buffer for the diagnostic-logs UI (SupportModal "Send Logs"). */
  getRecentLogs: (): LogEvent[] => [...ringBuffer],
};

/** Short, quotable support reference derived from a correlation/request ID. */
export const shortRef = (id: string): string => id.replace(/-/g, '').slice(0, 8);

/**
 * Canonical user-visible error surface (ENGINEERING-STANDARDS §3.2): a machine-readable
 * code, a calm human-readable message, and a short Ref support can pivot on. Returns the
 * display string toasts/screens show; the code + ref travel with the paired log record.
 */
export const userMessage = (code: string, message: string, ref?: string): string =>
  ref ? `${message} (Ref: ${shortRef(ref)})` : `${message} [${code}]`;
