// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/listening/ListeningView.tsx
// Description: Listening Engine body view (CONTENT-ARCHITECTURE §3; mockup: the Listening
//   screen in docs/ui-mockup/intended-ui-v3.html). Mechanics: slow/normal/natural speed
//   pills (listeningConfig), line-by-line + play-all TTS in each line's voice_type,
//   transcript hidden-by-default with reveal, per-word tap-to-replay, dictation ("type what
//   you heard" with an LCS diff), and deterministic "what did you hear?" checks. When a
//   situation has no dialogues yet (all seed situations today — enrichment fills them
//   later), it degrades honestly to the situation's phrase patterns + vocabulary with the
//   same mechanics. Results are logged as USER_ACTION events (// COACH SIGNAL markers) for
//   the coach step to consume. Mounted by the Practice hub (chrome lives there) via the
//   listening.stub.tsx registry entry; receives PracticeModeProps.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Eye, EyeOff, Play, Square, Volume2, X } from 'lucide-react';
import { contentRepository } from '../../../content';
import type { Situation, VoiceType } from '../../../content';
import { logger, errorMessage } from '../../../lib/logger';
import type { PracticeModeProps } from '../registry';
import { listeningConfig, getListeningSpeed } from './listeningConfig';
import type { SpeedId } from './listeningConfig';
import {
  buildChecks,
  buildDialogueItems,
  buildPhraseItems,
  cleanWord,
  scoreDictation,
  wordsOf,
} from './listeningContent';
import type { DictationResult, ListenItem, ListeningCheck } from './listeningContent';
import { playListeningText, stopListeningAudio } from './listeningAudio';

// Voice archetype → human label (schema §8) and avatar tile color.
const VOICE_LABELS: Record<VoiceType, string> = {
  teacher: 'clear teacher voice',
  local: 'natural local voice',
  older: 'older voice',
  younger: 'younger voice',
  service: 'service-worker voice',
  phone: 'phone-audio voice',
  noisy: 'noisy-background voice',
};

const VOICE_BG: Record<VoiceType, string> = {
  teacher: 'bg-[#0A84FF]',
  local: 'bg-[#34C759]',
  older: 'bg-[#AF52DE]',
  younger: 'bg-[#FF9500]',
  service: 'bg-[#FF2D55]',
  phone: 'bg-[#5856D6]',
  noisy: 'bg-[#8E8E93]',
};

const ListeningView = ({ situationId, onExit }: PracticeModeProps) => {
  // ── Content loading (repository — content is data, never hardcoded) ──
  const [situation, setSituation] = useState<Situation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let picked: Situation | null = null;
        if (situationId) {
          picked = await contentRepository.getSituation(situationId);
          if (!picked) {
            logger.warn('listening_situation_missing', `situation "${situationId}" not found — falling back to default`, {
              category: 'DATA_PROCESSING',
              details: { situationId },
            });
          }
        }
        if (!picked) {
          // Direct tile entry (or stale id): engine default = first situation that
          // already has dialogues, else the first situation overall (§3 lens rule).
          const all = await contentRepository.listSituations();
          picked = all.find((s) => (s.dialogues?.length ?? 0) > 0) ?? all[0] ?? null;
        }
        if (!cancelled) setSituation(picked);
      } catch (error) {
        logger.error('listening_content_load_failed', 'could not load content for the Listening engine', {
          category: 'DATA_PROCESSING',
          error,
          details: { situationId },
        });
        if (!cancelled) setSituation(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [situationId]);

  // ── Items: dialogue lines when present, phrase/vocab fallback otherwise ──
  const dialogues = useMemo(() => situation?.dialogues ?? [], [situation]);
  const hasDialogues = dialogues.length > 0;
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const activeDialogue = hasDialogues ? dialogues[Math.min(dialogueIndex, dialogues.length - 1)] : null;

  const items: ListenItem[] = useMemo(() => {
    if (!situation) return [];
    return activeDialogue
      ? buildDialogueItems(activeDialogue)
      : buildPhraseItems(situation, listeningConfig.maxPhraseItems);
  }, [situation, activeDialogue]);

  // ── Playback (token-guarded so stale onEnd callbacks can't clobber state) ──
  const playSeqRef = useRef(0);
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [speedId, setSpeedId] = useState<SpeedId>(listeningConfig.defaultSpeedId);
  const rate = getListeningSpeed(speedId).rate;

  useEffect(() => () => stopListeningAudio(), []);

  const stopAll = useCallback(() => {
    playSeqRef.current += 1;
    stopListeningAudio();
    setPlayingItemId(null);
    setIsPlayingAll(false);
  }, []);

  const playText = useCallback(
    async (text: string, voiceType: VoiceType, highlightId: string | null) => {
      const token = ++playSeqRef.current;
      setAudioError(null);
      setIsPlayingAll(false);
      setPlayingItemId(highlightId);
      try {
        await playListeningText(text, voiceType, rate, () => {
          if (playSeqRef.current === token) setPlayingItemId(null);
        });
      } catch (error) {
        if (playSeqRef.current === token) {
          setPlayingItemId(null);
          setAudioError(errorMessage(error) ?? 'Playback failed. Please try again.');
        }
      }
    },
    [rate]
  );

  const playItem = useCallback(
    (item: ListenItem) => void playText(item.text, item.voiceType, item.id),
    [playText]
  );

  const playAll = useCallback(() => {
    const token = ++playSeqRef.current;
    setAudioError(null);
    setIsPlayingAll(true);
    const step = async (index: number): Promise<void> => {
      if (playSeqRef.current !== token) return;
      if (index >= items.length) {
        setIsPlayingAll(false);
        setPlayingItemId(null);
        return;
      }
      const item = items[index];
      setPlayingItemId(item.id);
      try {
        await playListeningText(item.text, item.voiceType, rate, () => void step(index + 1));
      } catch (error) {
        if (playSeqRef.current === token) {
          setIsPlayingAll(false);
          setPlayingItemId(null);
          setAudioError(errorMessage(error) ?? 'Playback failed. Please try again.');
        }
      }
    };
    void step(0);
  }, [items, rate]);

  // ── Transcript reveal + per-word replay ──
  const [isRevealed, setIsRevealed] = useState(false);

  const toggleReveal = useCallback(() => {
    setIsRevealed((prev) => {
      const next = !prev;
      if (next && situation) {
        // COACH SIGNAL: transcript reveal = the learner needed to see the text
        // (hear-dimension gap on this dialogue/phrase set at this speed).
        logger.info('listening_transcript_revealed', 'listening transcript revealed', {
          category: 'USER_ACTION',
          details: {
            situationId: situation.id,
            dialogueId: activeDialogue?.id ?? null,
            source: activeDialogue ? 'dialogue' : 'phrases',
            speed: speedId,
          },
        });
      }
      return next;
    });
  }, [situation, activeDialogue, speedId]);

  const replayWord = useCallback(
    (item: ListenItem, rawWord: string) => {
      const word = cleanWord(rawWord);
      if (!word || !situation) return;
      // COACH SIGNAL: per-word replay marks the exact words the learner needed
      // again — the strongest per-token difficulty signal this engine emits.
      logger.info('listening_word_replayed', `word replayed: ${word}`, {
        category: 'USER_ACTION',
        details: { situationId: situation.id, itemId: item.id, word, speed: speedId },
      });
      void playText(word, item.voiceType, item.id);
    },
    [situation, speedId, playText]
  );

  // ── Dictation (type what you heard) ──
  const [dictationIndex, setDictationIndex] = useState(0);
  const [dictationInput, setDictationInput] = useState('');
  const [dictationResult, setDictationResult] = useState<DictationResult | null>(null);
  const dictationItem = items.length > 0 ? items[dictationIndex % items.length] : null;

  const checkDictation = useCallback(() => {
    if (!dictationItem || !situation || dictationInput.trim() === '') return;
    const result = scoreDictation(dictationItem.text, dictationInput);
    setDictationResult(result);
    // COACH SIGNAL: dictation score (0–1) = hear-dimension accuracy on this exact
    // line at this speed; details carry matched/total for finer coach weighting.
    logger.info('listening_dictation_scored', `dictation scored ${result.matched}/${result.total}`, {
      category: 'USER_ACTION',
      details: {
        situationId: situation.id,
        itemId: dictationItem.id,
        score: result.score,
        matched: result.matched,
        total: result.total,
        speed: speedId,
      },
    });
  }, [dictationItem, situation, dictationInput, speedId]);

  const nextDictation = useCallback(() => {
    if (items.length === 0) return;
    setDictationIndex((i) => (i + 1) % items.length);
    setDictationInput('');
    setDictationResult(null);
  }, [items.length]);

  // ── "What did you hear?" checks (deterministic — seeded from content ids) ──
  const checks: ListeningCheck[] = useMemo(
    () =>
      situation
        ? buildChecks(
            items,
            `${situation.id}::${activeDialogue?.id ?? 'phrases'}`,
            listeningConfig.maxChecks,
            listeningConfig.choicesPerCheck
          )
        : [],
    [items, situation, activeDialogue]
  );
  const [checkAnswers, setCheckAnswers] = useState<Record<string, number>>({});

  const answerCheck = useCallback(
    (check: ListeningCheck, choiceIndex: number) => {
      if (!situation || checkAnswers[check.id] !== undefined) return;
      setCheckAnswers((prev) => ({ ...prev, [check.id]: choiceIndex }));
      const choice = check.choices[choiceIndex];
      // COACH SIGNAL: comprehension-check outcome (correct/incorrect) on a specific
      // line at the current speed — the coach's per-situation listening score input.
      logger.info('listening_check_answered', `listening check ${choice.correct ? 'correct' : 'incorrect'}`, {
        category: 'USER_ACTION',
        details: {
          situationId: situation.id,
          checkId: check.id,
          targetItemId: check.targetItemId,
          correct: choice.correct,
          speed: speedId,
        },
      });
    },
    [situation, checkAnswers, speedId]
  );

  // ── Render ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
      </div>
    );
  }

  if (!situation || items.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-ios-bg flex items-center justify-center">
          <Volume2 className="w-8 h-8 text-ios-gray" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Nothing to listen to yet</h3>
          <p className="text-sm text-ios-gray max-w-xs">
            {situation
              ? 'This situation has no dialogues, phrases, or vocabulary yet. Nothing is locked — pick another situation and come back once this one is filled in.'
              : 'No content is loaded right now. Check your connection and try again — everything else in Practice still works.'}
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

  const speakers = activeDialogue
    ? items.filter((item, i) => items.findIndex((o) => o.speaker === item.speaker) === i)
    : [];

  return (
    <div className="p-4 space-y-3">
      {/* Context line (mockup: "At the café · dialogue · 2 speakers") */}
      <p className="text-xs text-ios-gray px-1">
        {situation.title} ·{' '}
        {activeDialogue
          ? `dialogue · ${speakers.length} speaker${speakers.length === 1 ? '' : 's'}`
          : `${items.length} phrases & words`}
      </p>

      {/* Honest empty-dialogue degradation notice */}
      {!hasDialogues && (
        <div className="bg-ios-bg rounded-xl px-3 py-2.5">
          <p className="text-xs text-ios-gray">
            No recorded dialogues in this situation yet — they arrive with content enrichment.
            Meanwhile the same controls (speeds, reveal, replay, dictation, checks) run on its
            phrases and words below.
          </p>
        </div>
      )}

      {/* Dialogue selector (only when a situation ships several dialogues) */}
      {dialogues.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {dialogues.map((dialogue, i) => (
            <button
              key={dialogue.id}
              onClick={() => setDialogueIndex(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                i === dialogueIndex ? 'bg-ios-blue text-white' : 'bg-card text-ios-gray ios-shadow'
              }`}
            >
              {dialogue.title ?? `Dialogue ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Speed pills: slow / normal / natural */}
      <div className="flex gap-2" role="group" aria-label="Playback speed">
        {listeningConfig.speeds.map((speed) => (
          <button
            key={speed.id}
            onClick={() => setSpeedId(speed.id)}
            aria-pressed={speed.id === speedId}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              speed.id === speedId ? 'bg-ios-blue text-white' : 'bg-card text-ios-gray ios-shadow'
            }`}
          >
            {speed.label}
          </button>
        ))}
      </div>

      {audioError && (
        <div className="bg-[#FF3B30]/10 rounded-xl px-3 py-2.5">
          <p className="text-xs text-[#FF3B30]">{audioError}</p>
        </div>
      )}

      {/* Player card: lines (text hidden until reveal), play-all, transcript */}
      <div className="bg-card rounded-2xl ios-shadow p-4 space-y-3">
        {activeDialogue?.context && <p className="text-xs text-ios-gray italic">{activeDialogue.context}</p>}

        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-full ${VOICE_BG[item.voiceType]} flex items-center justify-center flex-shrink-0`}
                >
                  <span className="text-white text-xs font-bold">{item.speaker.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ios-gray truncate">
                    {item.speaker} · {VOICE_LABELS[item.voiceType]}
                  </p>
                  {!isRevealed && <p className="text-xs text-ios-gray/60">Line {i + 1} · tap to hear</p>}
                </div>
                <button
                  onClick={() => (playingItemId === item.id && !isPlayingAll ? stopAll() : playItem(item))}
                  aria-label={playingItemId === item.id ? `Stop line ${i + 1}` : `Play line ${i + 1}`}
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    playingItemId === item.id ? 'bg-ios-blue text-white' : 'bg-ios-bg text-ios-blue'
                  }`}
                >
                  {playingItemId === item.id && !isPlayingAll ? (
                    <Square className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>
              {isRevealed && (
                <div className="pl-[42px]">
                  {/* Per-word tap-to-replay */}
                  <p className="text-sm leading-7">
                    {wordsOf(item.text).map((word, wi) => (
                      <button
                        key={`${item.id}-w${wi}`}
                        onClick={() => replayWord(item, word)}
                        className="inline-block mr-1 px-0.5 rounded hover:bg-ios-blue/10 active:bg-ios-blue/20 font-medium"
                        title="Tap to replay this word"
                      >
                        {word}
                      </button>
                    ))}
                  </p>
                  {item.translation && <p className="text-xs text-ios-gray italic">{item.translation}</p>}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => (isPlayingAll ? stopAll() : playAll())}
          className="w-full py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          {isPlayingAll ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{isPlayingAll ? 'Stop' : activeDialogue ? 'Play dialogue' : 'Play all'}</span>
        </button>

        <button
          onClick={toggleReveal}
          className="w-full py-2.5 bg-ios-bg text-ios-blue rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
        >
          {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span>{isRevealed ? 'Hide transcript' : 'Reveal transcript'}</span>
        </button>
        {isRevealed && <p className="text-[11px] text-ios-gray text-center">Tap any word to hear it again.</p>}
      </div>

      {/* Dictation card: type what you heard */}
      {dictationItem && (
        <div className="bg-card rounded-2xl ios-shadow p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm">Dictation</h3>
            <span className="text-xs text-ios-gray">
              {(dictationIndex % items.length) + 1} / {items.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => playItem(dictationItem)}
              className="px-4 py-2 bg-ios-bg text-ios-blue rounded-xl font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Play it</span>
            </button>
            <p className="text-xs text-ios-gray">then type exactly what you heard</p>
          </div>
          <label className="block">
            <span className="sr-only">Type what you heard</span>
            <textarea
              value={dictationInput}
              onChange={(e) => setDictationInput(e.target.value)}
              rows={2}
              placeholder="Escreve aqui…"
              className="w-full bg-ios-bg rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ios-blue/40"
            />
          </label>

          {dictationResult ? (
            <div className="space-y-2">
              <p className="text-sm font-bold">
                {dictationResult.matched} / {dictationResult.total} words
                {dictationResult.score >= 0.999 ? ' — perfect!' : dictationResult.score >= 0.6 ? ' — close' : ' — listen once more'}
              </p>
              <div className="text-sm leading-6">
                <p className="text-[11px] text-ios-gray uppercase font-bold mb-0.5">You typed</p>
                <p>
                  {dictationResult.typed.map((token, ti) => (
                    <span
                      key={`t${ti}`}
                      className={`mr-1 ${token.hit ? 'text-[#34C759] font-medium' : 'text-[#FF3B30] line-through'}`}
                    >
                      {token.token}
                    </span>
                  ))}
                </p>
                <p className="text-[11px] text-ios-gray uppercase font-bold mt-2 mb-0.5">It was</p>
                <p>
                  {dictationResult.expected.map((token, ei) => (
                    <span key={`e${ei}`} className={`mr-1 ${token.hit ? '' : 'text-[#FF9500] font-bold'}`}>
                      {token.token}
                    </span>
                  ))}
                </p>
              </div>
              <button
                onClick={nextDictation}
                className="w-full py-2.5 bg-ios-bg text-ios-blue rounded-2xl font-semibold text-sm active:scale-95 transition-transform flex items-center justify-center gap-1"
              >
                <span>Next line</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={checkDictation}
              disabled={dictationInput.trim() === ''}
              className="w-full py-2.5 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
            >
              Check
            </button>
          )}
        </div>
      )}

      {/* "What did you hear?" comprehension checks */}
      {checks.length > 0 && (
        <div className="bg-card rounded-2xl ios-shadow p-4 space-y-4">
          <h3 className="font-bold text-sm">What did you hear?</h3>
          {checks.map((check, ci) => {
            const answered = checkAnswers[check.id];
            const targetItem = items.find((item) => item.id === check.targetItemId);
            return (
              <div key={check.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => targetItem && playItem(targetItem)}
                    className="px-3 py-1.5 bg-ios-bg text-ios-blue rounded-xl font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Play {ci + 1}</span>
                  </button>
                  <p className="text-xs text-ios-gray">listen, then pick what you heard</p>
                </div>
                <div className="space-y-1.5">
                  {check.choices.map((choice, choiceIndex) => {
                    const isPicked = answered === choiceIndex;
                    const showState = answered !== undefined && (isPicked || choice.correct);
                    return (
                      <button
                        key={`${check.id}-c${choiceIndex}`}
                        onClick={() => answerCheck(check, choiceIndex)}
                        disabled={answered !== undefined}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center justify-between gap-2 transition-colors ${
                          showState
                            ? choice.correct
                              ? 'bg-[#34C759]/15 text-[#1d7a35] font-semibold'
                              : 'bg-[#FF3B30]/10 text-[#FF3B30]'
                            : 'bg-ios-bg'
                        } ${answered === undefined ? 'active:scale-[0.98]' : ''}`}
                      >
                        <span>{choice.text}</span>
                        {showState &&
                          (choice.correct ? (
                            <Check className="w-4 h-4 flex-shrink-0" />
                          ) : (
                            <X className="w-4 h-4 flex-shrink-0" />
                          ))}
                      </button>
                    );
                  })}
                </div>
                {answered !== undefined && (
                  <p className="text-xs text-ios-gray">
                    {check.choices[answered]?.correct
                      ? 'Good ear. Try it again at a faster speed.'
                      : 'Not quite — replay it, or slow it down and listen for the difference.'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ListeningView;
