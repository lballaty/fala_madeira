// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/vocabulary/VocabularyView.tsx
// Description: Vocabulary Review mode body (docs/ui-mockup/intended-ui-v3.html "VOCABULARY /
//   SRS" screen): flip flashcards graded Again/Hard/Good/Easy, driven by the SRS adaptive
//   engine (useVocabularySession → useDueItems/selectDueItems). Card variants: introduce
//   (PT front + 🔊 → meaning), retrieve (EN front → PT + 🔊), hear (audio-first → PT +
//   meaning). Rendered inside the Practice hub chrome per the ENGINE INTEGRATION CONTRACT
//   (../registry.ts): default-exports a ComponentType<PracticeModeProps>, body only,
//   onExit() returns to the hub. situationId scopes the session to one situation; null =
//   all vocabulary across situations (engine default). Nothing is ever hard-gated (§5/§12).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { CheckCircle2, Ear, Volume2 } from 'lucide-react';
import type { PracticeModeProps } from '../registry';
import { contentRepository } from '../../../content/repository';
import type { Situation } from '../../../content/schema';
import { getSupabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import type { Sm2Grade } from '../../../lib/srs';
import {
  useVocabularySession,
  VOCAB_GRADES,
  type VocabCard,
} from './useVocabularySession';

// Grade buttons per the v3 mockup (colors match its Again/Hard/Good/Easy row).
const GRADE_BUTTONS: { label: string; grade: Sm2Grade; className: string }[] = [
  { label: 'Again', grade: VOCAB_GRADES.again, className: 'bg-[#FF3B30]' },
  { label: 'Hard', grade: VOCAB_GRADES.hard, className: 'bg-[#FF9500]' },
  { label: 'Good', grade: VOCAB_GRADES.good, className: 'bg-[#34C759]' },
  { label: 'Easy', grade: VOCAB_GRADES.easy, className: 'bg-[#007AFF]' },
];

const loadingSpinner = (
  <div className="flex items-center justify-center py-16">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
  </div>
);

// ---------------------------------------------------------------------------
// Card faces (front/back per variant — see useVocabularySession VocabCardVariant)
// ---------------------------------------------------------------------------

interface CardFaceProps {
  card: VocabCard;
  isFlipped: boolean;
  playText: (text: string) => void;
}

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

const CardMeta = ({ card }: { card: VocabCard }) => (
  <div className="space-y-1">
    {card.entry.pronunciation && (
      <p className="text-xs text-ios-gray italic">[{card.entry.pronunciation}]</p>
    )}
    {card.entry.register && (
      <span className="text-[9px] font-bold uppercase text-ios-gray bg-ios-bg px-1.5 py-0.5 rounded-full">
        {card.entry.register}
      </span>
    )}
    {card.entry.note && <p className="text-xs text-ios-gray max-w-xs mx-auto">{card.entry.note}</p>}
  </div>
);

const CardFace = ({ card, isFlipped, playText }: CardFaceProps) => {
  if (!isFlipped) {
    if (card.variant === 'hear') {
      // Audio-first: play the word, guess the meaning (grades the 'hear' dimension).
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playText(card.entry.word);
            }}
            className="w-16 h-16 rounded-full bg-ios-blue text-white flex items-center justify-center mx-auto shadow-lg active:scale-95 transition-transform"
            aria-label="Play the word"
          >
            <Ear className="w-8 h-8" />
          </button>
          <p className="text-sm font-semibold">Listen — what does it mean?</p>
          <p className="text-xs text-ios-gray">tap the speaker, then flip to check</p>
        </div>
      );
    }
    if (card.variant === 'retrieve') {
      // EN → PT retrieval direction (grades the 'retrieve' dimension).
      return (
        <div className="space-y-2">
          <p className="text-2xl font-extrabold">{card.entry.translation}</p>
          <p className="text-xs text-ios-gray">say it in Portuguese · tap to flip</p>
        </div>
      );
    }
    // 'introduce': PT front with audio.
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center space-x-2">
          <p className="text-2xl font-extrabold">{card.entry.word}</p>
          <SpeakerButton onPlay={() => playText(card.entry.word)} label="Play the word" />
        </div>
        <p className="text-xs text-ios-gray">new word · tap to flip</p>
      </div>
    );
  }

  // Back face: always the full picture — PT word + audio, meaning, pronunciation, note.
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center space-x-2">
        <p className="text-2xl font-extrabold">{card.entry.word}</p>
        <SpeakerButton onPlay={() => playText(card.entry.word)} label="Play the word" />
      </div>
      <p className="text-lg font-semibold text-ios-gray">{card.entry.translation}</p>
      <CardMeta card={card} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Session screen (data already resolved by the default export below)
// ---------------------------------------------------------------------------

interface VocabularySessionScreenProps {
  user: User | null;
  situations: Situation[];
  onExit: () => void;
}

const VocabularySessionScreen = ({ user, situations, onExit }: VocabularySessionScreenProps) => {
  const {
    phase,
    card,
    index,
    total,
    remainingDue,
    remainingNew,
    isFlipped,
    flip,
    gradeCard,
    playText,
    audioError,
    summary,
    restart,
    isSignedOut,
  } = useVocabularySession({ user, situations });

  if (phase === 'loading') return loadingSpinner;

  if (phase === 'empty') {
    const hasAnyVocabulary = situations.some((s) => s.vocabulary.length > 0);
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-4">
        <CheckCircle2 className="w-12 h-12 text-[#34C759]" />
        <div className="space-y-1">
          <h3 className="text-lg font-bold">
            {hasAnyVocabulary ? 'All caught up' : 'No vocabulary here yet'}
          </h3>
          <p className="text-sm text-ios-gray max-w-xs">
            {hasAnyVocabulary
              ? 'Nothing due. Items resurface exactly when you are about to forget them — that is the system working, not you slacking.'
              : 'This situation has no vocabulary entries. Browse another situation or come back to the full deck.'}
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
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Session complete</h3>
          <p className="text-sm text-ios-gray">Grades feed the 4-dimension model.</p>
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
            <span className="text-ios-gray">Again presses</span>
            <span className="font-bold">{summary.againCount}</span>
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

  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    }
  };

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between text-xs text-ios-gray">
        <span>
          {remainingDue} due · {remainingNew} new
        </span>
        <span>
          {Math.min(index + 1, total)} / {total}
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={flip}
        onKeyDown={onCardKeyDown}
        aria-label={isFlipped ? 'Card back — grade your recall below' : 'Flashcard — tap to flip'}
        className="w-full bg-card rounded-2xl ios-shadow min-h-[180px] flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none"
      >
        <CardFace
          key={`${card.itemKey}:${card.dimension}:${index}`}
          card={card}
          isFlipped={isFlipped}
          playText={playText}
        />
      </div>

      {audioError && <p className="text-xs text-[#FF3B30] text-center">{audioError}</p>}

      <div className={`grid grid-cols-4 gap-2 ${isFlipped ? '' : 'invisible'}`}>
        {GRADE_BUTTONS.map(({ label, grade, className }) => (
          <button
            key={label}
            type="button"
            disabled={!isFlipped}
            onClick={() => gradeCard(grade)}
            className={`${className} text-white rounded-xl py-2.5 text-xs font-bold active:scale-95 transition-transform`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-ios-gray text-center">
        Grades feed the 4-dimension model: hear · say · retrieve · avoid.
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
// Default export: resolves auth + content, then mounts the session screen.
// Mounting the session only after the user is known keeps the SRS snapshot
// race-free (useVocabularySession refreshes mastery for a fixed user).
// ---------------------------------------------------------------------------

const VocabularyView = ({ situationId, onExit }: PracticeModeProps) => {
  const [auth, setAuth] = useState<{ user: User | null } | null>(null);
  const [situations, setSituations] = useState<Situation[] | null>(null);

  // Resolve the signed-in user once (modes receive only PracticeModeProps from the hub).
  // LT9: read the LOCAL persisted session (no network). auth.getUser() here made a network
  // round-trip that fails offline, silently mounting the session signed-out and dropping
  // every grade before the offline sync-queue could engage.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(async (): Promise<{ user: User | null }> => {
        const supabase = getSupabase();
        if (!supabase) return { user: null };
        try {
          const { data } = await supabase.auth.getSession();
          return { user: data.session?.user ?? null };
        } catch (err) {
          // Signed-out sessions are expected — practice continues without persistence.
          logger.warn('VOCAB_AUTH_UNAVAILABLE', 'Could not resolve auth user for vocabulary review', {
            category: 'DATA_PROCESSING',
            error: err,
          });
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

  // Load the vocabulary scope: one situation (browser route-in) or all situations.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(async (): Promise<Situation[]> => {
        try {
          if (situationId) {
            const one = await contentRepository.getSituation(situationId);
            if (one) return [one];
            // Stale/unknown id: fall back to the full deck instead of a dead screen.
            logger.warn('VOCAB_SITUATION_MISSING', `situation "${situationId}" not found — falling back to all vocabulary`, {
              category: 'DATA_PROCESSING',
              details: { situationId },
            });
          }
          return await contentRepository.listSituations();
        } catch (err) {
          logger.error('VOCAB_CONTENT_LOAD_FAILED', 'Failed to load situations for vocabulary review', {
            category: 'DATA_PROCESSING',
            error: err,
            details: { situationId },
          });
          return [];
        }
      })
      .then((list) => {
        if (!cancelled) setSituations(list);
      });
    return () => {
      cancelled = true;
    };
  }, [situationId]);

  if (auth === null || situations === null) return loadingSpinner;

  return <VocabularySessionScreen user={auth.user} situations={situations} onExit={onExit} />;
};

export default VocabularyView;
