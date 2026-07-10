// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/useVocabularySession.ts
// Description: Session state for the Vocabulary Review engine (docs/CONTENT-ARCHITECTURE.md
//   §3/§6). Consumes the SRS adaptive engine — useDueItems (persistence + applyGrade) and
//   selectDueItems (pure prioritization, src/lib/srs.ts) — and NEVER reimplements SM-2.
//   Session build: due vocab items first (overdue-ness × weakness order via selectDueItems,
//   restricted to this engine's dimensions retrieve/hear), then new items (vocabulary words
//   with no 'retrieve' mastery row yet). New items need no seeding: applyGrade starts them
//   from initialMasteryState (srs.ts) on their first grade. Session length is capped at
//   config.srs.defaultDueLimit. Grading Again re-enqueues the card at the end of the session
//   (in-session repeat) — SM-2 scheduling itself is applyGrade's job.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { config } from '../../../config';
import { logger, errorMessage, userMessage } from '../../../lib/logger';
import { getSupabase } from '../../../lib/supabase';
import { selectDueItems, type MasteryItem, type Sm2Grade } from '../../../lib/srs';
import { useDueItems } from '../../../hooks/useDueItems';
import { geminiService } from '../../../services/geminiService';
import type { Situation, VocabularyItem, ReviewDimension } from '../../../content/schema';
import { vocabItemKey, VOCABULARY_DIMENSIONS } from './itemKeys';

/**
 * Grade-button → SM-2 grade mapping (mockup: Again / Hard / Good / Easy).
 * Again (0) fails the recall (below config.srs.passingGrade → repetitions reset);
 * Hard (3) is the minimum pass; Good (4) normal recall; Easy (5) perfect recall.
 * NOTE: belongs in src/config.ts (AGENTS.md §3) — migrate once the srs config
 * block's write claim is released (same seam as practiceConfig in ../registry.ts).
 */
export const VOCAB_GRADES = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
} as const satisfies Record<string, Sm2Grade>;

/**
 * Card presentation variants:
 *  - 'introduce': new word, front = PT word + 🔊, back = meaning  → grades 'retrieve'
 *  - 'retrieve':  due retrieval, front = EN meaning ("say it in Portuguese"),
 *                 back = PT word + 🔊                              → grades 'retrieve'
 *  - 'hear':      due listening, front = audio only (play & guess the meaning),
 *                 back = PT word + meaning                         → grades 'hear'
 */
export type VocabCardVariant = 'introduce' | 'retrieve' | 'hear';

export interface VocabCard {
  itemKey: string;
  /** The mastery dimension this card's grade lands on (applyGrade target). */
  dimension: Extract<ReviewDimension, 'retrieve' | 'hear'>;
  variant: VocabCardVariant;
  /** True when the word has no 'retrieve' mastery row yet (introduced this session). */
  isNew: boolean;
  situationId: string;
  entry: VocabularyItem;
}

export interface VocabSessionSummary {
  /** Grades applied to due (previously seen) cards, incl. in-session Again repeats. */
  reviewed: number;
  /** New words introduced (first grade recorded). */
  introduced: number;
  /** Number of Again (grade 0) presses. */
  againCount: number;
}

export type VocabSessionPhase = 'loading' | 'empty' | 'active' | 'summary';

const EMPTY_SUMMARY: VocabSessionSummary = { reviewed: 0, introduced: 0, againCount: 0 };

/**
 * Build one session's card queue: due first (engine-owned dimensions only, prioritized
 * by the SRS engine's selectDueItems), then unseen words, capped at
 * config.srs.defaultDueLimit total. Pure — exported for the unit-tests step.
 */
export const buildSessionCards = (
  items: MasteryItem[],
  situations: Situation[],
  now: Date
): VocabCard[] => {
  const limit = config.srs.defaultDueLimit;

  // Content index: canonical item_key → (situation, vocabulary entry).
  const contentByKey = new Map<string, { situationId: string; entry: VocabularyItem }>();
  for (const situation of situations) {
    for (const entry of situation.vocabulary) {
      const key = vocabItemKey(situation.id, entry.word);
      if (!contentByKey.has(key)) contentByKey.set(key, { situationId: situation.id, entry });
    }
  }

  // Due cards: mastery rows in this engine's namespace + dimensions whose content
  // still resolves (removed content is silently skipped — never a dead card).
  const vocabMastery = items.filter(
    (item) => contentByKey.has(item.itemKey) && VOCABULARY_DIMENSIONS.includes(item.dimension)
  );
  const dueCards: VocabCard[] = selectDueItems(vocabMastery, { now, limit }).map((item) => {
    const content = contentByKey.get(item.itemKey)!;
    const dimension = item.dimension as VocabCard['dimension'];
    return {
      itemKey: item.itemKey,
      dimension,
      variant: dimension === 'hear' ? 'hear' : 'retrieve',
      isNew: false,
      situationId: content.situationId,
      entry: content.entry,
    };
  });

  // New cards: words with no 'retrieve' mastery row yet, in content order. No row is
  // written up-front — applyGrade introduces them from initialMasteryState on first grade.
  const knownRetrieveKeys = new Set(
    items.filter((item) => item.dimension === 'retrieve').map((item) => item.itemKey)
  );
  const newCards: VocabCard[] = [];
  const newBudget = Math.max(0, limit - dueCards.length);
  for (const [key, content] of contentByKey) {
    if (newCards.length >= newBudget) break;
    if (knownRetrieveKeys.has(key)) continue;
    newCards.push({
      itemKey: key,
      dimension: 'retrieve',
      variant: 'introduce',
      isNew: true,
      situationId: content.situationId,
      entry: content.entry,
    });
  }

  return [...dueCards, ...newCards];
};

interface VocabularySessionDeps {
  /** Resolved auth user (null = signed out: cards still work, grades are not persisted). */
  user: User | null;
  /** Situations in scope (one when routed in via the situation browser, else all). */
  situations: Situation[];
}

export const useVocabularySession = ({ user, situations }: VocabularySessionDeps) => {
  const supabase = useMemo(() => getSupabase(), []);
  const { items, applyGrade, refresh } = useDueItems({ supabase, user });

  const [sessionKey, setSessionKey] = useState(0);
  const [masteryReady, setMasteryReady] = useState(false);
  const [cards, setCards] = useState<VocabCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [summary, setSummary] = useState<VocabSessionSummary>(EMPTY_SUMMARY);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Session data gate: await an explicit refresh() so the snapshot below is built from
  // freshly loaded mastery rows (the hook's own mount load races with this effect).
  useEffect(() => {
    let cancelled = false;
    void refresh().then(() => {
      if (!cancelled) setMasteryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, sessionKey]);

  // Snapshot the session queue ONCE per sessionKey. items keeps changing as grades
  // apply (optimistic updates) — the `cards !== null` guard pins the queue so cards
  // never shuffle mid-session.
  useEffect(() => {
    if (!masteryReady || cards !== null) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setCards(buildSessionCards(items, situations, new Date()));
    });
    return () => {
      cancelled = true;
    };
  }, [masteryReady, cards, items, situations]);

  // Stop any in-flight card audio when the mode unmounts (back to hub).
  useEffect(() => () => geminiService.stopSpeech(), []);

  const card = cards !== null ? (cards[index] ?? null) : null;

  const phase: VocabSessionPhase =
    cards === null
      ? 'loading'
      : cards.length === 0
        ? 'empty'
        : index >= cards.length
          ? 'summary'
          : 'active';

  const flip = useCallback(() => setIsFlipped((f) => !f), []);

  /** Play European Portuguese TTS for a card's word (server voice, default speed). */
  const playText = useCallback((text: string) => {
    setAudioError(null);
    geminiService
      .playSpeech(text, undefined, config.audio.defaultPlaybackSpeed)
      .catch((err: unknown) => {
        const event = logger.error('VOCAB_TTS_FAILED', 'Vocabulary card audio failed', {
          category: 'AI_DECISION',
          error: err,
          details: { textLength: text.length },
        });
        setAudioError(
          userMessage('TTS_FAILED', errorMessage(err) || 'Audio playback failed', event.request_id)
        );
      });
  }, []);

  /** Grade the current card and advance. Again (0) re-enqueues the card at the end. */
  const gradeCard = useCallback(
    (grade: Sm2Grade) => {
      if (!cards) return;
      const current = cards[index];
      if (!current) return;

      // COACH SIGNAL (§6b): grade emission — this applyGrade call updates the
      // (item_key, dimension) mastery row the Coach's dimensionSummary reads.
      // Vocabulary emits on 'retrieve' (flip cards) and 'hear' (audio-first cards).
      void applyGrade(current.itemKey, current.dimension, grade);

      setSummary((s) => ({
        reviewed: s.reviewed + (current.isNew ? 0 : 1),
        introduced: s.introduced + (current.isNew ? 1 : 0),
        againCount: s.againCount + (grade === VOCAB_GRADES.again ? 1 : 0),
      }));

      if (grade === VOCAB_GRADES.again) {
        // In-session repeat: see the card again before the session ends (the SM-2
        // reschedule itself already happened in applyGrade above).
        setCards((queue) => (queue ? [...queue, { ...current, isNew: false }] : queue));
      }

      setIsFlipped(false);
      setIndex((i) => i + 1);
    },
    [cards, index, applyGrade]
  );

  /** Start a fresh session (re-fetch mastery, rebuild the queue). */
  const restart = useCallback(() => {
    setMasteryReady(false);
    setCards(null);
    setIndex(0);
    setIsFlipped(false);
    setSummary(EMPTY_SUMMARY);
    setAudioError(null);
    setSessionKey((k) => k + 1);
  }, []);

  // Remaining counts for the header line (mockup "N due"), from the current position.
  const remaining = cards !== null ? cards.slice(index) : [];
  const remainingDue = remaining.filter((c) => !c.isNew).length;
  const remainingNew = remaining.filter((c) => c.isNew).length;

  return {
    phase,
    card,
    index,
    total: cards?.length ?? 0,
    remainingDue,
    remainingNew,
    isFlipped,
    flip,
    gradeCard,
    playText,
    audioError,
    summary,
    restart,
    /** Signed-out sessions still work, but grades are not persisted (applyGrade no-ops). */
    isSignedOut: user === null,
  };
};
