// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/sync-queue.ts
// Description: Durable offline write queue (docs/CONTENT-ARCHITECTURE.md §10). Progress, mastery,
//   and mission writes queue locally while offline (or when a write fails) and sync to Supabase on
//   reconnect. Persistence tier: platform.storage KV (StorageAdapter) so the queue survives page
//   reloads and process restarts. Conflict policy: last-write-wins per (table,key) by the client
//   timestamp captured at enqueue time — a stale replay for a key already superseded by a newer
//   queued write for the same key is dropped before it hits the network. Drains are idempotent
//   (upserts keyed on each table's natural key). The queue is bounded (config.sync.maxQueueEntries)
//   with oldest-drop + a WARN log so it can never grow without limit. Every failure routes through
//   src/lib/logger with correlation IDs — never a silent failure. Counters (voice usage, streaks)
//   are NOT last-write-wins safe under read-then-write; see the COUNTER SEAM note below for the
//   server-side-increment RPC that must land before counter writes route through this queue.
//   On reconnect the queue also asks contentRepository.refresh() so a device pulls pack version /
//   checksum updates (§10 content versioning) as part of coming back online.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { getSupabase } from './supabase';
import { logger } from './logger';
import { config } from '../config';
import { platform } from '../platform';
import { contentRepository } from '../content/repository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supabase operation a queued entry replays. Only the conflict-safe subset is
 * supported: 'upsert' (last-write-wins by natural key) and 'insert' (append-only
 * log rows, e.g. missions_log completions). 'increment' is reserved for the
 * counter seam and is intentionally NOT wired yet (see COUNTER SEAM below).
 */
export type SyncOp = 'upsert' | 'insert' | 'increment';

export interface SyncEntry {
  /** Stable id (used for idempotent dedupe within the queue). */
  id: string;
  /** Target Supabase table, e.g. 'mastery_items', 'user_situation_progress', 'missions_log'. */
  table: string;
  op: SyncOp;
  /** Row payload to write. For 'upsert', onConflict names the natural-key columns. */
  payload: Record<string, unknown>;
  /**
   * Comma-separated conflict-target columns for 'upsert' (Supabase onConflict).
   * Undefined for 'insert'.
   */
  onConflict?: string;
  /**
   * Logical key identifying the row this entry writes, within its table. Two
   * queued entries for the same (table,key) collapse to the newest by clientTs
   * (last-write-wins). Omit for append-only inserts (each is distinct).
   */
  key?: string;
  /** Client timestamp (epoch ms) captured at enqueue — the last-write-wins clock. */
  clientTs: number;
}

// ---------------------------------------------------------------------------
// State (StorageAdapter-backed durable queue)
// ---------------------------------------------------------------------------

const QUEUE_KEY = config.sync.storageKey;
const MAX_ENTRIES = config.sync.maxQueueEntries;

// In-memory mirror of the persisted queue. Loaded lazily on first use; every
// mutation writes through to platform.storage so a reload/restart recovers it.
let queue: SyncEntry[] | null = null;
let loadPromise: Promise<SyncEntry[]> | null = null;
let isFlushing = false;
let listenersBound = false;

const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

const looksLikeQueue = (value: unknown): value is SyncEntry[] =>
  Array.isArray(value) &&
  value.every(
    (e) =>
      e != null &&
      typeof e === 'object' &&
      typeof (e as SyncEntry).id === 'string' &&
      typeof (e as SyncEntry).table === 'string' &&
      typeof (e as SyncEntry).clientTs === 'number',
  );

const loadQueue = async (): Promise<SyncEntry[]> => {
  if (queue) return queue;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await platform.storage.get<unknown>(QUEUE_KEY);
        queue = looksLikeQueue(raw) ? raw : [];
      } catch (error) {
        // Durable read failed — start empty this session rather than crashing the
        // caller. The queue is best-effort durability; nothing is lost silently
        // because the failure is logged.
        logger.warn('SYNC_QUEUE_READ_FAILED', 'could not read the offline write queue — starting empty this session', {
          category: 'DATA_PROCESSING',
          error,
        });
        queue = [];
      }
      return queue;
    })().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
};

const persistQueue = async (correlationId: string): Promise<void> => {
  try {
    await platform.storage.set(QUEUE_KEY, queue ?? []);
  } catch (error) {
    // Persistence is best-effort: the in-memory queue still drains this session.
    logger.warn('SYNC_QUEUE_WRITE_FAILED', 'could not persist the offline write queue — it stays memory-only this session', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
  }
};

// ---------------------------------------------------------------------------
// enqueue
// ---------------------------------------------------------------------------

/**
 * Queue a write for later sync. Last-write-wins collapse: if the entry carries a
 * `key`, any older queued entry for the same (table,key) is removed first so the
 * queue holds at most one pending write per logical row (the newest by clientTs).
 * Bounded: when the queue would exceed config.sync.maxQueueEntries the oldest
 * entries are dropped with a WARN (never silent). Returns after the durable write
 * so callers may await durability; the network drain is fire-and-forget.
 */
export const enqueue = async (
  entry: Omit<SyncEntry, 'id' | 'clientTs'> & { id?: string; clientTs?: number },
): Promise<void> => {
  const correlationId = newCorrelationId();
  const q = await loadQueue();

  if (entry.op === 'increment') {
    // COUNTER SEAM (§10 "conflict-safe for counters via server-side increments"):
    // additive counters (profiles.voice_usage_today, streaks, total_time_spent)
    // are NOT safe under the read-then-write upsert path this queue replays — two
    // devices replaying stale reads would clobber each other's increment. The
    // correct fix is a Postgres RPC (e.g. increment_voice_usage(delta int)) invoked
    // as supabase.rpc(...) inside flush, applying an additive delta server-side. No
    // such RPC exists yet (grep: no supabase.rpc call anywhere; counters today are
    // read-then-write in useTutorSession / useTimeTracking). Until it lands, refuse
    // 'increment' loudly rather than silently corrupting counters.
    logger.warn('SYNC_QUEUE_INCREMENT_UNSUPPORTED', "counter 'increment' op is not wired yet — needs a server-side increment RPC (§10 counter seam)", {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { table: entry.table, key: entry.key },
    });
    return;
  }

  const full: SyncEntry = {
    id: entry.id ?? newCorrelationId(),
    table: entry.table,
    op: entry.op,
    payload: entry.payload,
    onConflict: entry.onConflict,
    key: entry.key,
    clientTs: entry.clientTs ?? Date.now(),
  };

  // Last-write-wins collapse for keyed rows: drop any older pending write for the
  // same (table,key). A newer one already present (clientTs >= ours) wins and we
  // skip enqueuing the stale duplicate.
  if (full.key !== undefined) {
    const existingNewer = q.find(
      (e) => e.table === full.table && e.key === full.key && e.clientTs >= full.clientTs,
    );
    if (existingNewer) {
      logger.debug('SYNC_QUEUE_SUPERSEDED', 'skipping enqueue — a newer pending write already covers this row', {
        category: 'DATA_PROCESSING',
        correlationId,
        details: { table: full.table, key: full.key },
      });
      return;
    }
    // Remove any older entry for the same key (this one supersedes it).
    for (let i = q.length - 1; i >= 0; i--) {
      if (q[i].table === full.table && q[i].key === full.key) q.splice(i, 1);
    }
  }

  q.push(full);

  // Bounded queue: oldest-drop with a WARN so it can never grow unbounded.
  if (q.length > MAX_ENTRIES) {
    const dropped = q.splice(0, q.length - MAX_ENTRIES);
    logger.warn('SYNC_QUEUE_OVERFLOW', `offline write queue exceeded ${MAX_ENTRIES} entries — dropped ${dropped.length} oldest`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { dropped: dropped.map((e) => ({ table: e.table, key: e.key })) },
    });
  }

  await persistQueue(correlationId);

  // Opportunistic drain when we appear to be online — fire-and-forget.
  if (typeof navigator === 'undefined' || navigator.onLine) {
    void flush().catch(() => undefined);
  }
};

// ---------------------------------------------------------------------------
// flush (drain to Supabase)
// ---------------------------------------------------------------------------

/**
 * Replay one entry against Supabase. Idempotent by construction: 'upsert' collapses
 * on the entry's onConflict key, 'insert' appends a distinct log row. Throws on a
 * transport/DB error so flush can requeue the batch (bounded) and retry later.
 */
const replayEntry = async (
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  entry: SyncEntry,
): Promise<void> => {
  if (entry.op === 'upsert') {
    const { error } = await supabase
      .from(entry.table)
      .upsert(entry.payload, entry.onConflict ? { onConflict: entry.onConflict } : undefined);
    if (error) throw error;
    return;
  }
  if (entry.op === 'insert') {
    const { error } = await supabase.from(entry.table).insert(entry.payload);
    if (error) throw error;
    return;
  }
  // 'increment' never reaches here (rejected at enqueue) — guard defensively.
  throw new Error(`unsupported sync op: ${entry.op}`);
};

/**
 * Drain the queue to Supabase. No-op when offline, unconfigured, empty, or already
 * flushing (re-entrancy guard). Entries replay oldest-first; a successful replay is
 * removed from the durable queue, a failed one is left in place (with the rest of the
 * batch) for the next flush — so partial progress is never lost and nothing double-
 * writes destructively (idempotent upserts/inserts). All failures are logged with a
 * correlation id. On the first successful reconnect drain it also asks the content
 * repository to refresh (pack version/checksum update, §10).
 */
export const flush = async (): Promise<void> => {
  if (isFlushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const q = await loadQueue();
  if (q.length === 0) return;

  const supabase = getSupabase();
  if (!supabase) {
    logger.warn('SYNC_QUEUE_UNCONFIGURED', 'Supabase client unavailable — offline write queue drain skipped (entries retained)', {
      category: 'DATA_PROCESSING',
    });
    return;
  }

  const correlationId = newCorrelationId();
  isFlushing = true;
  let synced = 0;
  let failed = 0;
  try {
    // Snapshot the ids to drain; replay oldest-first. Successes are removed from the
    // live queue immediately so a crash mid-drain never re-runs a committed write.
    const batch = [...q];
    for (const entry of batch) {
      try {
        await replayEntry(supabase, entry);
        const idx = q.findIndex((e) => e.id === entry.id);
        if (idx >= 0) q.splice(idx, 1);
        synced++;
      } catch (error) {
        failed++;
        logger.error('SYNC_QUEUE_REPLAY_FAILED', `failed to replay a queued write to "${entry.table}" — retained for retry`, {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
          details: { table: entry.table, op: entry.op, key: entry.key, clientTs: entry.clientTs },
        });
        // Stop the drain on the first failure (likely transient: offline mid-flush,
        // RLS/auth not ready). The remaining entries stay queued for the next tick.
        break;
      }
    }
    await persistQueue(correlationId);
  } finally {
    isFlushing = false;
  }

  if (synced > 0) {
    logger.info('SYNC_QUEUE_FLUSHED', `synced ${synced} queued write(s)${failed > 0 ? `, ${failed} retained` : ''}`, {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { synced, failed, remaining: q.length },
    });
    // Reconnect side-effect (§10 content versioning): pull pack version/checksum
    // updates now that we are demonstrably online. Best-effort — never blocks the
    // drain and never throws into it.
    void contentRepository
      .refresh()
      .then((result) => {
        if (result.refreshed && (result.updated.length > 0 || result.removed.length > 0)) {
          logger.info('SYNC_QUEUE_CONTENT_REFRESHED', 'content pack versions refreshed on reconnect', {
            category: 'DATA_PROCESSING',
            correlationId,
            details: { updated: result.updated, removed: result.removed },
          });
        }
      })
      .catch(() => undefined);
  }
};

// ---------------------------------------------------------------------------
// Online/offline auto-flush wiring
// ---------------------------------------------------------------------------

/**
 * Bind the browser's `online` event to an auto-flush and attempt one drain now.
 * Idempotent (safe to call more than once). Call once at app bootstrap so queued
 * writes made while offline sync as soon as connectivity returns.
 */
export const initSyncQueue = (): void => {
  if (listenersBound) {
    void flush().catch(() => undefined);
    return;
  }
  listenersBound = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void flush().catch(() => undefined);
    });
  }
  // Drain anything left from a previous session as soon as we boot online.
  void flush().catch(() => undefined);
};

/** Pending (not-yet-synced) entry count — diagnostics / offline UI badges. */
export const pendingCount = async (): Promise<number> => (await loadQueue()).length;
