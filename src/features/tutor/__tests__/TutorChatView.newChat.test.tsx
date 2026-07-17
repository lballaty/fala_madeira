// File: src/features/tutor/__tests__/TutorChatView.newChat.test.tsx
// Description: Guards TB-22 — once a free-chat conversation started there was no way back to the
//   tutor welcome state (only a full page reload), and the header Settings button was dead (no
//   onClick). Asserts: the welcome state (Start Lesson / Just Want to Chat) shows when there are no
//   messages and no "New chat" control appears; once messages exist a working "New chat" control
//   appears and clicking it clears chatMessages (returning to the welcome state). framer-motion +
//   SafeMarkdown are mocked for a hermetic render.
// Author: TB-22 fix (with assistant)
// Created: 2026-07-17

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
      const { children, ...rest } = props as { children?: unknown };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.createElement('div', rest as any, children as any);
    } }),
  };
});
vi.mock('../../../components/SafeMarkdown', () => ({ SafeMarkdown: ({ content }: { content?: string }) => <span>{content}</span> }));

import { TutorChatView } from '../TutorChatView';
import type { ChatMessage, Lesson, UserProfile } from '../../../types';

const baseProps = {
  profile: { selected_tutor_id: 't1', unlocked_level: 1 } as unknown as UserProfile,
  lessons: [] as Lesson[],
  setInputText: () => {},
  inputText: '',
  isTyping: false,
  isAIPracticeOpen: false,
  aiMessage: '',
  setAiMessage: () => {},
  isRecording: false,
  toggleRecording: () => {},
  handleSendMessage: async () => {},
  startAIPractice: async () => {},
  playSpeech: () => {},
  saveGeneratedLesson: async () => {},
};

afterEach(cleanup);

describe('TutorChatView — back to welcome / New chat (TB-22)', () => {
  it('shows the welcome state and NO "New chat" control when there are no messages', () => {
    render(<TutorChatView {...baseProps} chatMessages={[]} setChatMessages={() => {}} />);
    expect(screen.getByText(/Just Want to Chat/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull();
  });

  it('shows a working "New chat" control once a conversation exists and clears messages on click', () => {
    const setChatMessages = vi.fn();
    const messages: ChatMessage[] = [{ role: 'user', text: 'olá' } as ChatMessage];
    render(<TutorChatView {...baseProps} chatMessages={messages} setChatMessages={setChatMessages} />);

    // Welcome shortcut is hidden mid-conversation; the New-chat control is present (the fix).
    expect(screen.queryByText(/Just Want to Chat/i)).toBeNull();
    const newChat = screen.getByRole('button', { name: 'New chat' });
    fireEvent.click(newChat);
    // Returns to the welcome state by clearing the conversation (no page reload).
    expect(setChatMessages).toHaveBeenCalledWith([]);
  });
});
