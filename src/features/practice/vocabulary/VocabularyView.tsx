// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/VocabularyView.tsx
// Description: Vocabulary reinforcement QUIZ body (EN-18). Replaces the self-graded flip cards with
//   an objective loop: PT word + audio → TYPE the English meaning (Check) → reveal → "Now say it"
//   (mic, pt-PT) → app-derived SUCCESS/PARTIAL/FAILURE + return timing → next. Sourcing is
//   progress-aware (src/features/practice/vocabulary/sourcing.ts): entering from a SITUATION scopes
//   to that lesson's vocabulary; entering from the hub draws on the situations the learner has
//   WORKED ON, narrowable by a theme/category focus picker (supersedes EN-16's lesson/track/all
//   selector). Signed-out learners fall back to the full vocabulary pool so the mode never dies.
//   Rendered inside the Practice hub chrome per the ENGINE INTEGRATION CONTRACT (../registry.ts):
//   default-exports a ComponentType<PracticeModeProps>, body only, onExit() returns to the hub.
//   Nothing is ever hard-gated (§5/§12).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Check, CheckCircle2, Mic, Volume2, XCircle } from 'lucide-react';
import type { PracticeModeProps } from '../registry';
import { contentRepository } from '../../../content/repository';
import type { Situation } from '../../../content/schema';
import { cn } from '../../../lib/utils';
import { getSupabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import { useVocabularySession, type VocabCard } from './useVocabularySession';
import {
  buildVocabPool,
  loadStartedSituationIds,
  type VocabCategoryKey,
  type VocabPool,
} from './sourcing';

// Test-only affordance (prod-safe): when an e2e init script sets localStorage['fm:e2e']='1', the
// answer input carries the expected meaning as data-answer so the deterministic typed-answer flow
// can drive correct/incorrect submissions. Never enabled in the shipped app (flag is test-set only).
const E2E_ANSWER_HINT = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('fm:e2e') === '1';
  } catch {
    return false;
  }
})();

const loadingSpinner = (
  <div className="flex items-center justify-center py-16">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
  </div>
);

const SpeakerButton = ({ onPlay, label }: { onPlay: () => void; label: string }) => (
  <button
    type="button"
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation();
      onPlay();
    }}
    className="p-2 rounded-full bg-ios-bg text-ios-blue active:scale-95 transition-transform inline-flex min-w-[44px] min-h-[44px] items-center justify-center"
  >
    <Volume2 className="w-5 h-5" />
  </button>
);

const returnLabel = (days: number): string => {
  if (days <= 0) return 'soon';
  if (days === 1) return '~1 day';
  return `~${days} days`;
};

// ---------------------------------------------------------------------------
// Prompt (Step 1): show the PT word + audio, type the meaning, Check.
// ---------------------------------------------------------------------------

interface PromptProps {
  card: VocabCard;
  onPlay: (text: string) => void;
  onSubmit: (typed: string) => void;
}

const PromptStep = ({ card, onPlay, onSubmit }: PromptProps) => {
  const [answer, setAnswer] = useState('');
  // Focus the answer field on mount so the learner can type straight away, without the
  // `autoFocus` attribute (jsx-a11y/no-autofocus — A9). Programmatic focus is scoped to
  // this step's mount and keyed on the card so a new prompt re-focuses.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, [card.entry.word]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(answer);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="w-full bg-card rounded-2xl ios-shadow min-h-[120px] flex flex-col items-center justify-center p-6 text-center space-y-2">
        <div className="flex items-center justify-center space-x-2">
          <p className="text-2xl font-extrabold" data-testid="vocab-word">
            {card.entry.word}
          </p>
          <SpeakerButton onPlay={() => onPlay(card.entry.word)} label="Play the word" />
        </div>
        <p className="text-xs text-ios-gray">What does it mean?</p>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type the meaning in English"
        aria-label="Type the meaning in English"
        data-testid="vocab-answer-input"
        {...(E2E_ANSWER_HINT ? { 'data-answer': card.entry.translation } : {})}
        className="w-full rounded-2xl border-2 border-ios-bg focus:border-ios-blue outline-none px-4 py-3 text-base"
      />
      <button
        type="submit"
        data-testid="vocab-check"
        className="w-full bg-ios-blue text-white rounded-2xl py-3 font-bold text-sm shadow-lg active:scale-95 transition-transform inline-flex items-center justify-center gap-2"
      >
        <Check className="w-4 h-4" /> Check
      </button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Reveal (between Step 1 and Step 2): show the answer + the production controls.
// ---------------------------------------------------------------------------

const RevealedCard = ({ card, onPlay }: { card: VocabCard; onPlay: (t: string) => void }) => (
  <div className="w-full bg-card rounded-2xl ios-shadow p-6 text-center space-y-2" data-testid="vocab-reveal">
    <div className="flex items-center justify-center space-x-2">
      <p className="text-2xl font-extrabold">{card.entry.word}</p>
      <SpeakerButton onPlay={() => onPlay(card.entry.word)} label="Play the word" />
    </div>
    <p className="text-lg font-semibold text-ios-gray">{card.entry.translation}</p>
    {card.entry.pronunciation && (
      <p className="text-xs text-ios-gray italic">[{card.entry.pronunciation}]</p>
    )}
    {card.entry.note && <p className="text-xs text-ios-gray max-w-xs mx-auto">{card.entry.note}</p>}
  </div>
);

// ---------------------------------------------------------------------------
// Session screen (data already resolved by the default export below)
// ---------------------------------------------------------------------------

interface VocabularySessionScreenProps {
  user: User | null;
  situations: Situation[];
  onExit: () => void;
  scopeHeading: string;
  /** True when the (hub) pool is progress-derived and empty because nothing is started yet. */
  emptyIsNoProgress: boolean;
}

const VocabularySessionScreen = ({
  user,
  situations,
  onExit,
  scopeHeading,
  emptyIsNoProgress,
}: VocabularySessionScreenProps) => {
  const {
    phase,
    card,
    index,
    total,
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
    isSignedOut,
  } = useVocabularySession({ user, situations });

  if (phase === 'loading') return loadingSpinner;

  if (phase === 'empty') {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-4">
        <CheckCircle2 className="w-12 h-12 text-[#34C759]" />
        <p className="text-xs font-semibold text-ios-blue" data-testid="vocab-scope">
          {scopeHeading}
        </p>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">
            {emptyIsNoProgress ? 'Nothing to review yet' : 'No vocabulary here'}
          </h3>
          <p className="text-sm text-ios-gray max-w-xs">
            {emptyIsNoProgress
              ? 'Start a lesson first — the words you work on build your review deck automatically.'
              : 'This scope has no vocabulary entries. Pick another theme or start a lesson.'}
          </p>
        </div>
        <button
          onClick={onExit}
          className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
        >
          Back to Practice
        </button>
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-5">
        <CheckCircle2 className="w-12 h-12 text-[#34C759]" />
        <p className="text-xs font-semibold text-ios-blue" data-testid="vocab-scope">
          {scopeHeading}
        </p>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Session complete</h3>
          <p className="text-sm text-ios-gray">The app scored each word — grades feed your review schedule.</p>
        </div>
        <div className="w-full max-w-xs bg-card rounded-2xl ios-shadow divide-y divide-ios-bg text-sm">
          <div className="flex justify-between px-4 py-3">
            <span className="text-ios-gray">Reviewed</span>
            <span className="font-bold">{summary.reviewed}</span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-ios-gray">New words</span>
            <span className="font-bold">{summary.introduced}</span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-ios-gray">✓ Got it</span>
            <span className="font-bold" data-testid="vocab-summary-success">{summary.success}</span>
          </div>
          {summary.partial > 0 && (
            <div className="flex justify-between px-4 py-3">
              <span className="text-ios-gray">~ Partial</span>
              <span className="font-bold">{summary.partial}</span>
            </div>
          )}
          <div className="flex justify-between px-4 py-3">
            <span className="text-ios-gray">✗ Missed</span>
            <span className="font-bold" data-testid="vocab-summary-failure">{summary.failure}</span>
          </div>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={restart}
            className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            Review again
          </button>
          <button
            onClick={onExit}
            className="px-6 py-3 bg-card text-ios-blue rounded-2xl font-bold text-sm ios-shadow active:scale-95 transition-transform"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // phase === 'active' → card is non-null.
  if (!card) return null;

  return (
    <div className="p-6 space-y-3">
      <p className="text-xs font-semibold text-ios-blue" data-testid="vocab-scope">
        {scopeHeading}
      </p>
      <div className="flex items-center justify-between text-xs text-ios-gray">
        <span>
          {remainingDue} due · {remainingNew} new
        </span>
        <span>
          {Math.min(index + 1, total)} / {total}
        </span>
      </div>

      {step === 'prompt' && (
        <PromptStep
          key={`${card.itemKey}:${index}`}
          card={card}
          onPlay={playText}
          onSubmit={submitComprehension}
        />
      )}

      {(step === 'reveal' || step === 'listening') && (
        <div className="space-y-3">
          <RevealedCard card={card} onPlay={playText} />

          <p
            className={cn(
              'text-sm font-semibold text-center inline-flex items-center justify-center gap-1 w-full',
              comprehensionPass ? 'text-[#34C759]' : 'text-[#FF3B30]'
            )}
          >
            {comprehensionPass ? <Check className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {comprehensionPass ? 'Meaning correct' : 'Meaning missed'}
          </p>

          {step === 'listening' ? (
            <p className="text-sm text-center text-ios-blue font-semibold" data-testid="vocab-listening">
              Listening… say the word out loud.
            </p>
          ) : (
            <div className="space-y-2">
              {productionResult?.outcome === 'fail' && (
                <p className="text-xs text-center text-[#FF9500]">{productionResult.message}</p>
              )}
              <button
                type="button"
                onClick={() => void sayIt()}
                data-testid="vocab-say"
                className="w-full bg-ios-blue text-white rounded-2xl py-3 font-bold text-sm shadow-lg active:scale-95 transition-transform inline-flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" />
                {productionResult?.outcome === 'fail' ? 'Try again' : 'Now say it'}
              </button>
              <button
                type="button"
                onClick={productionFailKind === 'mismatch' ? acceptProductionFail : skipProduction}
                data-testid="vocab-skip-speaking"
                className="w-full text-ios-gray rounded-2xl py-2 font-semibold text-xs active:scale-95 transition-transform"
              >
                {productionFailKind === 'mismatch' ? 'Move on' : 'Skip speaking'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'feedback' && cardResult && (
        <div className="space-y-3">
          <RevealedCard card={card} onPlay={playText} />
          <div
            className="w-full bg-card rounded-2xl ios-shadow p-4 text-center space-y-1"
            data-testid="vocab-feedback"
            data-outcome={cardResult.score.outcome}
          >
            <p className="text-sm font-semibold">
              {cardResult.comprehensionPass ? '✓ meaning' : '✗ meaning'}
              {cardResult.productionPass !== null
                ? cardResult.productionPass
                  ? ' · ✓ pronunciation'
                  : ' · ✗ pronunciation'
                : ''}
            </p>
            <p className="text-xs text-ios-gray">back in {returnLabel(cardResult.returnDays)}</p>
          </div>
          <button
            type="button"
            onClick={next}
            data-testid="vocab-next"
            className="w-full bg-ios-blue text-white rounded-2xl py-3 font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            {index + 1 >= total ? 'See results' : 'Next word'}
          </button>
        </div>
      )}

      {audioError && <p className="text-xs text-[#FF3B30] text-center">{audioError}</p>}

      <p className="text-[10px] text-ios-gray text-center">
        {micAvailable
          ? 'Type the meaning, then say the word — the app scores both.'
          : 'Type the meaning — the app scores it (no mic on this device).'}
      </p>
      {isSignedOut && (
        <p className="text-[10px] text-ios-gray text-center">
          You are not signed in — practice works, but progress is not saved.
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Default export: resolves auth + content + started-situation pool, then mounts
// the session. Mounting only after the user is known keeps the SRS snapshot
// race-free (useVocabularySession refreshes mastery for a fixed user).
// ---------------------------------------------------------------------------

const vocabCount = (sits: Situation[]): number => sits.reduce((n, s) => n + s.vocabulary.length, 0);

const VocabularyView = ({ situationId, onExit }: PracticeModeProps) => {
  const [auth, setAuth] = useState<{ user: User | null } | null>(null);
  const [situations, setSituations] = useState<Situation[] | null>(null);
  const [startedIds, setStartedIds] = useState<ReadonlySet<string> | null>(null);
  // Focus picker selection (hub only): a category key, or 'all' for the whole started pool.
  const [focus, setFocus] = useState<VocabCategoryKey | 'all'>('all');

  // Resolve the signed-in user once (LT9: local persisted session, no network round-trip), then
  // load the started-situation set for progress-aware sourcing.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(async (): Promise<{ user: User | null }> => {
        const supabase = getSupabase();
        if (!supabase) return { user: null };
        try {
          const { data } = await supabase.auth.getSession();
          const user = data.session?.user ?? null;
          const ids = await loadStartedSituationIds(supabase, user);
          if (!cancelled) setStartedIds(ids);
          return { user };
        } catch (err) {
          logger.warn('VOCAB_AUTH_UNAVAILABLE', 'Could not resolve auth user for vocabulary review', {
            category: 'DATA_PROCESSING',
            error: err,
          });
          if (!cancelled) setStartedIds(new Set());
          return { user: null };
        }
      })
      .then((result) => {
        if (!cancelled) setAuth(result);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load ALL situations once; scope is applied client-side.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(async () => {
        try {
          const sits = await contentRepository.listSituations();
          if (!cancelled) setSituations(sits);
        } catch (err) {
          logger.error('VOCAB_CONTENT_LOAD_FAILED', 'Failed to load content for vocabulary review', {
            category: 'DATA_PROCESSING',
            error: err,
          });
          if (!cancelled) setSituations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Progress-aware pool (hub entry). Signed-out learners fall back to the FULL pool (every
  // vocabulary-introducing situation) so the mode still works without a progress signal.
  const pool: VocabPool | null = useMemo(() => {
    if (situations === null || startedIds === null) return null;
    const effectiveStarted =
      auth?.user == null ? new Set(situations.map((s) => s.id)) : startedIds;
    return buildVocabPool(situations, effectiveStarted);
  }, [situations, startedIds, auth]);

  if (auth === null || situations === null || pool === null) return loadingSpinner;

  // Situation entry → scope to that one lesson (deterministic, progress-independent). Hub entry →
  // the progress-aware pool, narrowable by the focus picker.
  const lessonSituation = situationId ? situations.find((s) => s.id === situationId) ?? null : null;

  if (lessonSituation) {
    const heading = `This lesson: “${lessonSituation.title}” · ${vocabCount([lessonSituation])} words`;
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0">
          <VocabularySessionScreen
            user={auth.user}
            situations={[lessonSituation]}
            onExit={onExit}
            scopeHeading={heading}
            emptyIsNoProgress={false}
          />
        </div>
      </div>
    );
  }

  // Hub: focus picker over the started pool.
  const options: { key: VocabCategoryKey | 'all'; label: string; count: number }[] = [
    { key: 'all', label: 'All started', count: pool.wordCount },
    ...pool.groups.map((g) => ({ key: g.category, label: g.label, count: g.wordCount })),
  ];
  const effectiveFocus = options.some((o) => o.key === focus) ? focus : 'all';
  const scopeSituations =
    effectiveFocus === 'all'
      ? pool.situations
      : pool.groups.find((g) => g.category === effectiveFocus)?.situations ?? [];
  const activeOption = options.find((o) => o.key === effectiveFocus)!;
  const scopeHeading = `${activeOption.label} · ${activeOption.count} words`;
  const emptyIsNoProgress = auth.user != null && pool.situations.length === 0;

  return (
    <div className="flex flex-col h-full">
      {options.length > 1 && (
        <div className="px-6 pt-4 flex flex-wrap gap-2" data-testid="vocab-focus-picker">
          {options.map((o) => {
            const active = o.key === effectiveFocus;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setFocus(o.key)}
                aria-pressed={active}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors min-h-[36px]',
                  active
                    ? 'border-ios-blue bg-ios-blue/5 text-ios-blue'
                    : 'border-transparent bg-ios-bg text-ios-gray'
                )}
              >
                {o.label} ({o.count})
              </button>
            );
          })}
        </div>
      )}
      {/* Remount the session per focus so the SRS queue rebuilds for the chosen deck. */}
      <div className="flex-1 min-h-0">
        <VocabularySessionScreen
          key={effectiveFocus}
          user={auth.user}
          situations={scopeSituations}
          onExit={onExit}
          scopeHeading={scopeHeading}
          emptyIsNoProgress={emptyIsNoProgress}
        />
      </div>
    </div>
  );
};

export default VocabularyView;
