// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/simulator/useSimulator.ts
// Description: State machine hook for the Situation Simulator (CONTENT-ARCHITECTURE §3).
//   Typed useReducer per the tutor-slice convention (useTutorSession). Two variants chosen
//   by data reality: 'scripted' walks the situation's authored roleplay graph (entry_node +
//   options[].next); 'free' builds a scenario prompt from the situation's actual data and
//   runs it over geminiService.startChat (the tutor edge fn — online only). Difficulty is
//   presentation + behavior: L1–L2 guided (option buttons, translations, slow TTS), L3+
//   free text/voice loosely matched against scripted options (scenario.ts similarity) or
//   raw AI conversation. On completion the hook persists to user_situation_progress via
//   ./progress with COACH SIGNAL counters (stalls = long response latency, hint reveals).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { contentRepository } from '../../../content/repository';
import type { RoleplayDifficulty, RoleplayNode, Situation } from '../../../content/schema';
import { ChatSession, geminiService } from '../../../services/geminiService';
import { TUTORS } from '../../../data/tutors';
import { errorMessage, logger } from '../../../lib/logger';
import {
  buildFreeRoleplayPrompt,
  findNode,
  matchOption,
  parseFreeReply,
  simulatorConfig,
} from './scenario';
import { saveSimulatorCompletion } from './progress';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type SimulatorVariant = 'scripted' | 'free';

export interface SimulatorBubble {
  id: number;
  /** npc = the roleplay counterpart; user = the learner; coach = out-of-scene feedback/nudges. */
  role: 'npc' | 'user' | 'coach';
  text: string;
  /** English hint (guided difficulties: scripted npc_translation / free "EN:" lines). */
  translation?: string;
}

export type SimulatorPhase = 'loading' | 'error' | 'ready' | 'playing' | 'done';
type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

interface SimulatorState {
  phase: SimulatorPhase;
  situation: Situation | null;
  variant: SimulatorVariant;
  difficulty: RoleplayDifficulty;
  bubbles: SimulatorBubble[];
  /** Current scripted node id (null before start / in free variant). */
  currentNodeId: string | null;
  /** AI reply (or TTS-triggering scripted advance) in flight. */
  busy: boolean;
  hintOpen: boolean;
  hintsUsed: number;
  stalls: number;
  /** Consecutive unmatched free-text replies at the current scripted node. */
  misses: number;
  /** Learner turns taken this conversation. */
  turns: number;
  saveState: SaveState;
  errorText: string | null;
}

type SimulatorAction =
  | { type: 'LOADED'; situation: Situation; variant: SimulatorVariant; difficulty: RoleplayDifficulty }
  | { type: 'LOAD_FAILED'; errorText: string }
  | { type: 'SELECT_DIFFICULTY'; difficulty: RoleplayDifficulty }
  | { type: 'START'; difficulty: RoleplayDifficulty }
  | { type: 'ABORT_TO_READY' }
  | { type: 'SET_BUSY'; busy: boolean }
  | { type: 'ADD_BUBBLE'; bubble: SimulatorBubble }
  | { type: 'SET_NODE'; nodeId: string | null }
  | { type: 'USER_TURN'; bubble: SimulatorBubble; stalled: boolean }
  | { type: 'MISS' }
  | { type: 'TOGGLE_HINT' }
  | { type: 'COMPLETE' }
  | { type: 'SET_SAVE_STATE'; saveState: SaveState };

const initialState: SimulatorState = {
  phase: 'loading',
  situation: null,
  variant: 'free',
  difficulty: 1,
  bubbles: [],
  currentNodeId: null,
  busy: false,
  hintOpen: false,
  hintsUsed: 0,
  stalls: 0,
  misses: 0,
  turns: 0,
  saveState: 'idle',
  errorText: null,
};

const simulatorReducer = (state: SimulatorState, action: SimulatorAction): SimulatorState => {
  switch (action.type) {
    case 'LOADED':
      return {
        ...initialState,
        phase: 'ready',
        situation: action.situation,
        variant: action.variant,
        difficulty: action.difficulty,
      };
    case 'LOAD_FAILED':
      return { ...initialState, phase: 'error', errorText: action.errorText };
    case 'SELECT_DIFFICULTY':
      return { ...state, difficulty: action.difficulty };
    case 'START':
      // A pill tap mid-conversation restarts at the new level (v3 mockup behavior).
      return {
        ...state,
        phase: 'playing',
        difficulty: action.difficulty,
        bubbles: [],
        currentNodeId: null,
        busy: false,
        hintOpen: false,
        hintsUsed: 0,
        stalls: 0,
        misses: 0,
        turns: 0,
        saveState: 'idle',
      };
    case 'ABORT_TO_READY':
      return { ...state, phase: 'ready', busy: false };
    case 'SET_BUSY':
      return { ...state, busy: action.busy };
    case 'ADD_BUBBLE':
      return { ...state, bubbles: [...state.bubbles, action.bubble] };
    case 'SET_NODE':
      return { ...state, currentNodeId: action.nodeId };
    case 'USER_TURN':
      return {
        ...state,
        bubbles: [...state.bubbles, action.bubble],
        turns: state.turns + 1,
        // COACH SIGNAL: stalls — this turn's response latency exceeded stallLatencyMs.
        stalls: state.stalls + (action.stalled ? 1 : 0),
        misses: 0,
        hintOpen: false,
      };
    case 'MISS':
      return { ...state, misses: state.misses + 1 };
    case 'TOGGLE_HINT':
      // COACH SIGNAL: hint usage — reveals are counted once per open, persisted in score.hints.
      return {
        ...state,
        hintOpen: !state.hintOpen,
        hintsUsed: state.hintsUsed + (state.hintOpen ? 0 : 1),
      };
    case 'COMPLETE':
      return { ...state, phase: 'done', busy: false, hintOpen: false };
    case 'SET_SAVE_STATE':
      return { ...state, saveState: action.saveState };
    default:
      return state;
  }
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useSimulator = (situationId: string | null) => {
  const [state, dispatch] = useReducer(simulatorReducer, initialState);

  // Mirror of the latest state for event handlers (synced post-render).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const sessionRef = useRef<ChatSession | null>(null);
  const bubbleIdRef = useRef(0);
  /** When the last NPC line appeared — the stall-latency reference point. */
  const npcShownAtRef = useRef(0);

  const nextBubbleId = useCallback((): number => {
    bubbleIdRef.current += 1;
    return bubbleIdRef.current;
  }, []);

  // ── Content load (repository resolution chain; §10) ──
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let situation: Situation | null = null;
        if (situationId) {
          situation = await contentRepository.getSituation(situationId);
          if (!situation) {
            logger.error('SIM_SITUATION_NOT_FOUND', `simulator opened with unknown situation id "${situationId}"`, {
              category: 'DATA_PROCESSING',
              details: { situationId },
            });
          }
        } else {
          // Direct tile entry: the engine picks its own default — prefer a situation
          // that carries an authored roleplay, else the first available one.
          const situations = await contentRepository.listSituations();
          situation = situations.find((s) => s.roleplay) ?? situations[0] ?? null;
        }
        if (cancelled) return;
        if (!situation) {
          dispatch({ type: 'LOAD_FAILED', errorText: 'No situations are available to simulate yet. Check back after your content refreshes.' });
          return;
        }
        const variant: SimulatorVariant = situation.roleplay ? 'scripted' : 'free';
        const difficulty: RoleplayDifficulty = situation.roleplay?.difficulty ?? 1;
        dispatch({ type: 'LOADED', situation, variant, difficulty });
      } catch (error) {
        logger.error('SIM_LOAD_FAILED', 'simulator could not load content', {
          category: 'DATA_PROCESSING',
          error,
          details: { situationId },
        });
        if (!cancelled) {
          dispatch({ type: 'LOAD_FAILED', errorText: 'Could not load practice content. Please try again.' });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [situationId]);

  // Stop any in-flight TTS when the mode unmounts (back to the hub).
  useEffect(() => () => geminiService.stopSpeech(), []);

  // ── Speech out (NPC lines; slower TTS at guided difficulties) ──
  const speak = useCallback((text: string, difficulty: RoleplayDifficulty) => {
    const rate = simulatorConfig.ttsRateByDifficulty[difficulty];
    // Voice is an enhancement here — failures (voice limit, network blips) keep the
    // text conversation fully usable, so they log as WARN without a blocking surface.
    geminiService.playSpeech(text, TUTORS[0], rate).catch((error) => {
      logger.warn('SIM_TTS_FAILED', 'simulator TTS playback failed — line stays readable', {
        category: 'AI_DECISION',
        error,
      });
    });
  }, []);

  const pushCoach = useCallback(
    (text: string) => {
      dispatch({ type: 'ADD_BUBBLE', bubble: { id: nextBubbleId(), role: 'coach', text } });
    },
    [nextBubbleId],
  );

  const pushNpc = useCallback(
    (text: string, translation: string | undefined, difficulty: RoleplayDifficulty) => {
      dispatch({ type: 'ADD_BUBBLE', bubble: { id: nextBubbleId(), role: 'npc', text, translation } });
      npcShownAtRef.current = Date.now();
      speak(text, difficulty);
    },
    [nextBubbleId, speak],
  );

  // ── Scripted branching: enter a node, speak its NPC line, detect terminal nodes ──
  const enterNode = useCallback(
    (node: RoleplayNode, difficulty: RoleplayDifficulty) => {
      dispatch({ type: 'SET_NODE', nodeId: node.id });
      pushNpc(node.npc_text, node.npc_translation, difficulty);
      if (node.options.length === 0) {
        // Terminal NPC line (schema: empty options ends the branch) — scene handled.
        dispatch({ type: 'COMPLETE' });
      }
    },
    [pushNpc],
  );

  // ── Start / restart a conversation at a difficulty (pill tap or Start CTA) ──
  const start = useCallback(
    async (difficulty: RoleplayDifficulty) => {
      const current = stateRef.current;
      const situation = current.situation;
      if (!situation || current.busy) return;
      geminiService.stopSpeech();
      dispatch({ type: 'START', difficulty });

      // Variant 1 — scripted roleplay: walk the authored branching graph.
      if (situation.roleplay) {
        const roleplay = situation.roleplay;
        const entry = findNode(roleplay.nodes, roleplay.entry_node) ?? roleplay.nodes[0] ?? null;
        if (!entry) {
          // Validator-guaranteed non-empty, but content is data — never trust it blindly.
          logger.error('SIM_ROLEPLAY_EMPTY', `roleplay for situation "${situation.id}" has no usable entry node`, {
            category: 'DATA_PROCESSING',
            details: { situationId: situation.id, entryNode: roleplay.entry_node },
          });
          dispatch({ type: 'LOAD_FAILED', errorText: 'This roleplay script is incomplete. Try another situation.' });
          return;
        }
        enterNode(entry, difficulty);
        return;
      }

      // Variant 2 — free AI roleplay over the tutor edge fn (online only).
      dispatch({ type: 'SET_BUSY', busy: true });
      try {
        const session = await geminiService.startChat(TUTORS[0]);
        sessionRef.current = session;
        const reply = await session.sendMessage({ message: buildFreeRoleplayPrompt(situation, difficulty) });
        const parsed = parseFreeReply(reply.text);
        if (parsed.text) pushNpc(parsed.text, parsed.translation, difficulty);
        if (parsed.done) dispatch({ type: 'COMPLETE' });
      } catch (error) {
        // geminiService already logged with the server requestId and produced a
        // user-ready message (code + Ref) — surface it calmly and return to ready.
        logger.error('SIM_START_FAILED', 'free AI roleplay could not start', {
          category: 'AI_DECISION',
          error,
          details: { situationId: situation.id, difficulty },
        });
        pushCoach(errorMessage(error) ?? 'The conversation service is unavailable right now. Please try again.');
        dispatch({ type: 'ABORT_TO_READY' });
      } finally {
        dispatch({ type: 'SET_BUSY', busy: false });
      }
    },
    [enterNode, pushCoach, pushNpc],
  );

  /** Pill tap: pre-start just selects; mid-conversation restarts at the new level. */
  const pickDifficulty = useCallback(
    (difficulty: RoleplayDifficulty) => {
      const current = stateRef.current;
      if (current.phase === 'ready') dispatch({ type: 'SELECT_DIFFICULTY', difficulty });
      else if (current.phase === 'playing' || current.phase === 'done') void start(difficulty);
    },
    [start],
  );

  // ── Scripted: pick an option (button tap, or a loose-matched free reply) ──
  const chooseOption = useCallback(
    (index: number, spokenText?: string) => {
      const current = stateRef.current;
      const roleplay = current.situation?.roleplay;
      if (!roleplay || current.phase !== 'playing' || current.busy) return;
      const node = current.currentNodeId ? findNode(roleplay.nodes, current.currentNodeId) : null;
      const option = node?.options[index];
      if (!node || !option) return;

      // COACH SIGNAL: stalls — long latency answering this node marks a stall turn.
      const stalled = Date.now() - npcShownAtRef.current > simulatorConfig.stallLatencyMs;
      dispatch({
        type: 'USER_TURN',
        bubble: { id: nextBubbleId(), role: 'user', text: spokenText ?? option.text },
        stalled,
      });
      if (option.feedback) pushCoach(option.feedback);

      if (option.next) {
        const nextNode = findNode(roleplay.nodes, option.next);
        if (nextNode) {
          enterNode(nextNode, current.difficulty);
          return;
        }
        logger.error('SIM_BRANCH_BROKEN', `roleplay option points at missing node "${option.next}"`, {
          category: 'DATA_PROCESSING',
          details: { situationId: current.situation?.id, nodeId: node.id, next: option.next },
        });
      }
      // No next (or broken ref) = this branch ends the conversation.
      dispatch({ type: 'COMPLETE' });
    },
    [enterNode, nextBubbleId, pushCoach],
  );

  // ── Free text / voice submission (scripted L3+ loose match, or free AI turn) ──
  const submitText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const current = stateRef.current;
      if (!text || current.phase !== 'playing' || current.busy) return;

      // Scripted L3+: match the learner's own words loosely against the node's options.
      if (current.variant === 'scripted') {
        const roleplay = current.situation?.roleplay;
        const node = roleplay && current.currentNodeId ? findNode(roleplay.nodes, current.currentNodeId) : null;
        if (!node) return;
        const match = matchOption(text, node.options);
        if (match && match.score >= simulatorConfig.matchThreshold) {
          chooseOption(match.index, text);
          return;
        }
        // COACH SIGNAL: repeated unmatched replies nudge toward the hint reveal.
        dispatch({ type: 'MISS' });
        pushCoach(
          current.misses + 1 >= simulatorConfig.missesBeforeHintNudge
            ? 'Not quite — tap "Need a hint?" to see ways you could reply here.'
            : "Hmm, that didn't land in this scene. Try phrasing it another way.",
        );
        return;
      }

      // Free AI roleplay turn.
      const session = sessionRef.current;
      if (!session) return;
      const stalled = Date.now() - npcShownAtRef.current > simulatorConfig.stallLatencyMs;
      dispatch({ type: 'USER_TURN', bubble: { id: nextBubbleId(), role: 'user', text }, stalled });
      dispatch({ type: 'SET_BUSY', busy: true });
      try {
        const reply = await session.sendMessage({ message: text });
        const parsed = parseFreeReply(reply.text);
        if (parsed.text) pushNpc(parsed.text, parsed.translation, stateRef.current.difficulty);
        if (parsed.done) dispatch({ type: 'COMPLETE' });
      } catch (error) {
        logger.error('SIM_TURN_FAILED', 'free AI roleplay turn failed', {
          category: 'AI_DECISION',
          error,
          details: { situationId: current.situation?.id, difficulty: current.difficulty },
        });
        pushCoach(errorMessage(error) ?? 'That reply did not reach the conversation service. Please try again.');
      } finally {
        dispatch({ type: 'SET_BUSY', busy: false });
      }
    },
    [chooseOption, nextBubbleId, pushCoach, pushNpc],
  );

  /** L3+ "Need a hint?" reveal toggle (reveals count once per open — a Coach signal). */
  const toggleHint = useCallback(() => {
    dispatch({ type: 'TOGGLE_HINT' });
  }, []);

  /** Free variant: the learner ends the scene themselves. */
  const endConversation = useCallback(() => {
    if (stateRef.current.phase !== 'playing') return;
    geminiService.stopSpeech();
    dispatch({ type: 'COMPLETE' });
  }, []);

  /** Replay an NPC bubble's audio (speaker button). */
  const replay = useCallback(
    (text: string) => {
      speak(text, stateRef.current.difficulty);
    },
    [speak],
  );

  // ── Completion persistence (only conversations with at least one learner turn) ──
  useEffect(() => {
    if (state.phase !== 'done' || state.saveState !== 'idle') return;
    const situation = state.situation;
    if (!situation || state.turns === 0) return;
    dispatch({ type: 'SET_SAVE_STATE', saveState: 'saving' });
    void (async () => {
      const ok = await saveSimulatorCompletion({
        situationId: situation.id,
        status: 'completed',
        score: {
          difficulty: state.difficulty,
          turns: state.turns,
          variant: state.variant,
          hints: state.hintsUsed,
          stalls: state.stalls,
        },
      });
      dispatch({ type: 'SET_SAVE_STATE', saveState: ok ? 'saved' : 'failed' });
    })();
  }, [state.phase, state.saveState, state.situation, state.turns, state.difficulty, state.variant, state.hintsUsed, state.stalls]);

  // Current scripted node (drives the option buttons / hint reveal in the view).
  const roleplay = state.situation?.roleplay;
  const currentNode = roleplay && state.currentNodeId ? findNode(roleplay.nodes, state.currentNodeId) : null;

  return {
    state,
    currentNode,
    start,
    pickDifficulty,
    chooseOption,
    submitText,
    toggleHint,
    endConversation,
    replay,
  };
};
