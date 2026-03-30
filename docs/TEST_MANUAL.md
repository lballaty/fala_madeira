# FalaMadeira Test Manual

This document outlines the test cases and procedures to verify the functionality of the FalaMadeira language learning application.

## 1. Authentication
- [ ] **Signup:** Create a new account with email and password.
- [ ] **Login:** Access the app with existing credentials.
- [ ] **Password Reset:** Request a reset link and verify the flow.
- [ ] **Magic Link:** Test passwordless login via email.
- [ ] **Logout:** Ensure session is cleared and user is redirected to login.

## 2. Home Dashboard
- [ ] **Progress Overview:** Verify level name and unlocked level display.
- [ ] **Streak Tracking:** Confirm streak increments correctly (simulated or real).
- [ ] **Curriculum Shortcut:** Test "Start Today's Lesson" button.
- [ ] **Level Unlock:** Test the "Key" icon and unlock modal.

## 3. Learning Curriculum
- [ ] **Month Selection:** Switch between months and verify lesson lists.
- [ ] **Lesson Completion:** Complete a quiz and verify the checkmark appears.
- [ ] **Review Mode:** Toggle "Review Mode" and verify drag-and-drop reordering for completed lessons.
- [ ] **YouTube Indicator:** Verify the YouTube icon appears for lessons with videos.

## 4. Lesson Details & Practice
- [ ] **Video Player:** Play a YouTube video within the lesson modal.
- [ ] **Suggest Video:** Submit a video suggestion and verify it appears in the Admin Panel.
- [ ] **Vocab Lookup:** Open the lookup tool and search for words.
- [ ] **Correction Report:** Submit a correction and verify success toast.
- [ ] **Practice Session:** Start an AI session and verify context-aware greeting.
- [ ] **Quiz:** Complete a quiz and verify XP gain.

## 5. AI Tutor & Voice
- [ ] **Chat:** Send text messages and receive AI responses.
- [ ] **Voice Input:** Use the Mic button to transcribe speech.
- [ ] **Voice Limits:** Verify the daily limit (default 5) triggers the Upgrade Modal.
- [ ] **TTS (Listening):** Play AI responses using the "Listen" button.
- [ ] **Inactivity Prompt:** Wait 45s during a session and verify the AI prompts the user.

## 6. Settings & Profile
- [ ] **Profile Stats:** Verify time spent and streak display.
- [ ] **Audio Speed:** Adjust the slider and verify TTS playback speed changes.
- [ ] **Tutor Selection:** Switch tutors and verify avatar/name updates in Chat.
- [ ] **Admin Mode:** Toggle Admin Mode and verify the "Pending Suggestions" panel appears.
- [ ] **Global Limits:** (Admin) Adjust the global voice limit and verify it affects new sessions.

## 7. Monetization
- [ ] **Upgrade Modal:** Click "Upgrade Now" and verify the Stripe redirect toast.
- [ ] **Tier Benefits:** Verify the modal lists correct features.
