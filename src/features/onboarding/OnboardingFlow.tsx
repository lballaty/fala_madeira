// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/OnboardingFlow.tsx
// Description: First-run onboarding flow (docs/CONTENT-ARCHITECTURE.md §5; intended-ui-v3.html).
//   A calm, honest, multi-step first run — no dark patterns (§12): every choice is skippable-forward
//   where it should be, nothing hard-gates, and consent is plain-language with linked documents.
//   Steps: (1) welcome, (2) light placement (Complete beginner / A few words / Basic chat ->
//   maps to a starting practical level L0/L1/L2 — a sensible start, never a lock §5), (3) PATH
//   CHOICE (Structured Course / Learn by goal / Just start talking -> sets pathType via
//   usePathSelection; 'goal' inserts a track-picker step -> setActiveTrack), (4) 60-second first
//   win ("Bom dia!": tap-to-hear via playSpeech with a pulse, optional say-it-back via
//   platform.speech, degrading gracefully to a confirm when recognition is unavailable),
//   (5) consent (Terms / Privacy / AI-use checkboxes linking to LegalPage; persists consent).
//   On finish it commits via useOnboarding.complete() and the App shell renders the main tabs.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Volume2, Mic, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { platform } from '../../platform';
import { contentRepository } from '../../content';
import type { PracticalLevel } from '../../content/schema';
import type { Track } from '../../content/schema';
import type { PathType } from '../../paths';
import { LegalPage, type LegalDocId } from '../legal';
import type { OnboardingApi } from './useOnboarding';

// The path-selection surface the flow drives (a subset of usePathSelection's return). Kept as a
// narrow prop contract so App.tsx passes its existing pathSelection without a new hook instance.
interface OnboardingPathControls {
  setPathType: (type: PathType) => void;
  setActiveTrack: (trackId: string) => Promise<void> | void;
}

interface OnboardingFlowProps {
  /**
   * The App shell's OWN useOnboarding instance — the flow must commit through the same
   * instance that gates rendering, or completing onboarding never un-gates the shell
   * (the "stuck on Setting up…" bug: two instances, the gate one never saw complete()).
   */
  onboarding: OnboardingApi;
  pathControls: OnboardingPathControls;
  /** Routes through geminiService.playSpeech with the learner's tutor/speed (App-provided). */
  playSpeech: (text: string) => Promise<void> | void;
  /** Called once the flow commits — App.tsx flips to the main tab shell. */
  onFinish: () => void;
}

// --- Step model -------------------------------------------------------------

type Step = 'welcome' | 'placement' | 'path' | 'track' | 'firstWin' | 'consent';

interface PlacementOption {
  id: string;
  label: string;
  detail: string;
  level: PracticalLevel;
}

// Light placement (§5) — three plain choices mapping to a starting practical level. A sensible
// start, never a lock: the learner can jump anywhere later regardless of this answer.
const PLACEMENT_OPTIONS: PlacementOption[] = [
  { id: 'beginner', label: 'Complete beginner', detail: "I'm starting from zero.", level: 0 },
  { id: 'a-few-words', label: 'A few words', detail: 'I know some greetings and basics.', level: 1 },
  { id: 'basic-chat', label: 'Basic conversation', detail: 'I can handle simple everyday talk.', level: 2 },
];

interface PathOption {
  id: string;
  pathType: PathType;
  label: string;
  detail: string;
  /** True when choosing this path needs the follow-up track-picker step. */
  needsTrack: boolean;
}

// The three onboarding path choices (§5). "Just start talking" maps to the Adaptive Guided tutor
// default; "Learn by goal" maps to the Goal Track and opens the track picker.
const PATH_OPTIONS: PathOption[] = [
  {
    id: 'structured',
    pathType: 'structured',
    label: 'Follow the structured course',
    detail: 'Month-by-month, day-by-day. The app leads the way.',
    needsTrack: false,
  },
  {
    id: 'goal',
    pathType: 'goal-track',
    label: 'Learn by goal',
    detail: 'Pick a life goal — the app orders that track for you.',
    needsTrack: true,
  },
  {
    id: 'just-start',
    pathType: 'adaptive-guided',
    label: 'Just start talking',
    detail: 'A guided ~30-min daily session, built around you.',
    needsTrack: false,
  },
];

// --- Shared shell -----------------------------------------------------------

interface StepShellProps {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Consistent step frame: a slim progress dots row, a title, body, and an optional sticky footer. */
const StepShell = ({ stepIndex, totalSteps, title, subtitle, children, footer }: StepShellProps) => (
  <motion.div
    initial={{ opacity: 0, x: 24 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -24 }}
    transition={{ duration: 0.25 }}
    className="flex flex-col h-full"
  >
    <div className="flex items-center justify-center gap-1.5 pt-8">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i === stepIndex ? 'w-6 bg-ios-blue' : i < stepIndex ? 'w-1.5 bg-ios-blue/50' : 'w-1.5 bg-ios-gray/25'
          )}
        />
      ))}
    </div>
    <div className="flex-1 overflow-y-auto px-8 pt-8 pb-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="text-ios-gray text-sm mt-2 leading-relaxed">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
    {footer && <div className="px-8 pb-8 pt-2 safe-area-bottom shrink-0">{footer}</div>}
  </motion.div>
);

/** A large primary CTA used across steps (calm, single obvious action — no dark patterns §12). */
const PrimaryButton = ({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'w-full py-4 rounded-2xl font-bold text-white transition-colors flex items-center justify-center gap-2',
      disabled ? 'bg-ios-gray/30' : 'bg-ios-blue shadow-lg shadow-ios-blue/20'
    )}
  >
    {label}
    {!disabled && <ChevronRight className="w-4 h-4" />}
  </button>
);

/** A selectable list card (placement / path / track) with a check when active. */
const ChoiceCard = ({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'w-full text-left p-4 rounded-2xl border transition-all flex items-start justify-between gap-3',
      selected ? 'border-ios-blue bg-ios-blue/5' : 'border-ios-gray/20 bg-card'
    )}
  >
    <span>
      <span className="block font-bold text-sm">{label}</span>
      <span className="block text-xs text-ios-gray mt-0.5 leading-snug">{detail}</span>
    </span>
    <span
      className={cn(
        'shrink-0 w-6 h-6 rounded-full flex items-center justify-center border transition-all mt-0.5',
        selected ? 'bg-ios-blue border-ios-blue' : 'border-ios-gray/30'
      )}
    >
      {selected && <Check className="w-3.5 h-3.5 text-white" />}
    </span>
  </button>
);

// --- Flow -------------------------------------------------------------------

export const OnboardingFlow = ({
  onboarding,
  pathControls,
  playSpeech,
  onFinish,
}: OnboardingFlowProps) => {

  const [step, setStep] = useState<Step>('welcome');
  const [placement, setPlacement] = useState<PlacementOption | null>(null);
  const [chosenPath, setChosenPath] = useState<PathOption | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [openLegalDoc, setOpenLegalDoc] = useState<LegalDocId | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedAiUsage, setAcceptedAiUsage] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // The concrete ordered step list — the track step only exists when a goal path is chosen, so
  // the progress dots and back/forward stay honest about how many steps remain (§12).
  const steps = useMemo<Step[]>(() => {
    const base: Step[] = ['welcome', 'placement', 'path'];
    if (chosenPath?.needsTrack) base.push('track');
    base.push('firstWin', 'consent');
    return base;
  }, [chosenPath]);
  const stepIndex = Math.max(0, steps.indexOf(step));

  const goNext = useCallback(() => {
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  }, [steps, stepIndex]);

  // Lazy-load the tracks only when the goal path is chosen (the picker needs them).
  useEffect(() => {
    if (!chosenPath?.needsTrack || tracks.length > 0) return;
    let cancelled = false;
    void contentRepository
      .listTracks()
      .then((loaded) => {
        if (!cancelled) setTracks(loaded);
      })
      .catch((error) => {
        logger.warn('ONBOARDING_TRACKS_LOAD_FAILED', 'could not load tracks for the onboarding picker', {
          category: 'DATA_PROCESSING',
          error,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [chosenPath, tracks.length]);

  const handleChoosePath = useCallback(
    (option: PathOption) => {
      setChosenPath(option);
      pathControls.setPathType(option.pathType);
      logger.debug('onboarding_path', 'onboarding path chosen', {
        category: 'USER_ACTION',
        details: { pathType: option.pathType },
      });
      // Goal path routes to the track picker; the others advance straight to the first win.
      setStep(option.needsTrack ? 'track' : 'firstWin');
    },
    [pathControls]
  );

  const handleChooseTrack = useCallback(
    (trackId: string) => {
      setSelectedTrackId(trackId);
      void pathControls.setActiveTrack(trackId);
      setStep('firstWin');
    },
    [pathControls]
  );

  const handleFinish = useCallback(async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    await onboarding.complete({
      placementLevel: placement?.level ?? 0,
      acceptedTerms,
      acceptedAiUsage,
    });
    onFinish();
  }, [isFinishing, onboarding, placement, acceptedTerms, acceptedAiUsage, onFinish]);

  return (
    <div className="flex flex-col h-full bg-ios-bg text-text">
      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <StepShell
            key="welcome"
            stepIndex={stepIndex}
            totalSteps={steps.length}
            title="Bem-vindo to FalaMadeira"
            subtitle="Learn to actually speak the Madeiran way — listen, repeat, and use it in real situations. This takes about a minute to set up, and you can change anything later."
            footer={<PrimaryButton label="Let's go" onClick={goNext} />}
          >
            <div className="rounded-3xl bg-card p-6 flex flex-col items-center text-center gap-3 border border-ios-gray/15">
              <div className="w-16 h-16 rounded-2xl bg-ios-blue/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-ios-blue" />
              </div>
              <p className="text-sm text-ios-gray leading-relaxed">
                No pressure, no lock-in. We&apos;ll set a sensible starting point — you can jump ahead or switch paths whenever you like.
              </p>
            </div>
          </StepShell>
        )}

        {step === 'placement' && (
          <StepShell
            key="placement"
            stepIndex={stepIndex}
            totalSteps={steps.length}
            title="Where are you starting?"
            subtitle="This just sets a sensible starting point. It never locks anything — you can move up or down anytime."
            footer={<PrimaryButton label="Continue" onClick={goNext} disabled={!placement} />}
          >
            <div className="space-y-3">
              {PLACEMENT_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  label={option.label}
                  detail={option.detail}
                  selected={placement?.id === option.id}
                  onClick={() => setPlacement(option)}
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 'path' && (
          <StepShell
            key="path"
            stepIndex={stepIndex}
            totalSteps={steps.length}
            title="How do you want to learn?"
            subtitle="Pick the style that fits you today. You can switch anytime — your progress is shared across all of them."
          >
            <div className="space-y-3">
              {PATH_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.id}
                  label={option.label}
                  detail={option.detail}
                  selected={chosenPath?.id === option.id}
                  onClick={() => handleChoosePath(option)}
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 'track' && (
          <StepShell
            key="track"
            stepIndex={stepIndex}
            totalSteps={steps.length}
            title="Pick your goal"
            subtitle="Which life goal matters most right now? The app will order that track for you — you can change it later."
          >
            {tracks.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-ios-gray">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {tracks.map((track) => (
                  <ChoiceCard
                    key={track.id}
                    label={track.name}
                    detail={track.goal}
                    selected={selectedTrackId === track.id}
                    onClick={() => handleChooseTrack(track.id)}
                  />
                ))}
              </div>
            )}
          </StepShell>
        )}

        {step === 'firstWin' && (
          <FirstWinStep
            key="firstWin"
            stepIndex={stepIndex}
            totalSteps={steps.length}
            playSpeech={playSpeech}
            onContinue={goNext}
          />
        )}

        {step === 'consent' && (
          <StepShell
            key="consent"
            stepIndex={stepIndex}
            totalSteps={steps.length}
            title="One last thing"
            subtitle="Please review and accept before we start. We keep this short and plain."
            footer={
              <PrimaryButton
                label={isFinishing ? 'Setting up…' : 'Start learning'}
                onClick={() => void handleFinish()}
                disabled={!acceptedTerms || !acceptedAiUsage || isFinishing}
              />
            }
          >
            <div className="space-y-4">
              <ConsentRow checked={acceptedTerms} onToggle={() => setAcceptedTerms((v) => !v)}>
                I agree to the{' '}
                <button type="button" onClick={() => setOpenLegalDoc('terms')} className="underline font-bold">
                  Terms of Service
                </button>{' '}
                and{' '}
                <button type="button" onClick={() => setOpenLegalDoc('privacy')} className="underline font-bold">
                  Privacy Policy
                </button>{' '}
                (GDPR compliant).
              </ConsentRow>

              <ConsentRow checked={acceptedAiUsage} onToggle={() => setAcceptedAiUsage((v) => !v)}>
                I understand I am interacting with an{' '}
                <button type="button" onClick={() => setOpenLegalDoc('ai-use')} className="underline font-bold">
                  AI system
                </button>{' '}
                (EU AI Act disclosure), and that my data personalizes my learning.
              </ConsentRow>
            </div>
          </StepShell>
        )}
      </AnimatePresence>

      <LegalPage doc={openLegalDoc} onClose={() => setOpenLegalDoc(null)} />
    </div>
  );
};

// --- Consent row ------------------------------------------------------------

const ConsentRow = ({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <label className="flex items-start gap-3 cursor-pointer group">
    <span className="relative flex items-center mt-0.5 shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-ios-gray/30 bg-card transition-all checked:bg-ios-blue checked:border-ios-blue"
      />
      <Check className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
    </span>
    <span className="text-xs leading-snug text-ios-gray">{children}</span>
  </label>
);

// --- 60-second first win ----------------------------------------------------

type SayItBackState = 'idle' | 'listening' | 'done' | 'unavailable';

interface FirstWinStepProps {
  stepIndex: number;
  totalSteps: number;
  playSpeech: (text: string) => Promise<void> | void;
  onContinue: () => void;
}

/**
 * The "60-second first win": the learner hears "Bom dia!" (tap-to-hear, pulsing while it plays)
 * and can optionally say it back through platform.speech. Recognition degrades gracefully — when
 * it's unavailable or errors, the say-it-back collapses to a friendly "Nice!" confirm so the
 * learner always reaches a win (§12: voice-first, but never a hard gate).
 */
const FirstWinStep = ({ stepIndex, totalSteps, playSpeech, onContinue }: FirstWinStepProps) => {
  const phrase = config.onboarding.firstWinPhrase;
  const translation = config.onboarding.firstWinTranslation;
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasHeard, setHasHeard] = useState(false);
  const [sayState, setSayState] = useState<SayItBackState>('idle');

  const speechAvailable = useMemo(() => {
    try {
      return platform.speech.isAvailable();
    } catch {
      return false;
    }
  }, []);

  const handleHear = useCallback(async () => {
    setIsPlaying(true);
    try {
      await playSpeech(phrase);
    } catch (error) {
      logger.warn('ONBOARDING_FIRST_WIN_PLAY_FAILED', 'could not play the first-win phrase', {
        category: 'DATA_PROCESSING',
        error,
      });
    } finally {
      setIsPlaying(false);
      setHasHeard(true);
    }
  }, [phrase, playSpeech]);

  const handleSayItBack = useCallback(async () => {
    if (!speechAvailable) {
      // Graceful degrade: no recognition on this platform — confirm the win without it.
      setSayState('done');
      return;
    }
    setSayState('listening');
    try {
      await platform.speech.recognize({
        language: config.onboarding.firstWinRecognitionLanguage,
        timeoutMs: config.onboarding.firstWinRecognitionTimeoutMs,
      });
      setSayState('done');
    } catch (error) {
      // Any recognition failure still resolves to a win — the point is the try, not the score.
      logger.debug('onboarding_say_it_back', 'say-it-back recognition did not complete — confirming the win anyway', {
        category: 'USER_ACTION',
        error,
      });
      setSayState('done');
    }
  }, [speechAvailable]);

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Your first words"
      subtitle="Tap to hear how a Madeiran says good morning. Then, if you like, say it back."
      footer={<PrimaryButton label={hasHeard ? 'Continue' : 'Skip for now'} onClick={onContinue} />}
    >
      <div className="rounded-3xl bg-card p-6 flex flex-col items-center text-center gap-5 border border-ios-gray/15">
        <button
          type="button"
          onClick={() => void handleHear()}
          className="relative flex flex-col items-center gap-3"
          aria-label={`Hear ${phrase}`}
        >
          <span className="relative flex items-center justify-center">
            {isPlaying && (
              <motion.span
                className="absolute inset-0 rounded-full bg-ios-blue/30"
                animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
            <span className="relative w-20 h-20 rounded-full bg-ios-blue flex items-center justify-center shadow-lg shadow-ios-blue/30">
              <Volume2 className="w-9 h-9 text-white" />
            </span>
          </span>
          <span className="text-3xl font-bold tracking-tight">{phrase}</span>
          <span className="text-sm text-ios-gray">{translation}</span>
        </button>

        {hasHeard && (
          <div className="w-full pt-2 border-t border-ios-bg">
            {sayState === 'done' ? (
              <p className="text-sm font-bold text-green-600 flex items-center justify-center gap-2 pt-3">
                <Check className="w-4 h-4" /> Nice! You just said your first Madeiran words.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handleSayItBack()}
                disabled={sayState === 'listening'}
                className="mt-3 w-full py-3 rounded-xl bg-ios-bg font-bold text-sm text-ios-blue flex items-center justify-center gap-2"
              >
                {sayState === 'listening' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Listening…
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" /> {speechAvailable ? 'Say it back' : "I said it"}
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </StepShell>
  );
};

export default OnboardingFlow;
