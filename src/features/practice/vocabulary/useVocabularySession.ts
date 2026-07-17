// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/useVocabularySession.ts
// Description: Session state for the Vocabulary reinforcement QUIZ (EN-18, docs/
//   EN-18-VOCAB-REINFORCEMENT-QUIZ-REQUIREMENTS.md). Replaces the old self-graded flip-card loop
//   with an OBJECTIVE loop: show the PT word → type the EN meaning (comprehension, ./comprehension)
//   → say it (production, ./production, mic) → the app derives SUCCESS/PARTIAL/FAILURE (./scoring)
//   and feeds the existing SM-2 scheduler (useDueItems.applyGrade). Comprehension grades the
//   'retrieve' dimension; production grades 'say'. Consumes the SRS engine (buildSessionCards +
//   selectDueItems, src/lib/srs.ts) and NEVER reimplements SM-2; the queue is collapsed to one
//   card PER WORD (the quiz asks each word once, comprehension+production together). Session length
//   scales to the in-scope situations. A card whose comprehension FAILS is re-enqueued once for an
//   in-session repeat (the SM-2 reschedule itself already happened in applyGrade).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { config } from '../../../config';
import { logger, errorMessage, userMessage } from '../../../lib/logger';
import { getSupabase } from '../../../lib/supabase';
import {
  gradeItem,
  initialMasteryState,
  selectDueItems,
  type MasteryItem,
  type MasteryState,
} from '../../../lib/srs';
import { useDueItems } from '../../../hooks/useDueItems';
import { geminiService } from '../../../services/geminiService';
import type { Situation, VocabularyItem, ReviewDimension } from '../../../content/schema';
import { vocabItemKey, VOCABULARY_DIMENSIONS } from './itemKeys';
import { checkComprehension } from './comprehension';
import { checkProduction, isProductionAvailable, type ProductionResult } from './production';
import { scoreCard, type CardScore, type QuizOutcome } from './scoring';

/**
 * Card variant retained for the SESSION QUEUE only (introduce = new word, retrieve/hear = a due
 * mastery row). The quiz interaction itself is the SAME for every card (type the meaning, then say
 * it); the variant just labels how the card entered the queue and which content order it took.
 */
export type VocabCardVariant = 'introduce' | 'retrieve' | 'hear';

export interface VocabCard {
  itemKey: string;
  /** The mastery dimension that put this card in the due queue (queue provenance only). */
  dimension: Extract<ReviewDimension, 'retrieve' | 'hear'>;
  variant: VocabCardVariant;
  /** True when the word has no 'retrieve' mastery row yet (introduced this session). */
  isNew: boolean;
  situationId: string;
  entry: VocabularyItem;
}

export interface VocabSessionSummary {
  /** Previously-seen cards graded this session (incl. in-session comprehension-fail repeats). */
  reviewed: number;
  /** New words introduced (first grade recorded). */
  introduced: number;
  /** Cards scored SUCCESS (comprehension + production both passed, or comprehension-only pass). */
  success: number;
  /** Cards scored PARTIAL (exactly one of comprehension/production passed; mic path only). */
  partial: number;
  /** Cards scored FAILURE (nothing passed). */
  failure: number;
}

/** Quiz step within a single card. */
export type VocabQuizStep = 'prompt' | 'reveal' | 'listening' | 'feedback';

export type VocabSessionPhase = 'loading' | 'empty' | 'active' | 'summary';

/** The committed result of one card, surfaced for the feedback panel. */
export interface VocabCardResult {
  comprehensionPass: boolean;
  /** null = production not attempted (no mic / declined). */
  productionPass: boolean | null;
  score: CardScore;
  /** Days until this word next surfaces on its 'retrieve' track (for "back in ~N days"). */
  returnDays: number;
}

const EMPTY_SUMMARY: VocabSessionSummary = {
  reviewed: 0,
  introduced: 0,
  success: 0,
  partial: 0,
  failure: 0,
};

/**
 * Build one session's card queue: due first (engine-owned dimensions only, prioritized by the SRS
 * engine's selectDueItems), then unseen words, capped at `limit` total. Pure — exported for the
 * unit-tests step (EN-16 regression). NOTE: this may yield two cards for one word (a due 'retrieve'
 * AND a due 'hear' row); the quiz collapses the queue to one card per word (dedupeByWord below).
 */
export const buildSessionCards = (
  items: MasteryItem[],
  situations: Situation[],
  now: Date,
  // EN-16: the session scales to the chosen scope — default limit = all vocabulary words in the
  // in-scope situations, so a session plays every due + new card for the selected scope.
  limit: number = situations.reduce((total, s) => total + s.vocabulary.length, 0)
): VocabCard[] => {
  // Content index: canonical item_key → (situation, vocabulary entry).
  const contentByKey = new Map<string, { situationId: string; entry: VocabularyItem }>();
  for (const situation of situations) {
    for (const entry of situation.vocabulary) {
      const key = vocabItemKey(situation.id, entry.word);
      if (!contentByKey.has(key)) contentByKey.set(key, { situationId: situation.id, entry });
    }
  }

  // Due cards: mastery rows in this engine's namespace + dimensions whose content still resolves.
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

  // New cards: words with no 'retrieve' mastery row yet, in content order.
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

/**
 * Collapse the queue to one card per word: the quiz grades comprehension (retrieve) AND production
 * (say) in a single card, so a word must not appear twice. First occurrence wins, preserving the
 * SM-2 order (due-retrieve before due-hear before new).
 */
export const dedupeByWord = (cards: VocabCard[]): VocabCard[] => {
  const seen = new Set<string>();
  const out: VocabCard[] = [];
  for (const card of cards) {
    if (seen.has(card.itemKey)) continue;
    seen.add(card.itemKey);
    out.push(card);
  }
  return out;
};

interface VocabularySessionDeps {
  /** Resolved auth user (null = signed out: cards still work, grades are not persisted). */
  user: User | null;
  /** Situations in scope (one when routed in via a situation, else the chosen focus). */
  situations: Situation[];
}

/** How a production attempt failed, so the UI offers the right affordance (retry vs move on). */
export type ProductionFailKind = 'retryable' | 'mismatch' | null;

export const useVocabularySession = ({ user, situations }: VocabularySessionDeps) => {
  const supabase = useMemo(() => getSupabase(), []);
  const { items, applyGrade, refresh } = useDueItems({ supabase, user });

  const [sessionKey, setSessionKey] = useState(0);
  const [masteryReady, setMasteryReady] = useState(false);
  const [cards, setCards] = useState<VocabCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<VocabQuizStep>('prompt');
  const [comprehensionPass, setComprehensionPass] = useState<boolean | null>(null);
  const [productionResult, setProductionResult] = useState<ProductionResult | null>(null);
  const [cardResult, setCardResult] = useState<VocabCardResult | null>(null);
  const [summary, setSummary] = useState<VocabSessionSummary>(EMPTY_SUMMARY);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Mic availability is fixed for the session (captured once) so the UI is stable per card.
  const [micAvailable] = useState(() => isProductionAvailable());

  // Session data gate: await an explicit refresh() so the snapshot is built from freshly loaded
  // mastery rows (the hook's own mount load races with this effect).
  useEffect(() => {
    let cancelled = false;
    void refresh().then(() => {
      if (!cancelled) setMasteryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, sessionKey]);

  // Snapshot the session queue ONCE per sessionKey. The `cards !== null` guard pins the queue so
  // cards never shuffle mid-session as grades apply (optimistic updates keep changing `items`).
  useEffect(() => {
    if (!masteryReady || cards !== null) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setCards(dedupeByWord(buildSessionCards(items, situations, new Date())));
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

  /** Current retrieve-dimension mastery state for a word (or a fresh state when unseen). */
  const retrieveStateFor = useCallback(
    (itemKey: string): MasteryState =>
      items.find((it) => it.itemKey === itemKey && it.dimension === 'retrieve') ??
      initialMasteryState(),
    [items]
  );

  /**
   * Commit the card: score the objective signals, apply per-dimension SM-2 grades (retrieve from
   * comprehension, say from production when attempted), record the summary + return timing, and
   * advance to the feedback step. `cp`/`pp` are passed explicitly to avoid stale state right after
   * a comprehension submit.
   */
  const finalize = useCallback(
    (current: VocabCard, cp: boolean, pp: boolean | null) => {
      const score: CardScore = scoreCard({ comprehensionPass: cp, productionPass: pp });

      // COACH SIGNAL (§6b): grade emission — applyGrade updates the (item_key, dimension) mastery
      // row the Coach's dimensionSummary reads. Comprehension → 'retrieve'; production → 'say'.
      void applyGrade(current.itemKey, 'retrieve', score.retrieveGrade);
      if (score.sayGrade !== null) void applyGrade(current.itemKey, 'say', score.sayGrade);

      const returnDays = gradeItem(
        retrieveStateFor(current.itemKey),
        score.retrieveGrade,
        new Date()
      ).intervalDays;

      setSummary((s) => ({
        reviewed: s.reviewed + (current.isNew ? 0 : 1),
        introduced: s.introduced + (current.isNew ? 1 : 0),
        success: s.success + (score.outcome === 'success' ? 1 : 0),
        partial: s.partial + (score.outcome === 'partial' ? 1 : 0),
        failure: s.failure + (score.outcome === 'failure' ? 1 : 0),
      }));
      setCardResult({ comprehensionPass: cp, productionPass: pp, score, returnDays });
      setStep('feedback');
    },
    [applyGrade, retrieveStateFor]
  );

  /** STEP 1 — grade the typed meaning. With a mic, advance to production; else finalize now. */
  const submitComprehension = useCallback(
    (typed: string) => {
      if (!card || step !== 'prompt') return;
      const pass = checkComprehension(typed, card.entry.translation);
      setComprehensionPass(pass);
      if (micAvailable) {
        setStep('reveal');
      } else {
        finalize(card, pass, null);
      }
    },
    [card, step, micAvailable, finalize]
  );

  /** STEP 2 — run one spoken-production attempt and resolve the outcome. */
  const sayIt = useCallback(async () => {
    if (!card || comprehensionPass === null) return;
    setStep('listening');
    const result = await checkProduction(card.entry.word);
    setProductionResult(result);
    if (result.outcome === 'pass') {
      finalize(card, comprehensionPass, true);
    } else if (result.outcome === 'skipped') {
      finalize(card, comprehensionPass, null);
    } else {
      // FAIL: return to the reveal step; the view offers retry (retryable) or move-on (mismatch).
      setStep('reveal');
    }
  }, [card, comprehensionPass, finalize]);

  /** Decline the spoken step entirely → comprehension-only grading (no penalty on 'say'). */
  const skipProduction = useCallback(() => {
    if (!card || comprehensionPass === null) return;
    finalize(card, comprehensionPass, null);
  }, [card, comprehensionPass, finalize]);

  /** Accept a mismatched spoken attempt as a real production FAIL and move on. */
  const acceptProductionFail = useCallback(() => {
    if (!card || comprehensionPass === null) return;
    finalize(card, comprehensionPass, false);
  }, [card, comprehensionPass, finalize]);

  /** Advance to the next card (re-enqueuing this one once if comprehension failed). */
  const next = useCallback(() => {
    const failedComprehension = cardResult?.comprehensionPass === false;
    if (failedComprehension && card) {
      setCards((queue) => (queue ? [...queue, { ...card, isNew: false }] : queue));
    }
    setStep('prompt');
    setComprehensionPass(null);
    setProductionResult(null);
    setCardResult(null);
    setAudioError(null);
    setIndex((i) => i + 1);
  }, [cardResult, card]);

  /** Start a fresh session (re-fetch mastery, rebuild the queue). */
  const restart = useCallback(() => {
    setMasteryReady(false);
    setCards(null);
    setIndex(0);
    setStep('prompt');
    setComprehensionPass(null);
    setProductionResult(null);
    setCardResult(null);
    setSummary(EMPTY_SUMMARY);
    setAudioError(null);
    setSessionKey((k) => k + 1);
  }, []);

  // Classify a production failure so the UI shows the right affordance.
  const productionFailKind: ProductionFailKind =
    productionResult?.outcome === 'fail'
      ? productionResult.reason === 'mismatch'
        ? 'mismatch'
        : 'retryable'
      : null;

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
    step,
    micAvailable,
    comprehensionPass,
    productionResult,
    productionFailKind,
    cardResult,
    playText,
    submitComprehension,
    sayIt,
    skipProduction,
    acceptProductionFail,
    next,
    audioError,
    summary,
    restart,
    /** Signed-out sessions still work, but grades are not persisted (applyGrade no-ops). */
    isSignedOut: user === null,
  };
};

export type { QuizOutcome };
