// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/patterns/PatternBuilderView.tsx
// Description: Pattern Builder engine body (registry mode id 'patterns'; docs/ui-mockup/
//   intended-ui-v3.html "Pattern builder" screen; CONTENT-ARCHITECTURE §3 engine table).
//   Consumes phrase_patterns from the src/content repository. Per pattern it dynamically
//   picks the drill UI: slot-substitution chips (SlottedPatternDrill) when the pattern
//   carries usable slots, else the degraded recall card (PhraseDrill) — the seed packs ship
//   bare {id, base} patterns until enrichment, so degradation is the day-one common case and
//   zero situation/pack ids are special-cased. situationId null (tile entry) → in-mode
//   situation chooser over every situation that has patterns; a Situation id (browser entry)
//   → drill starts immediately. Deterministic composition (authored order or Fisher–Yates
//   shuffle — no AI calls); every self-grade emits the Coach signal via drill.ts. Load
//   failures log through src/lib/logger and render a calm retryable error state.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useState } from 'react';
import { ChevronRight, Puzzle, RefreshCw, Shuffle } from 'lucide-react';
import { contentRepository, type PhrasePattern, type Situation } from '../../../content';
import { errorMessage, logger, userMessage } from '../../../lib/logger';
import type { PracticeModeProps } from '../registry';
import {
  composeDrill,
  emitDrillComplete,
  emitPatternGrade,
  emptyTally,
  isSlottedPattern,
  shuffled,
  type PatternGrade,
} from './drill';
import { SlottedPatternDrill } from './SlottedPatternDrill';
import { PhraseDrill } from './PhraseDrill';
import { useDrillAudio } from './useDrillAudio';

type Phase = 'loading' | 'error' | 'pick' | 'drill' | 'done';

interface DrillRun {
  situation: Situation;
  queue: PhrasePattern[];
  index: number;
  tally: Record<PatternGrade, number>;
}

const PatternBuilderView = ({ situationId, onExit }: PracticeModeProps) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Situations offering patterns (tile-entry chooser; also "pick another" after a run). */
  const [choices, setChoices] = useState<Situation[]>([]);
  const [run, setRun] = useState<DrillRun | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const { playPhrase, isPlaying, audioError } = useDrillAudio();

  const startDrill = (situation: Situation, shuffle: boolean) => {
    setRun({
      situation,
      queue: composeDrill(situation.phrase_patterns, shuffle),
      index: 0,
      tally: emptyTally(),
    });
    setPhase('drill');
  };

  // Load content per the entry route (loading/error resets happen in the retry
  // handler, not synchronously here — react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (situationId) {
          const situation = await contentRepository.getSituation(situationId);
          if (cancelled) return;
          if (situation) {
            startDrill(situation, false);
            return;
          }
          // Stale/unknown id (e.g. a removed pack) — logged, then fall through to
          // the chooser instead of a dead end (never a silent failure).
          logger.warn('PATTERN_SITUATION_MISSING', `situation "${situationId}" not found — showing the situation chooser`, {
            category: 'DATA_PROCESSING',
            details: { situationId },
          });
        }
        const situations = await contentRepository.listSituations();
        if (cancelled) return;
        setChoices(situations.filter((s) => s.phrase_patterns.length > 0));
        setPhase('pick');
      } catch (error) {
        if (cancelled) return;
        const event = logger.error('PATTERN_CONTENT_LOAD_FAILED', 'could not load content for the pattern builder', {
          category: 'DATA_PROCESSING',
          error,
          details: { situationId },
        });
        setLoadError(
          userMessage('PATTERN_CONTENT_LOAD_FAILED', errorMessage(error) || 'Could not load practice content', event.request_id),
        );
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [situationId, reloadNonce]);

  const handleGrade = (grade: PatternGrade, phrase: string) => {
    if (!run) return;
    const pattern = run.queue[run.index];
    emitPatternGrade({
      patternId: pattern.id,
      situationId: run.situation.id,
      grade,
      drillKind: isSlottedPattern(pattern) ? 'slotted' : 'phrase',
      phrase,
    });
    const tally = { ...run.tally, [grade]: run.tally[grade] + 1 };
    if (run.index + 1 >= run.queue.length) {
      setRun({ ...run, tally });
      emitDrillComplete(run.situation.id, tally, run.queue.length);
      setPhase('done');
    } else {
      setRun({ ...run, tally, index: run.index + 1 });
    }
  };

  /** Shuffle mode mid-run: re-deal the not-yet-drilled remainder (deterministic Fisher–Yates). */
  const shuffleRemaining = () => {
    if (!run || run.index + 1 >= run.queue.length) return;
    const upToCurrent = run.queue.slice(0, run.index + 1);
    const remainder = shuffled(run.queue.slice(run.index + 1));
    setRun({ ...run, queue: [...upToCurrent, ...remainder] });
  };

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
      </div>
    );
  }

  // ── Load failure (calm, retryable — mirrors SituationPicker) ──
  if (phase === 'error') {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-sm text-ios-gray">{loadError}</p>
        <button
          onClick={() => {
            setPhase('loading');
            setLoadError(null);
            setReloadNonce((n) => n + 1);
          }}
          className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform inline-flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try again</span>
        </button>
      </div>
    );
  }

  // ── Situation chooser (tile entry / "pick another") — nothing locked (§5/§12) ──
  if (phase === 'pick') {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-ios-gray">
          Pick a situation to drill its phrases — any level, nothing locked.
        </p>
        {choices.length === 0 ? (
          <p className="text-sm text-ios-gray text-center py-8">
            No situations with phrases are loaded yet — new content packs add more over time.
          </p>
        ) : (
          choices.map((situation) => {
            const slottedCount = situation.phrase_patterns.filter(isSlottedPattern).length;
            return (
              <button
                key={situation.id}
                onClick={() => startDrill(situation, false)}
                className="w-full bg-card p-4 rounded-2xl ios-shadow flex items-center space-x-3 text-left active:scale-95 transition-transform"
              >
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ios-bg text-ios-gray flex-shrink-0">
                  L{situation.level}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm block truncate">{situation.title}</span>
                  <span className="text-xs text-ios-gray">
                    {situation.phrase_patterns.length} phrase{situation.phrase_patterns.length === 1 ? '' : 's'}
                    {slottedCount > 0 && ` · ${slottedCount} with slots`}
                  </span>
                </div>
                <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0" />
              </button>
            );
          })
        )}
      </div>
    );
  }

  if (!run) return null; // unreachable in 'drill'/'done' (defensive for the type system)

  // ── Completion summary ──
  if (phase === 'done') {
    return (
      <div className="p-6 space-y-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#5856D6]/10 flex items-center justify-center mx-auto">
          <Puzzle className="w-8 h-8 text-[#5856D6]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Drill complete</h3>
          <p className="text-sm text-ios-gray">
            {run.situation.title} · {run.queue.length} phrase{run.queue.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="bg-card rounded-2xl ios-shadow p-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-bold text-[#34C759]">{run.tally['got-it']}</p>
            <p className="text-[10px] font-bold text-ios-gray uppercase">Got it</p>
          </div>
          <div>
            <p className="text-xl font-bold text-[#FF9F0A]">{run.tally.almost}</p>
            <p className="text-[10px] font-bold text-ios-gray uppercase">Almost</p>
          </div>
          <div>
            <p className="text-xl font-bold text-[#FF3B30]">{run.tally.missed}</p>
            <p className="text-[10px] font-bold text-ios-gray uppercase">Missed</p>
          </div>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => startDrill(run.situation, false)}
            className="w-full py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            Go again
          </button>
          <button
            onClick={() => startDrill(run.situation, true)}
            className="w-full py-3 bg-card text-ios-blue rounded-2xl font-bold text-sm ios-shadow active:scale-95 transition-transform inline-flex items-center justify-center space-x-2"
          >
            <Shuffle className="w-4 h-4" />
            <span>Shuffle &amp; go again</span>
          </button>
          {!situationId && (
            <button
              onClick={() => setPhase('pick')}
              className="w-full py-3 bg-card text-ios-blue rounded-2xl font-bold text-sm ios-shadow active:scale-95 transition-transform"
            >
              Pick another situation
            </button>
          )}
          <button
            onClick={onExit}
            className="w-full py-3 text-ios-gray rounded-2xl font-bold text-sm active:scale-95 transition-transform"
          >
            Back to Practice
          </button>
        </div>
      </div>
    );
  }

  // ── Drill ──
  if (run.queue.length === 0) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-sm text-ios-gray">
          &ldquo;{run.situation.title}&rdquo; has no phrases to drill yet — new content packs add more over time.
        </p>
        {!situationId && (
          <button
            onClick={() => setPhase('pick')}
            className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            Pick another situation
          </button>
        )}
        <button onClick={onExit} className="block mx-auto text-sm font-semibold text-ios-blue">
          Back to Practice
        </button>
      </div>
    );
  }

  const pattern = run.queue[run.index];
  const slotted = isSlottedPattern(pattern);
  const progressPercent = ((run.index + 1) / run.queue.length) * 100;

  return (
    <div className="p-6 space-y-4">
      {/* Run header: situation + progress + mid-run shuffle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <p className="font-semibold text-sm truncate">{run.situation.title}</p>
            <p className="text-xs text-ios-gray">
              Phrase {run.index + 1} of {run.queue.length}
            </p>
          </div>
          <button
            onClick={shuffleRemaining}
            disabled={run.index + 1 >= run.queue.length}
            title="Shuffle the remaining phrases"
            className="p-2 rounded-xl bg-card ios-shadow text-ios-blue disabled:opacity-40 active:scale-95 transition-transform flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Shuffle className="w-4 h-4" />
            <span className="sr-only">Shuffle the remaining phrases</span>
          </button>
        </div>
        <div className="h-1.5 bg-line rounded-full overflow-hidden ios-shadow">
          <div
            className="h-full bg-[#5856D6] rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Per-pattern drill body — dynamic slotted/degraded selection, keyed to reset state */}
      {slotted ? (
        <SlottedPatternDrill
          key={pattern.id}
          pattern={pattern}
          onGrade={handleGrade}
          playPhrase={playPhrase}
          isPlaying={isPlaying}
        />
      ) : (
        <PhraseDrill
          key={pattern.id}
          pattern={pattern}
          onGrade={handleGrade}
          playPhrase={playPhrase}
          isPlaying={isPlaying}
        />
      )}

      {/* Inline playback failure (paired with the PATTERN_TTS_FAILED log record) */}
      {audioError && <p className="text-[11px] text-[#FF3B30] text-center">{audioError}</p>}
    </div>
  );
};

export default PatternBuilderView;
