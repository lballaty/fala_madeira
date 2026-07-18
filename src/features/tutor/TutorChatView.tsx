// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/tutor/TutorChatView.tsx
// Description: Tutor (free chat) tab extracted verbatim from App.tsx renderChat: tutor header,
//   welcome/empty state with lesson + open-chat CTAs, markdown message list with TTS and
//   save-lesson actions, and the voice-enabled input bar. Owns the auto-scroll ref/effect.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Mic, Play, Send, SquarePen, Sparkles, Volume2 } from 'lucide-react';
import { SafeMarkdown } from '../../components/SafeMarkdown';
import { cn } from '../../lib/utils';
import { TUTORS } from '../../data/tutors';
import { ChatMessage, Lesson, UserProfile } from '../../types';

interface TutorChatViewProps {
  profile: UserProfile | null;
  lessons: Lesson[];
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  inputText: string;
  setInputText: (text: string) => void;
  isTyping: boolean;
  isAIPracticeOpen: boolean;
  aiMessage: string;
  setAiMessage: (text: string) => void;
  isRecording: boolean;
  toggleRecording: () => void;
  handleSendMessage: () => Promise<void>;
  startAIPractice: (lesson: Lesson, isHelp?: boolean) => Promise<void>;
  playSpeech: (text: string) => void;
  saveGeneratedLesson: (lessonData: Partial<Lesson>) => Promise<void>;
}

export const TutorChatView = ({
  profile,
  lessons,
  chatMessages,
  setChatMessages,
  inputText,
  setInputText,
  isTyping,
  isAIPracticeOpen,
  aiMessage,
  setAiMessage,
  isRecording,
  toggleRecording,
  handleSendMessage,
  startAIPractice,
  playSpeech,
  saveGeneratedLesson
}: TutorChatViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && chatMessages.length > 1) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  return (
    <div className="flex flex-col h-full relative">
      <header className="p-4 border-b border-line bg-card/80 ios-blur sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-ios-blue flex items-center justify-center text-white mr-3 overflow-hidden">
            <img
              src={TUTORS.find(t => t.id === profile?.selected_tutor_id)?.avatar || TUTORS[0].avatar}
              alt="AI Tutor"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h2 className="font-bold">AI {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'}</h2>
            <p className="text-xs text-green-500 font-medium">Online • Madeiran Accent</p>
          </div>
        </div>
        {/* TB-22: replaces a DEAD Settings button (no onClick) with a working "New chat" control.
            Shown only once a conversation exists; clearing chatMessages returns to the welcome
            state (Start Lesson / Just Want to Chat) without a full page reload. */}
        {chatMessages.length > 0 && (
          <button
            type="button"
            onClick={() => setChatMessages([])}
            aria-label="New chat"
            className="p-2 text-ios-blue rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center active:opacity-60"
          >
            <SquarePen className="w-5 h-5" />
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {chatMessages.length === 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="p-8 bg-gradient-to-br from-ios-blue/10 to-ios-blue/5 rounded-[32px] border border-ios-blue/10 space-y-6 text-center">
              <div className="w-20 h-20 bg-card rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-4 rotate-3">
                <Sparkles className="w-10 h-10 text-ios-blue" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-ios-blue tracking-tight">Bem-vindo ao seu Tutor!</h3>
                <p className="text-sm text-ios-gray leading-relaxed">
                  I'm your AI language partner, specialized in Madeiran Portuguese.
                  Ready to level up your skills?
                </p>
              </div>

              <div className="grid gap-3 pt-4">
                <button
                  onClick={() => {
                    const nextLesson = lessons.find(l => l.day === (profile?.unlocked_level || 1)) || lessons[0];
                    startAIPractice(nextLesson);
                  }}
                  className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg shadow-ios-blue/20 active:scale-95 transition-all flex items-center justify-center space-x-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Today's Lesson (Day {profile?.unlocked_level || 1})</span>
                </button>

                <button
                  onClick={() => {
                    const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
                    setChatMessages([{
                      role: 'model',
                      text: `Olá! I'm ${tutor.name}. I'm here and ready to chat. We can talk about anything, or I can help you with specific questions about Portuguese. What's on your mind?`,
                      timestamp: Date.now()
                    }]);
                  }}
                  className="w-full py-4 bg-card text-ios-blue border border-ios-blue/20 rounded-2xl font-bold text-sm active:scale-95 transition-all"
                >
                  Just Want to Chat
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 px-2">
              <div className="p-4 bg-ios-bg rounded-2xl space-y-2">
                <div className="w-8 h-8 bg-ios-blue/10 rounded-lg flex items-center justify-center text-ios-blue">
                  <Mic className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-xs">Voice Practice</h4>
                <p className="text-[10px] text-ios-gray">Speak naturally and I'll help with your pronunciation.</p>
              </div>
              <div className="p-4 bg-ios-bg rounded-2xl space-y-2">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-950/40 rounded-lg flex items-center justify-center text-purple-600 dark:text-purple-300">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-xs">Vocabulary</h4>
                <p className="text-[10px] text-ios-gray">Ask me for translations or explanations of words.</p>
              </div>
            </div>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <motion.div
            key={`chat-${i}`}
            initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "flex items-end space-x-2",
              msg.role === 'user' ? "flex-row-reverse space-x-reverse" : "flex-row"
            )}
          >
            <div className={cn(
              "max-w-[95%] p-4 rounded-2xl text-sm",
              msg.role === 'user'
                ? "bg-ios-blue text-white rounded-tr-none"
                : "bg-card ios-shadow rounded-tl-none"
            )}>
              <div className="prose prose-sm max-w-none">
                <SafeMarkdown>{msg.text}</SafeMarkdown>
              </div>
              {msg.role === 'model' && (
                <div className="flex space-x-2 mt-2">
                  <button
                    onClick={() => playSpeech(msg.text)}
                    className="text-ios-blue flex items-center space-x-1"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span className="text-xs font-bold">Listen</span>
                  </button>
                  {msg.text.includes('{') && msg.text.includes('}') && (
                    <button
                      onClick={() => {
                        try {
                          const json = JSON.parse(msg.text.substring(msg.text.indexOf('{'), msg.text.lastIndexOf('}') + 1));
                          saveGeneratedLesson(json);
                        } catch {
                          // Message text looked like JSON but was not parseable — ignore.
                        }
                      }}
                      className="text-purple-600 flex items-center space-x-1"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="text-xs font-bold">Save Lesson</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <div className="bg-card ios-shadow p-4 rounded-2xl mr-auto rounded-tl-none flex space-x-1">
            <div className="w-2 h-2 bg-ios-gray/40 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-ios-gray/40 rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-2 h-2 bg-ios-gray/40 rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 bg-card/90 ios-blur border-t border-line safe-area-bottom">
        <div className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <input
              value={isAIPracticeOpen ? aiMessage : inputText}
              onChange={(e) => isAIPracticeOpen ? setAiMessage(e.target.value) : setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type in Portuguese..."
              className="w-full bg-ios-bg pl-4 pr-10 py-2.5 rounded-2xl outline-none text-sm border border-ios-bg focus:border-ios-blue/30 transition-all"
            />
            <button
              type="button"
              onClick={toggleRecording}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all active:scale-95",
                isRecording ? "bg-red-500 text-white animate-pulse" : "text-ios-gray hover:text-ios-blue"
              )}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!(isAIPracticeOpen ? aiMessage.trim() : inputText.trim())}
            className="p-2.5 bg-ios-blue text-white rounded-full disabled:opacity-50 shadow-sm active:scale-95 transition-all"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorChatView;
