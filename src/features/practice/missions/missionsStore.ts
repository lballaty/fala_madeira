// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/missions/missionsStore.ts
// Description: Persistence layer for the Real-World Missions engine (CONTENT-ARCHITECTURE §3
//   "prep → do-it-for-real → after-action review", §9 missions_log). Writes/reads
//   public.missions_log (user_id, situation_id, status, notes, completed_at) — the `notes`
//   text column carries a structured MissionNotes JSON payload (title, self_made flag,
//   mission_statement, after-action grade + free note, attempt history). When Supabase is
//   unconfigured or the user is signed out, accepted missions degrade to a device-local
//   KV list (platform.storage, `local: true` entries) so a real-world action is never lost —
//   logged loudly, never silent. Local entries are device-local until a future sync step.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { getSupabase } from '../../../lib/supabase';
import { logger, userMessage } from '../../../lib/logger';
import { platform } from '../../../platform';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** missions_log.status vocabulary the engine writes ('planned' = open, DB default). */
export type MissionStatus = 'planned' | 'completed';

/** After-action grades (calm/honest — 'not_yet' keeps the mission open, never a failure). */
export type MissionGrade = 'went_well' | 'partly' | 'not_yet';

/** One after-action attempt (a 'not_yet' keeps the mission open; attempts accumulate). */
export interface MissionAttempt {
  grade: MissionGrade;
  note?: string;
  at: string;
}

/**
 * Structured payload stored as JSON in missions_log.notes (text column).
 * `self_made: true` marks missions the learner built themselves from a
 * situation's patterns/vocab (no authored `mission` data yet — enrichment fills).
 */
export interface MissionNotes {
  title: string;
  self_made: boolean;
  /** The learner's own commitment, e.g. "I will order a bica at the café tomorrow." */
  mission_statement?: string;
  /** Latest after-action grade. */
  grade?: MissionGrade;
  /** Latest after-action free note. */
  note?: string;
  attempts?: MissionAttempt[];
}

/** One missions_log entry as the engine consumes it (notes already parsed). */
export interface MissionLogEntry {
  id: string;
  situation_id: string;
  status: MissionStatus;
  notes: MissionNotes;
  completed_at: string | null;
  created_at: string;
  /** True when the row lives only in device-local storage (signed out / offline). */
  local: boolean;
}

export interface MissionPlanInput {
  situationId: string;
  title: string;
  selfMade: boolean;
  missionStatement?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOCAL_KEY = 'missions:log:local';

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

// Raw row shape shared by the DB select below and the local KV list.
interface MissionRow {
  id: string;
  situation_id: string;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

const isMissionRow = (value: unknown): value is MissionRow => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.situation_id === 'string' &&
    typeof v.status === 'string' &&
    typeof v.created_at === 'string'
  );
};

/** Defensive notes parser: structured JSON preferred, plain text kept as the free note. */
const parseNotes = (raw: string | null): MissionNotes => {
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const p = parsed as Partial<MissionNotes>;
        if (typeof p.title === 'string') {
          return {
            title: p.title,
            self_made: p.self_made === true,
            mission_statement: typeof p.mission_statement === 'string' ? p.mission_statement : undefined,
            grade: p.grade,
            note: typeof p.note === 'string' ? p.note : undefined,
            attempts: Array.isArray(p.attempts) ? p.attempts : undefined,
          };
        }
      }
    } catch {
      // Not JSON — treat the raw text as a plain free note below.
    }
  }
  return { title: 'Mission', self_made: false, note: raw ?? undefined };
};

const toEntry = (row: MissionRow, local: boolean): MissionLogEntry => ({
  id: row.id,
  situation_id: row.situation_id,
  status: row.status === 'completed' ? 'completed' : 'planned',
  notes: parseNotes(row.notes),
  completed_at: row.completed_at,
  created_at: row.created_at,
  local,
});

const getUserId = async (correlationId: string): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch (error) {
    logger.warn('MISSIONS_AUTH_UNAVAILABLE', 'could not resolve the signed-in user — missions fall back to device-local storage', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
    return null;
  }
};

// ---------------------------------------------------------------------------
// Device-local fallback (platform.storage KV)
// ---------------------------------------------------------------------------

const readLocalRows = async (correlationId: string): Promise<MissionRow[]> => {
  try {
    const raw = await platform.storage.get<unknown>(LOCAL_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(isMissionRow);
  } catch (error) {
    logger.warn('MISSIONS_LOCAL_READ_FAILED', 'could not read the local missions list — treating it as empty', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
    return [];
  }
};

const writeLocalRows = async (rows: MissionRow[], correlationId: string): Promise<void> => {
  // Local persistence failing is a real loss for a signed-out user — surface it.
  try {
    await platform.storage.set(LOCAL_KEY, rows);
  } catch (error) {
    const event = logger.error('MISSIONS_LOCAL_WRITE_FAILED', 'could not persist the mission to device storage', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
    });
    throw new Error(
      userMessage('MISSIONS_LOCAL_WRITE_FAILED', 'Could not save your mission on this device. Please try again.', event.request_id)
    );
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * All mission log entries visible to this user/device: server rows (signed in)
 * merged with device-local rows, newest first. A failed server read degrades to
 * the local list (logged) — the view still renders.
 */
export const listMissionLog = async (): Promise<MissionLogEntry[]> => {
  const correlationId = newId();
  const entries: MissionLogEntry[] = [];

  const supabase = getSupabase();
  const userId = await getUserId(correlationId);
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('missions_log')
        .select('id, situation_id, status, notes, completed_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      for (const row of data ?? []) {
        if (isMissionRow(row)) entries.push(toEntry(row, false));
      }
    } catch (error) {
      logger.warn('MISSIONS_FETCH_FAILED', 'could not fetch missions_log from the server — showing local missions only', {
        category: 'DATA_PROCESSING',
        correlationId,
        error,
      });
    }
  }

  const localRows = await readLocalRows(correlationId);
  entries.push(...localRows.map((row) => toEntry(row, true)));
  entries.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return entries;
};

/**
 * Record an accepted mission (status 'planned' — the open, do-it-for-real state).
 * Signed in → missions_log insert; otherwise (or on insert failure) → device-local
 * row so the acceptance is never lost. Never guilt-trips: 'planned' has no deadline.
 */
export const logMissionPlanned = async (input: MissionPlanInput): Promise<MissionLogEntry> => {
  const correlationId = newId();
  const notes: MissionNotes = {
    title: input.title,
    self_made: input.selfMade,
    mission_statement: input.missionStatement?.trim() || undefined,
  };
  const notesJson = JSON.stringify(notes);

  const supabase = getSupabase();
  const userId = await getUserId(correlationId);
  if (supabase && userId) {
    try {
      const { data, error } = await supabase
        .from('missions_log')
        .insert({ user_id: userId, situation_id: input.situationId, status: 'planned', notes: notesJson })
        .select('id, situation_id, status, notes, completed_at, created_at')
        .single();
      if (error) throw error;
      if (isMissionRow(data)) return toEntry(data, false);
      throw new Error('missions_log insert returned an unexpected row shape');
    } catch (error) {
      logger.warn('MISSIONS_PERSIST_FAILED', 'could not insert into missions_log — saving the mission on this device instead', {
        category: 'DATA_PROCESSING',
        correlationId,
        error,
        details: { situationId: input.situationId },
      });
    }
  } else {
    logger.warn('MISSIONS_OFFLINE_LOCAL', 'no signed-in user/Supabase — mission saved to device-local storage', {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { situationId: input.situationId },
    });
  }

  const row: MissionRow = {
    id: `local-${newId()}`,
    situation_id: input.situationId,
    status: 'planned',
    notes: notesJson,
    completed_at: null,
    created_at: new Date().toISOString(),
  };
  const rows = await readLocalRows(correlationId);
  await writeLocalRows([row, ...rows], correlationId);
  return toEntry(row, true);
};

/**
 * Record the after-action review. 'went_well'/'partly' close the mission
 * (status 'completed' + completed_at); 'not_yet' keeps it open ('planned') with
 * the attempt recorded — trying counts, nothing scolds (§12). Throws a
 * user-facing Error (with support Ref) when the write genuinely fails, so the
 * view can keep the screen and let the user retry.
 */
export const logMissionOutcome = async (
  entry: MissionLogEntry,
  grade: MissionGrade,
  note: string
): Promise<MissionLogEntry> => {
  const correlationId = newId();
  const completed = grade !== 'not_yet';
  const trimmedNote = note.trim() || undefined;
  const nextNotes: MissionNotes = {
    ...entry.notes,
    grade,
    note: trimmedNote,
    attempts: [...(entry.notes.attempts ?? []), { grade, note: trimmedNote, at: new Date().toISOString() }],
  };
  const nextStatus: MissionStatus = completed ? 'completed' : 'planned';
  const completedAt = completed ? new Date().toISOString() : null;
  const notesJson = JSON.stringify(nextNotes);

  if (entry.local) {
    const rows = await readLocalRows(correlationId);
    const next = rows.map((row) =>
      row.id === entry.id ? { ...row, status: nextStatus, notes: notesJson, completed_at: completedAt } : row
    );
    await writeLocalRows(next, correlationId);
    return { ...entry, status: nextStatus, notes: nextNotes, completed_at: completedAt };
  }

  const supabase = getSupabase();
  if (!supabase) {
    const event = logger.error('MISSIONS_PERSIST_FAILED', 'Supabase unavailable while saving an after-action review for a server mission', {
      category: 'DATA_PROCESSING',
      correlationId,
      details: { missionId: entry.id, grade },
    });
    throw new Error(
      userMessage('MISSIONS_PERSIST_FAILED', 'Could not save your review — please check your connection and try again.', event.request_id)
    );
  }
  try {
    const { error } = await supabase
      .from('missions_log')
      .update({ status: nextStatus, notes: notesJson, completed_at: completedAt })
      .eq('id', entry.id);
    if (error) throw error;
  } catch (error) {
    const event = logger.error('MISSIONS_PERSIST_FAILED', 'could not update missions_log with the after-action review', {
      category: 'DATA_PROCESSING',
      correlationId,
      error,
      details: { missionId: entry.id, grade },
    });
    throw new Error(
      userMessage('MISSIONS_PERSIST_FAILED', 'Could not save your review — please check your connection and try again.', event.request_id)
    );
  }
  return { ...entry, status: nextStatus, notes: nextNotes, completed_at: completedAt };
};
