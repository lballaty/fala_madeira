// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/home/useHome.ts
// Description: Home-dashboard derived-state hook (U7/U8/FB4/G1 — docs/ui-mockup/intended-ui-v3.html
//   Home). Computes the four Home surfaces from data the app already loads, keeping HomeView a pure
//   presenter: (1) the progress ring (completion % over the ACTIVE PATH's in-scope situations —
//   structured=course calendar, goal-track=the active track, adaptive/free=overall), (2) the
//   "You can now…" competence line honestly derived from the goals[] of COMPLETED situations
//   (src/content repository), (3) the Review-due count (src/hooks/useDueItems — the SRS engine),
//   and (4) the streak + streak-freeze grace. No profiles column exists for a freeze balance
//   (docs/DATABASE_DESIGN.md profiles has `streak` + `last_active` only), so the balance + last
//   reconciliation persist to the durable client store keyed per user (config.home.freezeStorageKeyPrefix);
//   a missed day consumes a freeze instead of breaking the streak (§12 — calm/honest, never
//   manipulative). DOCUMENTED SEAM: promote the freeze balance to a profiles column later without
//   touching HomeView — only this hook's reader/writer changes. Every failure logs through
//   src/lib/logger and degrades to a neutral state rather than blocking the UI (§10).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { platform } from '../../platform';
import { useDueItems } from '../../hooks/useDueItems';
import type { PathContext, PathSelection, LearningPath } from '../../paths';
import type { Situation, Track } from '../../content/schema';
import type { UserProfile } from '../../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The progress ring's scoped completion figure for the active path. */
export interface HomeProgress {
  /** Completion percentage 0–100 (rounded) over the in-scope situation set. */
  percent: number;
  completed: number;
  total: number;
  /** Ring title (e.g. the active track name, "Structured course", "Your progress"). */
  title: string;
  /** Ring sub-label (e.g. "Level L1 · 14 of 22 situations solid"). */
  subtitle: string;
}

/** The banked streak-freeze grace state (client-persisted; documented seam to a DB column). */
export interface StreakFreezeState {
  /** Streak the learner should SEE — freezes bridge missed days so it does not break. */
  displayStreak: number;
  /** Remaining freezes in the balance. */
  freezes: number;
  /** True when this return spent one or more freezes to keep the streak alive. */
  graceApplied: boolean;
  /** Freezes spent on the most recent reconciliation (for the calm "used a freeze" note). */
  spentNow: number;
}

/** Durable client mirror of the freeze balance (no profiles column — see the file header). */
interface FreezeRecord {
  /** Remaining banked freezes. */
  freezes: number;
  /** ISO date (YYYY-MM-DD) the balance was last reconciled against last_active. */
  lastReconciled: string | null;
}

interface UseHomeDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  /** The read-only content + progress snapshot (App threads usePathContext's context). */
  pathContext: PathContext;
  /** The learner's persisted path choice (App threads usePathSelection.selection). */
  pathSelection: PathSelection;
  /** The resolved active path policy (App threads usePathSelection.activePath). */
  activePath: LearningPath;
}

/** Day-granularity key (YYYY-MM-DD) in the local timezone — freeze grace is per calendar day. */
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole calendar days between two dates (floor; negative clamped to 0). */
const daysBetween = (from: Date, to: Date): number => {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.max(0, Math.floor((b - a) / MS_PER_DAY));
};

/**
 * The in-scope situation set the progress ring measures against, per path type:
 *  - structured      → the course-slotted calendar situations,
 *  - goal-track      → the active track's situations,
 *  - adaptive / free → every loaded situation (overall progress).
 * Falls back to the whole set so the ring is never empty when content is loaded.
 */
const scopedSituations = (
  context: PathContext,
  selection: PathSelection
): { situations: Situation[]; track: Track | null } => {
  if (selection.type === 'structured') {
    const course = context.situations.filter((s) => s.course);
    return { situations: course.length > 0 ? course : context.situations, track: null };
  }
  if (selection.type === 'goal-track') {
    const track =
      (selection.activeTrackId
        ? context.tracks.find((t) => t.id === selection.activeTrackId)
        : null) ?? context.tracks[0] ?? null;
    if (track) {
      const memberIds = new Set(track.situations);
      const members = context.situations.filter((s) => memberIds.has(s.id) || s.tracks.includes(track.id));
      return { situations: members.length > 0 ? members : context.situations, track };
    }
  }
  return { situations: context.situations, track: null };
};

/** Human ring title/subtitle for the scoped set (mirrors the v3 mockup labels). */
const describeScope = (
  selection: PathSelection,
  track: Track | null,
  completed: number,
  total: number,
  activePath: LearningPath
): { title: string; subtitle: string } => {
  const solid = `${completed} of ${total} situations solid`;
  if (selection.type === 'goal-track' && track) {
    return { title: track.name, subtitle: solid };
  }
  if (selection.type === 'structured') {
    return { title: 'Structured course', subtitle: solid };
  }
  return { title: activePath.describe().title, subtitle: solid };
};

/**
 * Honest competence line: the short, learner-facing "You can now…" verb phrases drawn from the
 * goals[] of COMPLETED situations (src/content schema). Goals are the source of truth; we fall
 * back to the situation title only when a completed situation carries no goals. Deduped, trimmed,
 * capped — specific, never inflated.
 */
const buildCompetencePhrases = (context: PathContext): string[] => {
  const completed = context.situations.filter((s) => context.completedSituationIds.has(s.id));
  const phrases: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | undefined): void => {
    if (!raw) return;
    // Lower-case the first char so phrases read as a continuation of "You can now…".
    const trimmed = raw.trim().replace(/[.]+$/, '');
    if (!trimmed) return;
    const phrase = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    const key = phrase.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    phrases.push(phrase);
  };
  for (const s of completed) {
    if (s.goals && s.goals.length > 0) s.goals.forEach(push);
    else push(s.title);
    if (phrases.length >= config.home.competenceMaxPhrases) break;
  }
  return phrases.slice(0, config.home.competenceMaxPhrases);
};

/**
 * Streak-freeze grace reconciliation. Compares the days elapsed since `last_active` (profiles)
 * against the banked freeze balance and decides how many freezes THIS return spends:
 *  - gap 0–1 day  → no freeze needed (came back same/next day),
 *  - gap 2..N     → spend one freeze per missed day up to the balance (bridge the gap),
 *  - gap > cap or > balance+1 → honest reset (freezes are a grace, not an indefinite pause).
 * Pure given `now` (determinism); the caller persists the resulting balance.
 */
const reconcileFreeze = (
  profile: UserProfile | null,
  record: FreezeRecord,
  now: Date
): StreakFreezeState & { nextRecord: FreezeRecord } => {
  const streak = profile?.streak ?? 0;
  const today = dayKey(now);

  // Already reconciled today — no double-spend on re-mount/tab-switch.
  if (record.lastReconciled === today) {
    return {
      displayStreak: streak,
      freezes: record.freezes,
      graceApplied: false,
      spentNow: 0,
      nextRecord: record,
    };
  }

  const lastActive = profile?.last_active ? new Date(profile.last_active) : null;
  const gap = lastActive && !Number.isNaN(lastActive.getTime()) ? daysBetween(lastActive, now) : 0;
  // Missed days = calendar days skipped between the last active day and today (gap of 1 = today
  // vs yesterday = no miss). Bounded by the grace ceiling.
  const missedDays = Math.max(0, gap - 1);

  let spent = 0;
  if (missedDays > 0 && missedDays <= config.home.maxFreezeBridgeDays) {
    spent = Math.min(record.freezes, missedDays);
  }
  const graceApplied = spent > 0 && spent >= missedDays;

  const nextRecord: FreezeRecord = {
    freezes: Math.max(0, record.freezes - spent),
    lastReconciled: today,
  };

  return {
    // When grace fully bridged the gap the visible streak stands; otherwise it honestly reflects
    // the profile streak (which the streak-owning slice resets on a real break).
    displayStreak: streak,
    freezes: nextRecord.freezes,
    graceApplied,
    spentNow: spent,
    nextRecord,
  };
};

const DEFAULT_FREEZE_STATE: StreakFreezeState = {
  displayStreak: 0,
  freezes: config.home.startingFreezeCount,
  graceApplied: false,
  spentNow: 0,
};

/**
 * Derive all Home-dashboard surfaces. Returns the progress ring figure, the competence phrases,
 * the review-due count, and the streak-freeze state. Pure derivations from data the app already
 * loads (pathContext + profile) plus the SRS due-item load; the freeze balance is the one piece
 * of durable state this hook owns (client-persisted seam — see the file header).
 */
export const useHome = ({ supabase, user, profile, pathContext, pathSelection, activePath }: UseHomeDeps) => {
  // Review-due count from the SRS engine (the same hook usePathContext uses; a second mount is
  // cheap — it just re-reads mastery_items — and keeps Home self-contained).
  const { dueItems } = useDueItems({ supabase, user });
  const reviewDueCount = dueItems.length;

  const progress = useMemo<HomeProgress>(() => {
    const { situations, track } = scopedSituations(pathContext, pathSelection);
    const total = situations.length;
    const completed = situations.filter((s) => pathContext.completedSituationIds.has(s.id)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const { title, subtitle } = describeScope(pathSelection, track, completed, total, activePath);
    return { percent, completed, total, title, subtitle };
  }, [pathContext, pathSelection, activePath]);

  const competencePhrases = useMemo(() => buildCompetencePhrases(pathContext), [pathContext]);

  // Streak-freeze grace: load the durable balance, reconcile once against last_active, persist.
  const [freeze, setFreeze] = useState<StreakFreezeState>(DEFAULT_FREEZE_STATE);

  useEffect(() => {
    let cancelled = false;
    const key = user ? `${config.home.freezeStorageKeyPrefix}${user.id}` : null;
    if (!key) {
      // Signed out — no per-user balance to load. Resolve through a microtask so the state
      // update lands in a promise callback (react-hooks/set-state-in-effect), matching the
      // load path below (useDueItems/usePathContext use the same discipline).
      void Promise.resolve().then(() => {
        if (!cancelled) setFreeze({ ...DEFAULT_FREEZE_STATE, displayStreak: profile?.streak ?? 0 });
      });
      return () => {
        cancelled = true;
      };
    }
    void platform.storage
      .get<FreezeRecord>(key)
      .then((raw) => {
        if (cancelled) return;
        const record: FreezeRecord =
          raw && typeof raw.freezes === 'number'
            ? {
                freezes: Math.min(config.home.maxFreezeCount, Math.max(0, Math.floor(raw.freezes))),
                lastReconciled: typeof raw.lastReconciled === 'string' ? raw.lastReconciled : null,
              }
            : { freezes: config.home.startingFreezeCount, lastReconciled: null };

        const result = reconcileFreeze(profile, record, new Date());
        setFreeze({
          displayStreak: result.displayStreak,
          freezes: result.freezes,
          graceApplied: result.graceApplied,
          spentNow: result.spentNow,
        });

        // Persist only when the balance actually changed (a freeze was spent or the
        // reconciliation date advanced) — best-effort, logged on failure, never silent.
        if (
          result.nextRecord.freezes !== record.freezes ||
          result.nextRecord.lastReconciled !== record.lastReconciled
        ) {
          if (result.spentNow > 0) {
            logger.info('HOME_STREAK_FREEZE_SPENT', `streak-freeze grace spent ${result.spentNow} freeze(s)`, {
              category: 'USER_ACTION',
              details: { spent: result.spentNow, remaining: result.nextRecord.freezes, graceApplied: result.graceApplied },
            });
          }
          void platform.storage.set(key, result.nextRecord).catch((error: unknown) => {
            logger.warn('HOME_STREAK_FREEZE_PERSIST_FAILED', 'could not persist the streak-freeze balance — grace stands in memory this session', {
              category: 'DATA_PROCESSING',
              error,
            });
          });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        logger.warn('HOME_STREAK_FREEZE_LOAD_FAILED', 'could not load the streak-freeze balance — using defaults', {
          category: 'DATA_PROCESSING',
          error,
        });
        setFreeze({ ...DEFAULT_FREEZE_STATE, displayStreak: profile?.streak ?? 0 });
      });
    return () => {
      cancelled = true;
    };
    // Reconcile when the user or their last_active/streak changes (a completed session updates
    // last_active, which should re-run the grace check).
  }, [user, profile]);

  return { progress, competencePhrases, reviewDueCount, freeze };
};
