// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/simulator/SimulatorView.tsx
// Description: Situation Simulator body (CONTENT-ARCHITECTURE §3; v3 mockup "SITUATION
//   SIMULATOR"): difficulty pills L1–L5, a branching roleplay chat, and difficulty-scaled
//   input. Two variants driven by data reality (useSimulator): SCRIPTED when the situation
//   carries an authored roleplay (empty in seed until enrichment) — L1–L2 show option
//   buttons + English hints (guided), L3+ hide options behind a "Need a hint?" reveal and
//   accept free text/voice matched loosely against the options; FREE AI roleplay otherwise —
//   a scenario prompt built from the situation's real data runs over geminiService.startChat
//   (the tutor edge fn, online only). Mic via platform.speech.recognize() when available; NPC
//   lines are spoken via playSpeech (slower at guided difficulties). Renders only the body —
//   the Practice hub owns the back-header (registry ENGINE INTEGRATION CONTRACT). Offline: a
//   calm "online only" state (§10). Completion persists to user_situation_progress. // COACH
//   SIGNAL markers (stalls = long response latency, hint usage) live in useSimulator.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Lightbulb, Mic, RotateCcw, Volume2, WifiOff } from 'lucide-react';
import type { PracticeModeProps } from '../registry';
import { platform, PlatformError } from '../../../platform';
import { errorMessage } from '../../../lib/logger';
import { ROLEPLAY_DIFFICULTIES, type RoleplayDifficulty } from '../../../content/schema';
import { DIFFICULTY_NOTES, simulatorConfig } from './scenario';
import { useSimulator } from './useSimulator';

const RECOGNIZE_LANGUAGE = 'pt-PT';

// Small subscription to the browser's connectivity — the simulator is online-only, so a
// dropped connection swaps the whole surface for the calm §10 "online only" panel.
const useIsOnline = (): boolean => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
};

const friendlyMicError = (err: unknown): string => {
  if (err instanceof PlatformError) {
    switch (err.code) {
      case 'no-speech':
      case 'timeout':
        return "Didn't catch that — get a little closer to the mic and try again.";
      case 'permission-denied':
        return 'Microphone access was denied. Allow it in your browser/OS settings, or just type your reply.';
      case 'unavailable':
        return 'Speech input is not available here — type your reply instead.';
      default:
        return errorMessage(err) || 'Listening failed — try again or type your reply.';
    }
  }
  return errorMessage(err) || 'Listening failed — try again or type your reply.';
};

const SimulatorView = ({ situationId, onExit }: PracticeModeProps) => {
  const online = useIsOnline();
  const { state, currentNode, start, pickDifficulty, chooseOption, submitText, toggleHint, endConversation, replay } =
    useSimulator(situationId);

  const [draft, setDraft] = useState('');
  const [micActive, setMicActive] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const micCancelledRef = useRef(false);

  const sttAvailable = platform.speech.isAvailable();

  useEffect(() => {
    micCancelledRef.current = false;
    return () => {
      micCancelledRef.current = true;
      platform.speech.stop();
    };
  }, []);

  // Keep the newest chat bubble in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.bubbles.length, state.busy]);

  const { phase, difficulty, variant } = state;
  const guided = difficulty <= simulatorConfig.guidedMaxDifficulty;
  const playing = phase === 'playing';

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void submitText(text);
  };

  const listen = async () => {
    if (micActive) {
      platform.speech.stop();
      return;
    }
    setMicNote(null);
    setMicActive(true);
    try {
      const transcript = await platform.speech.recognize({
        language: RECOGNIZE_LANGUAGE,
        timeoutMs: simulatorConfig.dictationTimeoutMs,
      });
      if (micCancelledRef.current) return;
      if (transcript.trim()) void submitText(transcript);
    } catch (err) {
      if (!micCancelledRef.current) setMicNote(friendlyMicError(err));
    } finally {
      if (!micCancelledRef.current) setMicActive(false);
    }
  };

  // ── Online-only guard (§10): calm, never a dead end ──
  if (!online) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-ios-bg flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-ios-gray" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Online only</h3>
          <p className="text-sm text-ios-gray max-w-xs">
            The simulator needs the AI conversation service. Cached roleplays from your downloaded packs still work in
            the Daily Session — the simulator picks up as soon as you are back online.
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

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center h-full space-y-4">
        <p className="text-sm text-ios-gray max-w-xs">{state.errorText}</p>
        <button
          onClick={onExit}
          className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
        >
          Back to Practice
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Scene + difficulty pills (mockup sim-levels / sim-levelnote) */}
      <div className="px-4 pt-3 pb-2 border-b border-ios-bg">
        {state.situation && (
          <p className="text-xs text-ios-gray mb-2">
            {state.situation.title} · {phase === 'ready' ? 'pick your difficulty' : 'roleplay in progress'}
          </p>
        )}
        <div className="flex items-center flex-wrap gap-1.5">
          {ROLEPLAY_DIFFICULTIES.map((level: RoleplayDifficulty) => {
            const active = difficulty === level;
            return (
              <button
                key={level}
                onClick={() => pickDifficulty(level)}
                disabled={state.busy}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors disabled:opacity-40 ${
                  active ? 'bg-ios-blue text-white' : 'bg-ios-bg text-ios-gray'
                }`}
              >
                L{level}
              </button>
            );
          })}
          <span className="text-[11px] text-ios-gray ml-1">{DIFFICULTY_NOTES[difficulty]}</span>
        </div>
      </div>

      {/* Chat transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {phase === 'ready' && (
          <div className="text-center py-10 space-y-4">
            <p className="text-sm text-ios-gray max-w-xs mx-auto">
              {variant === 'scripted'
                ? 'A guided branching roleplay for this situation. Pick a difficulty, then reply by choosing — or, from L3, in your own words.'
                : 'A live roleplay built from this situation. Talk to your counterpart in Portuguese; they answer in character.'}
            </p>
            <button
              onClick={() => void start(difficulty)}
              className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
            >
              Start the conversation
            </button>
          </div>
        )}

        {state.bubbles.map((bubble) => {
          if (bubble.role === 'coach') {
            return (
              <div key={bubble.id} className="text-center">
                <span className="inline-block text-[11px] text-ios-gray bg-ios-bg rounded-full px-3 py-1">
                  {bubble.text}
                </span>
              </div>
            );
          }
          const isNpc = bubble.role === 'npc';
          return (
            <div key={bubble.id} className={`flex ${isNpc ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  isNpc ? 'bg-card ios-shadow' : 'bg-ios-blue text-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="whitespace-pre-line">{bubble.text}</span>
                  {isNpc && (
                    <button
                      onClick={() => replay(bubble.text)}
                      className="text-ios-blue flex-shrink-0 mt-0.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-label="Play line"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {isNpc && guided && bubble.translation && (
                  <p className="text-[11px] text-ios-gray mt-1">{bubble.translation}</p>
                )}
              </div>
            </div>
          );
        })}

        {state.busy && (
          <div className="flex justify-start">
            <div className="bg-card ios-shadow rounded-2xl px-4 py-3">
              <div className="flex space-x-1">
                <span className="w-1.5 h-1.5 bg-ios-gray/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-ios-gray/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-ios-gray/60 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="pt-2">
            <div className="bg-card ios-shadow rounded-2xl p-4 text-center space-y-2">
              <p className="text-sm font-bold text-green-600">✓ Handled.</p>
              <p className="text-xs text-ios-gray">
                {state.turns} exchange{state.turns === 1 ? '' : 's'} at L{difficulty}.
                {difficulty < 5 ? ` Try L${difficulty + 1} next for more realism.` : ' That was the messiest level — nicely done.'}
              </p>
              {state.saveState === 'failed' && (
                <p className="text-[11px] text-ios-gray">Progress will sync when your connection recovers.</p>
              )}
              <div className="flex justify-center gap-2 pt-1">
                <button
                  onClick={() => void start(difficulty)}
                  className="px-4 py-2 bg-ios-bg text-ios-blue rounded-xl font-semibold text-xs inline-flex items-center gap-1 active:scale-95 transition-transform"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Again
                </button>
                <button
                  onClick={onExit}
                  className="px-4 py-2 bg-ios-blue text-white rounded-xl font-semibold text-xs active:scale-95 transition-transform"
                >
                  Back to Practice
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input zone (difficulty-scaled) */}
      {playing && (
        <div className="border-t border-ios-bg px-4 py-3 space-y-2">
          {micNote && <p className="text-[11px] text-ios-gray">{micNote}</p>}

          {/* SCRIPTED · L1–L2 guided: option buttons */}
          {variant === 'scripted' && guided && currentNode && currentNode.options.length > 0 && (
            <div className="space-y-1.5">
              {currentNode.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => chooseOption(index)}
                  disabled={state.busy}
                  className="w-full text-left bg-card ios-shadow rounded-xl px-3 py-2 text-sm active:scale-[0.98] transition-transform disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-ios-blue flex-shrink-0" />
                    <span>{option.text}</span>
                  </span>
                  {option.translation && <span className="block text-[11px] text-ios-gray mt-0.5">{option.translation}</span>}
                </button>
              ))}
              <p className="text-[11px] text-ios-gray">
                In the app you speak your reply — tap {sttAvailable ? '🎙️ or a choice' : 'a choice'} here.
              </p>
            </div>
          )}

          {/* SCRIPTED · L3+ : hidden options behind a hint reveal + free text/voice */}
          {variant === 'scripted' && !guided && currentNode && currentNode.options.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={toggleHint}
                className="text-xs font-semibold text-ios-blue inline-flex items-center gap-1"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                {state.hintOpen ? 'Hide hints' : 'Need a hint?'}
              </button>
              {state.hintOpen && (
                <div className="space-y-1">
                  {currentNode.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => chooseOption(index)}
                      disabled={state.busy}
                      className="w-full text-left bg-ios-bg rounded-xl px-3 py-1.5 text-xs text-ios-gray active:scale-[0.98] transition-transform disabled:opacity-40"
                    >
                      {option.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FREE variant, or scripted L3+ : the composer (type or speak your own reply) */}
          {(variant === 'free' || !guided) && (
            <div className="flex items-end gap-2">
              {sttAvailable && (
                <button
                  onClick={() => void listen()}
                  disabled={state.busy}
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40 ${
                    micActive ? 'bg-red-500 text-white animate-pulse' : 'bg-ios-bg text-ios-blue'
                  }`}
                  aria-label={micActive ? 'Stop listening' : 'Speak your reply'}
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitDraft();
                }}
                disabled={state.busy}
                placeholder="Type your reply in Portuguese…"
                className="flex-1 bg-ios-bg rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue/40 disabled:opacity-40"
              />
              <button
                onClick={submitDraft}
                disabled={state.busy || !draft.trim()}
                className="w-10 h-10 rounded-full bg-ios-blue text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                aria-label="Send reply"
              >
                <CornerDownLeft className="w-5 h-5" />
              </button>
            </div>
          )}

          {variant === 'free' && (
            <button onClick={endConversation} className="text-[11px] text-ios-gray underline">
              End conversation
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SimulatorView;
