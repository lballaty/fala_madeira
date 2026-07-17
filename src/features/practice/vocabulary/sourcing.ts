// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/sourcing.ts
// Description: EN-18 (WP1) — progress-aware sourcing for the vocabulary reinforcement quiz.
//   The pool is the vocabulary from situations the learner has WORKED ON (owner 2026-07-17: any
//   user_situation_progress row with status in_progress/completed), minus reinforcement-only
//   entries (the 0-word "Week N Stress Test" / "Grand Stress Test" situations — spec §3), grouped
//   by course category (daily/social/travel/work/custom; category-less goal-track situations fall
//   into an "other" bucket) so the focus picker can narrow the deck. The core (buildVocabPool) is
//   PURE + deterministic — no React, no network — so it unit-tests cleanly; loadStartedSituationIds
//   is a thin async wrapper reading user_situation_progress (same pattern as the Coach's
//   loadSituationSignals in ../../coach/useCoach.ts). No new tracking write, no DB migration.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-17

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { logger } from '../../../lib/logger';
import { COURSE_CATEGORIES, type CourseCategory, type Situation } from '../../../content/schema';

/**
 * Progress statuses that count a situation as "started" (owner 2026-07-17): the learner opened it
 * and is working through it (`in_progress`, the table DEFAULT) or has finished it (`completed`).
 * Avoidance statuses (`skipped`/`abandoned`, read by the Coach) are deliberately EXCLUDED — a theme
 * the learner avoided should not seed the review deck.
 */
export const STARTED_STATUSES = ['in_progress', 'completed'] as const;

/** True when a user_situation_progress row's status marks its situation as worked-on. */
export const isStartedStatus = (status: string | null | undefined): boolean =>
  status === 'in_progress' || status === 'completed';

/**
 * Reinforcement-only situations (stress tests / grand stress tests) introduce no NEW vocabulary and
 * must not seed the quiz (spec §3). Detection is objective: they are the 0-word entries, so the
 * word-count test below is authoritative for today's content; this id/title guard is defensive in
 * case a reinforcement situation ever carries stray vocabulary.
 */
const STRESS_TEST_PATTERN = /stress[\s-]?test|grand[\s-]?stress/i;

/**
 * A situation seeds the quiz only when it actually INTRODUCES words: it must carry ≥1 vocabulary
 * entry and not be a stress test / review. Grammar lessons are INCLUDED (owner 2026-07-16 — they do
 * introduce vocabulary); only the 0-word reinforcement entries are filtered out.
 */
export const introducesVocabulary = (situation: Situation): boolean => {
  if (!situation.vocabulary || situation.vocabulary.length === 0) return false;
  if (STRESS_TEST_PATTERN.test(situation.id) || STRESS_TEST_PATTERN.test(situation.title)) return false;
  return true;
};

/** Focus-picker bucket key: a real course category, or 'other' for category-less situations. */
export type VocabCategoryKey = CourseCategory | 'other';

/** Display order + labels for the focus picker (categories first, 'other' last). */
const CATEGORY_ORDER: readonly VocabCategoryKey[] = [...COURSE_CATEGORIES, 'other'];
const CATEGORY_LABELS: Record<VocabCategoryKey, string> = {
  daily: 'Daily life',
  social: 'Social',
  travel: 'Travel',
  work: 'Work',
  custom: 'Custom',
  other: 'Other themes',
};

/** One focus-picker group: the started situations of a category and their combined word count. */
export interface VocabPoolGroup {
  category: VocabCategoryKey;
  label: string;
  situations: Situation[];
  wordCount: number;
}

/** The progress-aware vocabulary pool: the "all started" default plus per-category groups. */
export interface VocabPool {
  /** Every started, vocabulary-introducing situation (the default "all started" scope). */
  situations: Situation[];
  /** Grouped by course category for the focus picker; empty groups are omitted. */
  groups: VocabPoolGroup[];
  /** Total vocabulary words across the whole pool. */
  wordCount: number;
}

const wordCountOf = (situations: Situation[]): number =>
  situations.reduce((total, s) => total + s.vocabulary.length, 0);

const categoryKeyOf = (situation: Situation): VocabCategoryKey =>
  situation.course?.category ?? 'other';

/**
 * Build the progress-aware pool from ALL situations + the set of started situation ids. PURE and
 * deterministic: input order is preserved within each group, and groups follow CATEGORY_ORDER.
 * A situation is in the pool iff it is started AND introduces vocabulary. When nothing qualifies
 * the pool is empty (the UI shows the "start a lesson to build your deck" state).
 */
export const buildVocabPool = (
  situations: Situation[],
  startedSituationIds: ReadonlySet<string>
): VocabPool => {
  const inScope = situations.filter(
    (s) => startedSituationIds.has(s.id) && introducesVocabulary(s)
  );

  const byCategory = new Map<VocabCategoryKey, Situation[]>();
  for (const situation of inScope) {
    const key = categoryKeyOf(situation);
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(situation);
    else byCategory.set(key, [situation]);
  }

  const groups: VocabPoolGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const groupSituations = byCategory.get(category);
    if (!groupSituations || groupSituations.length === 0) continue;
    groups.push({
      category,
      label: CATEGORY_LABELS[category],
      situations: groupSituations,
      wordCount: wordCountOf(groupSituations),
    });
  }

  return { situations: inScope, groups, wordCount: wordCountOf(inScope) };
};

/** Minimal user_situation_progress shape this module reads (mirrors the Coach's projection). */
interface StartedProgressRow {
  situation_id: string;
  status: string | null;
}

/**
 * Load the set of situation ids the learner has started (any mode, started status). Best-effort:
 * a signed-out user or a query failure logs and returns an EMPTY set (the pool is then empty and
 * the UI guides the learner to start a lesson). Never throws.
 */
export const loadStartedSituationIds = async (
  supabase: SupabaseClient | null,
  user: User | null
): Promise<Set<string>> => {
  const started = new Set<string>();
  if (!supabase || !user) return started;
  try {
    const { data, error } = await supabase
      .from('user_situation_progress')
      .select('situation_id, status')
      .eq('user_id', user.id);
    if (error) throw error;
    for (const row of (data ?? []) as StartedProgressRow[]) {
      if (isStartedStatus(row.status)) started.add(row.situation_id);
    }
  } catch (error) {
    logger.warn(
      'VOCAB_SOURCING_PROGRESS_FAILED',
      'could not load situation progress for vocabulary sourcing — degrading to an empty started pool',
      { category: 'DATA_PROCESSING', error }
    );
  }
  return started;
};
