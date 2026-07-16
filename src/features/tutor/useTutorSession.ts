// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/tutor/useTutorSession.ts
// Description: Tutor-slice store hook extracted from App.tsx. Owns the AI practice session
//   state machine (open/help-mode/session/history/loading/speaking index) via a typed
//   useReducer (ENGINEERING-STANDARDS §2), the free-chat tab state (messages, input, typing),
//   speech recognition wiring through the platform adapter (with daily voice-limit gating),
//   chunked TTS playback, and the inactivity re-prompt (config.tutor.inactivityPromptMs).
//   resetForLogout is invoked by the
//   auth slice on logout.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useReducer, useRef, useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { platform } from '../../platform';
import { ChatSession, geminiService } from '../../services/geminiService';
import { TUTORS } from '../../data/tutors';
import { ChatMessage, Lesson, UserProfile } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { errorMessage, logger, userMessage } from '../../lib/logger';
import { config } from '../../config';
import { validateText } from '../../lib/validation';

type HistoryMessage = { role: 'user' | 'model', text: string };

interface TutorSessionState {
  isOpen: boolean;                       // AI practice modal visibility
  isHelpMode: boolean;                   // app-guide mode inside the practice modal
  session: ChatSession | null;           // active gemini chat session (shared with free chat)
  history: HistoryMessage[];             // practice-modal transcript
  isAiLoading: boolean;                  // tutor reply in flight
  currentlySpeakingIndex: number | null; // message index being spoken via TTS
}

type TutorSessionAction =
  | { type: 'OPEN_MODAL' }
  | { type: 'START_PRACTICE'; isHelpMode: boolean }
  | { type: 'SET_SESSION'; session: ChatSession | null }
  | { type: 'SET_HISTORY'; history: HistoryMessage[] }
  | { type: 'APPEND_HISTORY'; message: HistoryMessage }
  | { type: 'SET_AI_LOADING'; isAiLoading: boolean }
  | { type: 'SET_HELP_MODE'; isHelpMode: boolean }
  | { type: 'SET_SPEAKING_INDEX'; index: number | null }
  | { type: 'CLOSE_PRACTICE' }
  | { type: 'RESET_FOR_LOGOUT' };

const initialSessionState: TutorSessionState = {
  isOpen: false,
  isHelpMode: false,
  session: null,
  history: [],
  isAiLoading: false,
  currentlySpeakingIndex: null,
};

const tutorSessionReducer = (state: TutorSessionState, action: TutorSessionAction): TutorSessionState => {
  switch (action.type) {
    case 'OPEN_MODAL':
      return { ...state, isOpen: true };
    case 'START_PRACTICE':
      return { ...state, isOpen: true, history: [], isAiLoading: true, isHelpMode: action.isHelpMode };
    case 'SET_SESSION':
      return { ...state, session: action.session };
    case 'SET_HISTORY':
      return { ...state, history: action.history };
    case 'APPEND_HISTORY':
      return { ...state, history: [...state.history, action.message] };
    case 'SET_AI_LOADING':
      return { ...state, isAiLoading: action.isAiLoading };
    case 'SET_HELP_MODE':
      return { ...state, isHelpMode: action.isHelpMode };
    case 'SET_SPEAKING_INDEX':
      return { ...state, currentlySpeakingIndex: action.index };
    case 'CLOSE_PRACTICE':
      // Mirrors the original closeAIPractice state resets.
      return { ...state, isOpen: false, currentlySpeakingIndex: null, isHelpMode: false, session: null, history: [] };
    case 'RESET_FOR_LOGOUT':
      // Mirrors the original handleLogout resets (help mode/speaking index untouched).
      return { ...state, isOpen: false, session: null, history: [] };
    default:
      return state;
  }
};

interface TutorSessionDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
  isSoundEnabled: boolean;
  playbackSpeed: number;
  globalVoiceLimit: number;
  selectedMonth: number;
  setSelectedLesson: (lesson: Lesson | null) => void;
}

export const useTutorSession = ({
  supabase,
  user,
  profile,
  setProfile,
  showToast,
  handleSupabaseError,
  isSoundEnabled,
  playbackSpeed,
  globalVoiceLimit,
  selectedMonth,
  setSelectedLesson
}: TutorSessionDeps) => {
  const [sessionState, dispatch] = useReducer(tutorSessionReducer, initialSessionState);
  const { isOpen: isAIPracticeOpen, isHelpMode, session: chatSession, history: chatHistory, isAiLoading, currentlySpeakingIndex } = sessionState;

  // Free-chat tab state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Practice-modal input draft + speech recognition
  const [aiMessage, setAiMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const isAIPracticeOpenRef = useRef(isAIPracticeOpen);
  useEffect(() => {
    isAIPracticeOpenRef.current = isAIPracticeOpen;
  }, [isAIPracticeOpen]);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const initChat = async () => {
      logger.debug('chat_init', 'Initializing chat', { category: 'AI_DECISION' });
      try {
        const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
        const session = await geminiService.startChat(tutor);
        dispatch({ type: 'SET_SESSION', session });
        // Don't set initial message here anymore, let the UI handle the empty state
        logger.debug('chat_init', 'Chat initialized', { category: 'AI_DECISION' });
      } catch (err) {
        logger.error('chat_init_failed', 'Chat initialization failed', { category: 'AI_DECISION', error: err });
      }
    };
    if (user && profile) {
      initChat();
    }
    // Re-inits the chat when the user changes, when the profile first becomes available
    // (profile?.id: undefined -> id on session restore — without this, a restored session
    // whose profile has no selected_tutor_id would never initialize free-chat), and when the
    // selected tutor changes. profile?.id is stable across streak/xp mutations, so those
    // don't needlessly reset the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed to user/profile-presence/tutor only
  }, [user, profile?.id, profile?.selected_tutor_id]);

  // Wire the platform speech adapter's callbacks to this component. Re-registered
  // on every toggle so the handlers always close over fresh profile/session state
  // (the adapter keeps a single recognition instance under the hood).
  const configureSpeechCallbacks = () => {
    platform.speech.onStart(() => {
      setIsRecording(true);
      showToast("Listening...", "success");
    });

    platform.speech.onResult((result) => {
      if (!result.isFinal || !result.transcript) return;
      const finalTranscript = result.transcript;

      if (isAIPracticeOpenRef.current) {
        setAiMessage(prev => prev + (prev ? ' ' : '') + finalTranscript);
      } else {
        setInputText(prev => prev + (prev ? ' ' : '') + finalTranscript);
      }

      // Increment voice usage
      if (profile && supabase) {
        const today = new Date().toISOString().split('T')[0];
        const currentUsage = profile.last_voice_usage_date === today ? (profile.voice_usage_today || 0) : 0;

        const updatedProfile = {
          ...profile,
          voice_usage_today: currentUsage + 1,
          last_voice_usage_date: today
        };

        setProfile(updatedProfile);
        supabase.from('profiles').update({
          voice_usage_today: currentUsage + 1,
          last_voice_usage_date: today
        }).eq('id', profile.id).then(({ error }) => {
          if (error) handleSupabaseError(error, 'updateVoiceUsage', 'profiles');
        }, (err) => handleSupabaseError(err, 'updateVoiceUsage', 'profiles'));
      }
    });

    platform.speech.onNoMatch(() => {
      showToast("Could not understand. Try again.", "error");
    });

    platform.speech.onError((err) => {
      logger.warn('speech_recognition_error', 'tutor speech recognition reported an error', {
        category: 'AI_DECISION',
        details: { code: err.code, detail: err.detail },
      });
      if (err.code === 'permission-denied') {
        showToast("Microphone access denied. Please check your browser settings.", "error");
      } else if (err.code === 'no-speech') {
        showToast("No speech detected. Try again.", "error");
      } else {
        showToast(`Microphone error: ${err.detail || err.code}`, "error");
      }
      setIsRecording(false);
    });

    platform.speech.onEnd(() => {
      setIsRecording(false);
    });
  };

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!isAIPracticeOpenRef.current) return;

    inactivityTimerRef.current = setTimeout(async () => {
      if (isAIPracticeOpenRef.current && !isAiLoading && chatSession && chatHistory.length > 0) {
        const lastMsg = chatHistory[chatHistory.length - 1];
        if (lastMsg.role === 'model') {
          try {
            const response = await chatSession.sendMessage({
              message: "(The user has been silent for a while. Prompt them to continue the lesson or ask if they have questions in a friendly, encouraging way.)"
            });
            const newMsg = { role: 'model' as const, text: response.text };
            dispatch({ type: 'APPEND_HISTORY', message: newMsg });
            if (isSoundEnabled) {
              playMessageInChunks(response.text, chatHistory.length);
            }
          } catch (err) {
            // No user surface: the inactivity nudge is a background nicety, not a user-initiated action.
            logger.error('inactivity_prompt_failed', 'Inactivity prompt error', { category: 'AI_DECISION', error: err });
          }
        }
      }
    }, config.tutor.inactivityPromptMs); // silence window before the friendly re-prompt
  };

  const toggleRecording = () => {
    // Check voice limit
    const today = new Date().toISOString().split('T')[0];
    const usage = profile?.last_voice_usage_date === today ? (profile?.voice_usage_today || 0) : 0;
    const limit = profile?.voice_limit ?? globalVoiceLimit;

    if (usage >= limit && profile?.subscription_tier !== 'unlimited' && profile?.role !== 'admin') {
      // Free launch: limit is enforced but there is no upsell surface (featureFlags.payments).
      // When payments re-enter, this is the trigger point to reopen the UpgradeModal.
      showToast(`Daily voice limit (${limit}) reached. It resets tomorrow — text chat is always available.`, "error");
      return;
    }

    if (!platform.speech.isAvailable()) {
      showToast("Speech recognition not supported in this browser.", "error");
      return;
    }

    configureSpeechCallbacks();

    if (isRecording) {
      platform.speech.stop();
    } else {
      try {
        // The adapter treats start()-while-listening as a no-op that re-fires
        // onStart, so the old "already started" special case is handled inside it.
        platform.speech.start({ language: 'pt-PT', continuous: true, interimResults: true });
        setIsRecording(true);
      } catch (err) {
        setIsRecording(false);
        const event = logger.error('speech_start_failed', 'Speech recognition failed to start', { category: 'SYSTEM_HEALTH', error: err });
        showToast(
          userMessage('MIC_START_FAILED', err instanceof Error ? err.message : 'Could not start the microphone.', event.request_id),
          'error'
        );
      }
    }
  };

  const playMessageInChunks = async (text: string, index: number) => {
    const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
    dispatch({ type: 'SET_SPEAKING_INDEX', index });

    // Split by sentences or chunks for better pacing
    const chunks = text.split(/(?<=[.!?])\s+/);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();
      if (!chunk) continue;

      // Check if we should still be playing
      if (!isAIPracticeOpenRef.current) break;

      try {
        await new Promise<void>((resolve, reject) => {
          geminiService.playSpeech(chunk, tutor, playbackSpeed, () => {
            // Add a small pause between sentences to let it sink in
            setTimeout(resolve, 600);
          }).catch(reject);
        });
      } catch (err) {
        // Surface voice-limit and service errors instead of hanging the chunk loop
        const event = logger.error('tts_chunk_failed', 'Chunked TTS playback failed', { category: 'AI_DECISION', error: err });
        showToast(userMessage('TTS_FAILED', errorMessage(err) || 'Audio playback failed', event.request_id), 'error');
        break;
      }
    }

    dispatch({ type: 'SET_SPEAKING_INDEX', index: null });
    resetInactivityTimer();
  };

  const openPracticeModal = () => {
    dispatch({ type: 'OPEN_MODAL' });
  };

  const closeAIPractice = () => {
    geminiService.stopSpeech();
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    dispatch({ type: 'CLOSE_PRACTICE' });
  };

  const startAIPractice = async (lesson: Lesson, isHelp: boolean = false) => {
    setSelectedLesson(lesson);
    dispatch({ type: 'START_PRACTICE', isHelpMode: isHelp });

    // Add a small delay to make the transition feel less rushed
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      const chat = await geminiService.startChat(tutor, isHelp);
      dispatch({ type: 'SET_SESSION', session: chat });

      if (isHelp) {
        dispatch({ type: 'SET_HISTORY', history: [{ role: 'model', text: "Olá! I'm your FalaMadeira App Guide. How can I help you today? I can explain how to use the curriculum, practice with AI tutors, or manage your settings." }] });
      } else {
        const context = `Context: Month ${selectedMonth} of the learning plan.
        Current Lesson: Day ${lesson.day} - ${lesson.title}.
        Description: ${lesson.description}
        Focus Patterns: ${lesson.patterns.join(', ')}.
        Vocabulary: ${lesson.vocabulary.map(v => v.word).join(', ')}.
        Lesson Goals: ${lesson.goals?.join(', ') || ''}
        Cultural/Grammar Context: ${lesson.explanation || ''}

        INSTRUCTION: You are the tutor.
        1. Start the lesson by greeting the user warmly in Portuguese and English.
        2. Take a moment to explain exactly what we are going to do today. Be clear and encouraging.
        3. Do not rush. Introduce the goals of today's lesson one by one.
        4. Start with the first pattern or vocabulary word only after the introduction.
        5. Use clear Markdown formatting with double line breaks between sections.
        6. IMPORTANT: You are the guide. Lead the user through the lesson step-by-step.
        7. Do not ask "What would you like to talk about?". Instead, say "Let's start with [Pattern/Word]. Can you repeat after me?" or similar.
        8. For each pattern/word, provide the Portuguese, a phonetic pronunciation guide, and the English translation.`;

        const response = await chat.sendMessage({ message: context });
        dispatch({ type: 'SET_HISTORY', history: [{ role: 'model', text: response.text }] });

        if (isSoundEnabled) {
          playMessageInChunks(response.text, 0);
        }
      }
      resetInactivityTimer();
    } catch (err) {
      const event = logger.error('ai_practice_start_failed', 'Start AI Practice error', { category: 'AI_DECISION', error: err });
      showToast(userMessage('AI_PRACTICE_START_FAILED', 'Failed to start AI tutor', event.request_id), 'error');
    } finally {
      dispatch({ type: 'SET_AI_LOADING', isAiLoading: false });
    }
  };

  const handleAIPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAiLoading || !chatSession) return;
    // Validate + cap the practice-modal input before sending to the edge function (§4).
    const check = validateText(aiMessage, 'Message', config.limits.tutorMessageMax);
    if (!check.ok) { showToast(check.reason, 'error'); return; }

    const userMsg = check.value;
    setAiMessage('');
    dispatch({ type: 'APPEND_HISTORY', message: { role: 'user', text: userMsg } });
    dispatch({ type: 'SET_AI_LOADING', isAiLoading: true });

    try {
      const response = await chatSession.sendMessage({
        message: userMsg + "\n\n(Remember to use clear Markdown formatting with double line breaks between sections and separate Portuguese/English clearly.)"
      });
      const newIndex = chatHistory.length + 1;
      dispatch({ type: 'APPEND_HISTORY', message: { role: 'model', text: response.text } });

      if (isSoundEnabled) {
        playMessageInChunks(response.text, newIndex);
      } else {
        resetInactivityTimer();
      }
    } catch (err) {
      const event = logger.error('ai_practice_failed', 'AI Practice error', { category: 'AI_DECISION', error: err });
      showToast(userMessage('AI_PRACTICE_FAILED', 'Failed to connect to AI tutor', event.request_id), 'error');
    } finally {
      dispatch({ type: 'SET_AI_LOADING', isAiLoading: false });
    }
  };

  // Help-mode toggle inside the practice modal header (announces help mode on entry).
  const toggleHelpMode = () => {
    dispatch({ type: 'SET_HELP_MODE', isHelpMode: !isHelpMode });
    if (!isHelpMode) {
      dispatch({ type: 'APPEND_HISTORY', message: { role: 'model', text: "Olá! I'm in Help Mode now. How can I help you navigate FalaMadeira? I can explain the Dashboard, Curriculum, or how to use the AI Tutor." } });
    }
  };

  /**
   * EN-20: open the chat directly in App-Guide (help) mode from a persistent nav entry — no lesson.
   * Reuses the same practice-modal surface, `isHelpMode`, and the EN-18 "Take me there" chips as the
   * in-session help toggle; it just skips the lesson-context first message. This is the always-
   * available Help entry point (the in-modal toggle stays for switching mid-session).
   */
  const openHelp = async () => {
    dispatch({ type: 'START_PRACTICE', isHelpMode: true });
    try {
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      const chat = await geminiService.startChat(tutor, true);
      dispatch({ type: 'SET_SESSION', session: chat });
      dispatch({ type: 'SET_HISTORY', history: [{ role: 'model', text: "Olá! I'm your FalaMadeira App Guide. Ask me how to do anything in the app — for example \"how do I change my level?\" or \"where are downloads?\" — and I'll point you to the right place." }] });
      resetInactivityTimer();
    } catch (err) {
      const event = logger.error('help_open_failed', 'Open help chat error', { category: 'AI_DECISION', error: err });
      showToast(userMessage('HELP_OPEN_FAILED', 'Could not open Help right now. Please try again.', event.request_id), 'error');
    } finally {
      dispatch({ type: 'SET_AI_LOADING', isAiLoading: false });
    }
  };

  const handleSendMessage = async () => {
    if (!chatSession) return;
    // Validate + cap the free-chat input before sending to the edge function (§4).
    const check = validateText(inputText, 'Message', config.limits.tutorMessageMax);
    if (!check.ok) { showToast(check.reason, 'error'); return; }

    const userMsg: ChatMessage = { role: 'user', text: check.value, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const result = await chatSession.sendMessage({ message: check.value });
      const modelMsg: ChatMessage = { role: 'model', text: result.text, timestamp: Date.now() };
      setChatMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      const event = logger.error('chat_send_failed', 'Chat error', { category: 'AI_DECISION', error });
      showToast(
        userMessage('CHAT_SEND_FAILED', errorMessage(error) || 'AI Tutor is temporarily unavailable', event.request_id),
        'error'
      );
    } finally {
      setIsTyping(false);
    }
  };

  // Invoked by the auth slice on logout.
  const resetForLogout = () => {
    dispatch({ type: 'RESET_FOR_LOGOUT' });
    setAiMessage('');
    setChatMessages([]);
  };

  return {
    isAIPracticeOpen,
    isHelpMode,
    chatSession,
    chatHistory,
    isAiLoading,
    currentlySpeakingIndex,
    chatMessages, setChatMessages,
    inputText, setInputText,
    isTyping,
    aiMessage, setAiMessage,
    isRecording,
    openPracticeModal,
    closeAIPractice,
    startAIPractice,
    handleAIPractice,
    handleSendMessage,
    toggleHelpMode,
    openHelp,
    toggleRecording,
    playMessageInChunks,
    resetForLogout,
  };
};
