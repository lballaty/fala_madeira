// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/App.tsx
// Description: App shell for FalaMadeira (ENGINEERING-STANDARDS §1.1): composes the feature
//   slice hooks (auth, settings, learning, tutor, practice), wires cross-slice callbacks for
//   the auth bootstrap/logout, gates on setup/loading/auth screens, and renders the five
//   lazy-loaded tab views plus app-level overlays (practice modal, admin panel, quiz,
//   confirmation dialog, toast) and the bottom tab bar. No feature business
//   logic lives here — see src/features/*.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import React, { Suspense, lazy, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Headphones, MessageCircle, Home, Settings, Shield, HelpCircle } from 'lucide-react';
import { cn } from './lib/utils';
import { getSupabase } from './lib/supabase';
import { logger } from './lib/logger';
import { clearDeviceUserState } from './lib/session-cleanup';
import { audioCache } from './lib/audioCache';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar, NavItem } from './components/Sidebar';
import { ConfirmationModal } from './components/ConfirmationModal';
import { Toast } from './components/Toast';
import { useToast } from './hooks/useToast';
import { useConfirmationModal } from './hooks/useConfirmationModal';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useTimeTracking } from './hooks/useTimeTracking';
import { useSpeechPlayback } from './hooks/useSpeechPlayback';
import { useAuth, AuthCrossSliceDeps } from './features/auth/useAuth';
import { AuthScreen } from './features/auth/AuthScreen';
import { SupabaseSetupGuide } from './features/auth/SupabaseSetupGuide';
import { useSettings } from './features/settings/useSettings';
import { useLessons } from './features/learning/useLessons';
import { useLessonModals } from './features/learning/useLessonModals';
import { useTutorSession } from './features/tutor/useTutorSession';
import { TutorPracticeModal } from './features/tutor/TutorPracticeModal';
import { usePractice } from './features/practice/usePractice';
import { PracticeQuiz } from './features/practice/PracticeQuiz';
import { usePathSelection } from './paths';
import { usePathContext } from './features/session/usePathContext';
import { useOnboarding } from './features/onboarding';
import { navigateToCapability } from './features/guidance/navigateToCapability';

// Lazy feature views — one chunk per tab (ENGINEERING-STANDARDS §1.1 code-splitting).
const HomeView = lazy(() => import('./features/home/HomeView'));
const LearningView = lazy(() => import('./features/learning/LearningView'));
const PracticeHubView = lazy(() => import('./features/practice/PracticeHubView'));
const TutorChatView = lazy(() => import('./features/tutor/TutorChatView'));
const SettingsView = lazy(() => import('./features/settings/SettingsView'));
// Admin surface (A12): review queues + Content Studio. Lazy so its data hooks only
// mount when an admin opens it (gated on profile.role === 'admin' at the mount site).
const AdminView = lazy(() => import('./features/admin/AdminView'));
// Daily-session player (path-types): plays the Adaptive Guided sessionPlan by sequencing into
// the practice engines. Lazy + full-screen overlay opened from Home "Start today's session".
const DailySessionView = lazy(() => import('./features/session/DailySessionView'));
// First-run onboarding (CONTENT-ARCHITECTURE §5): welcome → placement → path choice → first win →
// consent. Lazy so its chunk only loads for a signed-in, not-yet-onboarded user (behind the auth
// gate). The useOnboarding hook (light, always mounted) owns the gate signal.
const OnboardingFlow = lazy(() => import('./features/onboarding/OnboardingFlow'));

/** The primary tab-id union — shared by activeTab, the bottom bar, and the desktop sidebar. */
type TabId = 'home' | 'learning' | 'practice' | 'chat' | 'settings';

/**
 * Single source of truth for the five primary navigation destinations (U2 responsive-desktop).
 * Both the mobile bottom tab bar and the desktop sidebar render from this list and call the same
 * setActiveTab — the two nav surfaces are just two presentations of one route model.
 */
const NAV_ITEMS: (NavItem & { id: TabId })[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'learning', label: 'Learning', icon: BookOpen },
  { id: 'practice', label: 'Practice', icon: Headphones },
  { id: 'chat', label: 'Tutor', icon: MessageCircle },
  { id: 'settings', label: 'Profile', icon: Settings },
];

/** Admin entry — rendered only for admins; opens the admin overlay rather than switching tabs. */
const ADMIN_NAV_ITEM: NavItem = { id: 'admin', label: 'Admin', icon: Shield };

/** Help entry (EN-20) — always available; opens the App-Guide chat in help mode (not a tab). */
const HELP_NAV_ITEM: NavItem = { id: 'help', label: 'Help', icon: HelpCircle };

export default function App() {
  const supabase = getSupabase();
  const [activeTab, setActiveTab] = useState<'home' | 'learning' | 'practice' | 'chat' | 'settings'>('home');
  // Admin surface overlay (A12) — opened from the admin nav entry, gated on profile.role === 'admin'.
  const [isAdminViewOpen, setIsAdminViewOpen] = useState(false);
  // Daily-session player overlay (path-types) — opened from Home "Start today's session".
  const [isDailySessionOpen, setIsDailySessionOpen] = useState(false);
  // Deep-link signal (TB-11b): when Home's "Choose your goal" CTA is tapped, open Settings and
  // scroll/highlight the Learning Path goal chooser so the learner lands directly on the picker.
  const [focusGoalChooser, setFocusGoalChooser] = useState(false);
  const { toast, showToast } = useToast();
  const authDepsRef = useRef<AuthCrossSliceDeps | null>(null);
  const {
    user, profile, setProfile, isAuthLoading, authMode, setAuthMode,
    handleSupabaseError, handleLogout,
  } = useAuth({ supabase, showToast, depsRef: authDepsRef });
  const { deferredPrompt, handleInstallClick } = usePwaInstall();
  const { confirmModal, requestConfirmation, closeConfirmation } = useConfirmationModal();

  logger.debug('app_render', 'App render', { details: { activeTab, hasUser: !!user, authMode, isAuthLoading } });

  const settings = useSettings({
    supabase,
    user,
    profile,
    setProfile,
    showToast,
    handleSupabaseError,
    requestConfirmation,
    getDiagnostics: () => ({ activeTab, chatHistoryLength: chatHistory.length }),
  });
  const {
    isSoundEnabled, setIsSoundEnabled,
    playbackSpeed,
    globalVoiceLimit, setGlobalVoiceLimit,
    applyProfilePrefs, getPrefsForNewProfile,
  } = settings;

  const lessonsSlice = useLessons({ supabase, user, profile, setProfile, showToast, handleSupabaseError });
  const {
    lessons,
    selectedLesson, setSelectedLesson,
    selectedMonth,
    videoSuggestions,
    unlockKey, setUnlockKey,
    isUnlockModalOpen, setIsUnlockModalOpen,
    fetchApprovedVideos,
    fetchCustomLessons,
    handleUnlockLevel,
    saveGeneratedLesson,
    resetForLogout: resetLessonsForLogout,
  } = lessonsSlice;

  const lessonModals = useLessonModals({
    supabase, user, profile, showToast, handleSupabaseError,
    selectedLesson, videoSuggestions, setVideoSuggestions: lessonsSlice.setVideoSuggestions,
  });

  const {
    isAIPracticeOpen,
    isHelpMode,
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
    resetForLogout: resetTutorForLogout,
  } = useTutorSession({
    supabase, user, profile, setProfile, showToast, handleSupabaseError,
    isSoundEnabled, playbackSpeed, globalVoiceLimit,
    selectedMonth, setSelectedLesson,
  });

  const { playSpeech } = useSpeechPlayback({ profile, playbackSpeed, showToast });
  const { totalTimeInSeconds, resetTimeTracking } = useTimeTracking({ supabase, user, profile, setProfile, handleSupabaseError });
  const { isQuizOpen, openQuiz, closeQuiz, handleQuizComplete, route: practiceRoute, openMode, closeMode } = usePractice({ supabase, user, profile, setProfile, showToast, handleSupabaseError, selectedLesson });

  // Path-types (docs/CONTENT-ARCHITECTURE.md §5): the chosen learning path + active track drive
  // the Home CTA and the Settings switcher; the daily-session player (Adaptive Guided) is opened
  // from Home. Path context (content + progress + mastery) feeds the pure path policies' next().
  const pathSelection = usePathSelection({ supabase, user });
  // First-run onboarding gate (CONTENT-ARCHITECTURE §5). Light + always mounted so we know whether
  // to show the flow before the main shell; the flow itself drives pathSelection + consent.
  const onboarding = useOnboarding({ supabase, user, profile, setProfile });
  const { context: pathContext, isReady: isPathContextReady } = usePathContext({ supabase, user });
  const pathNextAction = pathSelection.activePath.next(pathContext, pathSelection.selection);

  // Act on the path's recommended next step (Home CTA). Adaptive Guided opens the daily-session
  // player; a course/track step opens that situation in the recommended engine; Free routes to
  // the Practice hub's free browser. Never a hard gate — this is just the recommended entry.
  const handleStartPathNext = () => {
    logger.debug('path_cta', 'Home: start path next action', {
      category: 'USER_ACTION',
      details: { kind: pathNextAction.kind, pathType: pathSelection.selection.type },
    });
    if (pathNextAction.kind === 'session') {
      setIsDailySessionOpen(true);
      return;
    }
    if (pathNextAction.kind === 'situation' && pathNextAction.situationId) {
      openMode(pathNextAction.engineId ?? 'listening', pathNextAction.situationId);
      setActiveTab('practice');
      return;
    }
    if (pathNextAction.kind === 'choose-goal') {
      // Goal Track with no goal chosen (TB-11b): deep-link into the Settings goal chooser.
      setFocusGoalChooser(true);
      setActiveTab('settings');
      return;
    }
    // 'free' (or a situation-less step): send the learner to the Practice hub to self-direct.
    setActiveTab('practice');
  };

  // EN-18 reactive guidance: "Take me there" from the help chat. Resolve the capability's target,
  // close the practice/help modal so the destination control is visible, then switch tab + focus
  // the control (guide-and-offer — no action is performed for the user).
  const handleNavigateToCapability = (capabilityId: string) => {
    logger.debug('guidance', 'navigateToCapability', { category: 'USER_ACTION', details: { capabilityId } });
    closeAIPractice();
    void navigateToCapability(capabilityId, { setActiveTab });
  };

  // Cross-slice wiring for the auth slice. Assigned on every render (before effects
  // run) so useAuth's async flows always see fresh closures from the other slices.
  // Intentional render-time ref assignment: this is the documented cross-slice wiring
  // pattern (see useAuth's AuthCrossSliceDeps); the ref is only read inside effects and
  // async flows, never for render output.
  // eslint-disable-next-line react-hooks/refs -- documented cross-slice wiring pattern
  authDepsRef.current = {
    getPrefsForNewProfile,
    applyProfilePrefs,
    fetchApprovedVideos,
    fetchCustomLessons,
    onLogoutCleanup: () => {
      resetTutorForLogout();
      resetLessonsForLogout();
      resetTimeTracking();
      // SEC-2: reset device-persisted prefs + clear device-global stores so the next user on a
      // shared device inherits nothing (settings reset re-applies defaults; the DB profile is
      // authoritative and re-applies the next user's prefs on login).
      settings.resetForLogout();
      void clearDeviceUserState();
      // SEC-1 WP4 (device bleed): clear the LRU audio cache — it can hold user-private tutor
      // free-chat audio — but KEEP the pinned store (curated public downloads, no PII), so the
      // next user on a shared device inherits no private audio yet keeps offline content usable.
      void audioCache.clear();
    },
  };

  // Setup Guide for Supabase
  if (!supabase && !isAuthLoading) {
    return <SupabaseSetupGuide />;
  }

  if (isAuthLoading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-ios-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue" />
      </div>
    );
  }

  if (!user || authMode === 'updatePassword') {
    return (
      <AuthScreen
        supabase={supabase}
        authMode={authMode}
        setAuthMode={setAuthMode}
        showToast={showToast}
        toast={toast}
        handleSupabaseError={handleSupabaseError}
      />
    );
  }

  // First-run onboarding gate (CONTENT-ARCHITECTURE §5): a signed-in learner who has not yet
  // finished onboarding sees the flow before the main tab shell. Behind the auth gate above; we
  // wait for the durable record to load (onboarding.isLoaded) to avoid a flash of onboarding.
  if (onboarding.isLoaded && !onboarding.isComplete) {
    return (
      <ErrorBoundary>
        <div className="flex flex-col h-dvh max-w-md mx-auto bg-surface border-x border-line relative overflow-hidden">
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-ios-blue" />
              </div>
            }
          >
            <OnboardingFlow
              onboarding={onboarding}
              pathControls={pathSelection}
              playSpeech={playSpeech}
              onFinish={() => setActiveTab('home')}
            />
          </Suspense>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {/* Responsive app shell (U2). Mobile (<md): single centered ~384px column with the bottom
          tab bar. Desktop (md+): a persistent left sidebar + full-width content row; the bottom
          bar is hidden and the sidebar drives the identical activeTab state. */}
      <div className="flex flex-col md:flex-row h-dvh max-w-md md:max-w-none mx-auto bg-surface border-x md:border-x-0 border-line relative overflow-hidden">
      {/* Desktop-only left nav (hidden below md). Same destinations as the bottom bar. */}
      <Sidebar
        navItems={NAV_ITEMS}
        activeTab={activeTab}
        onSelectTab={(id) => {
          logger.debug('nav', 'Sidebar nav', { category: 'USER_ACTION', details: { id } });
          setActiveTab(id as TabId);
        }}
        helpItem={HELP_NAV_ITEM}
        onOpenHelp={() => {
          logger.debug('nav', 'Sidebar nav: help', { category: 'USER_ACTION' });
          void openHelp();
        }}
        adminItem={profile?.role === 'admin' ? ADMIN_NAV_ITEM : undefined}
        isAdminActive={isAdminViewOpen}
        onOpenAdmin={() => {
          logger.debug('nav', 'Sidebar nav: admin', { category: 'USER_ACTION' });
          setIsAdminViewOpen(true);
        }}
        onSignOut={() => {
          logger.debug('nav', 'Sidebar nav: sign out', { category: 'USER_ACTION' });
          void handleLogout();
        }}
      />
      {/* Content column: on desktop it fills the remaining width and centers a readable measure. */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <main className="flex-1 overflow-hidden">
        {/* Desktop readable-measure wrapper: no longer 384px-locked, but capped so lines stay
            comfortable and multi-column screens (lg+) have room to breathe. */}
        <div className="h-full md:max-w-5xl md:mx-auto md:w-full">
        <Suspense fallback={null}>
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <HomeView
                  user={user}
                  profile={profile}
                  lessons={lessons}
                  supabase={supabase}
                  setActiveTab={setActiveTab}
                  setSelectedLesson={setSelectedLesson}
                  startAIPractice={startAIPractice}
                  unlockKey={unlockKey}
                  setUnlockKey={setUnlockKey}
                  isUnlockModalOpen={isUnlockModalOpen}
                  setIsUnlockModalOpen={setIsUnlockModalOpen}
                  handleUnlockLevel={handleUnlockLevel}
                  pathNextAction={pathNextAction}
                  isPathReady={isPathContextReady && pathSelection.isLoaded}
                  onStartPathNext={handleStartPathNext}
                  pathContext={pathContext}
                  pathSelection={pathSelection.selection}
                  activePath={pathSelection.activePath}
                  openMode={openMode}
                />
              </motion.div>
            )}
            {activeTab === 'learning' && (
              <motion.div key="learning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <LearningView
                  profile={profile}
                  lessonsSlice={lessonsSlice}
                  lessonModals={lessonModals}
                  openPracticeModal={openPracticeModal}
                  startAIPractice={startAIPractice}
                  openQuiz={openQuiz}
                  playSpeech={playSpeech}
                />
              </motion.div>
            )}
            {activeTab === 'practice' && (
              <motion.div key="practice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <PracticeHubView
                  route={practiceRoute}
                  openMode={openMode}
                  closeMode={closeMode}
                  openQuiz={openQuiz}
                  selectedLesson={selectedLesson}
                  showToast={showToast}
                  setActiveTab={setActiveTab}
                />
              </motion.div>
            )}
            {activeTab === 'chat' && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <TutorChatView
                  profile={profile}
                  lessons={lessons}
                  chatMessages={chatMessages}
                  setChatMessages={setChatMessages}
                  inputText={inputText}
                  setInputText={setInputText}
                  isTyping={isTyping}
                  isAIPracticeOpen={isAIPracticeOpen}
                  aiMessage={aiMessage}
                  setAiMessage={setAiMessage}
                  isRecording={isRecording}
                  toggleRecording={toggleRecording}
                  handleSendMessage={handleSendMessage}
                  startAIPractice={startAIPractice}
                  playSpeech={playSpeech}
                  saveGeneratedLesson={saveGeneratedLesson}
                />
              </motion.div>
            )}
            {activeTab === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <SettingsView
                  user={user}
                  profile={profile}
                  settings={settings}
                  totalTimeInSeconds={totalTimeInSeconds}
                  deferredPrompt={deferredPrompt}
                  handleInstallClick={handleInstallClick}
                  setAuthMode={setAuthMode}
                  requestConfirmation={requestConfirmation}
                  handleLogout={handleLogout}
                  showToast={showToast}
                  pathSelection={pathSelection}
                  focusGoalChooser={focusGoalChooser}
                  onGoalChooserFocused={() => setFocusGoalChooser(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Suspense>
        </div>
      </main>

      <nav className="h-20 md:hidden bg-card/80 ios-blur border-t border-line flex items-center justify-around safe-area-bottom z-20">
        <button
          data-testid="tab-home"
          onClick={() => {
            logger.debug('nav', 'Nav: home', { category: 'USER_ACTION' });
            setActiveTab('home');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'home' ? "text-ios-blue" : "text-ios-gray")}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Home</span>
        </button>
        <button
          data-testid="tab-learning"
          onClick={() => {
            logger.debug('nav', 'Nav: learning', { category: 'USER_ACTION' });
            setActiveTab('learning');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'learning' ? "text-ios-blue" : "text-ios-gray")}
        >
          <BookOpen className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Learning</span>
        </button>
        <button
          data-testid="tab-practice"
          onClick={() => {
            logger.debug('nav', 'Nav: practice', { category: 'USER_ACTION' });
            setActiveTab('practice');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'practice' ? "text-ios-blue" : "text-ios-gray")}
        >
          <Headphones className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Practice</span>
        </button>
        <button
          data-testid="tab-chat"
          onClick={() => {
            logger.debug('nav', 'Nav: chat', { category: 'USER_ACTION' });
            setActiveTab('chat');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'chat' ? "text-ios-blue" : "text-ios-gray")}
        >
          <MessageCircle className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Tutor</span>
        </button>
        <button
          data-testid="tab-settings"
          onClick={() => {
            logger.debug('nav', 'Nav: settings', { category: 'USER_ACTION' });
            setActiveTab('settings');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'settings' ? "text-ios-blue" : "text-ios-gray")}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Profile</span>
        </button>
        {profile?.role === 'admin' && (
          <button
            onClick={() => {
              logger.debug('nav', 'Nav: admin', { category: 'USER_ACTION' });
              setIsAdminViewOpen(true);
            }}
            className={cn("flex flex-col items-center space-y-1", isAdminViewOpen ? "text-ios-blue" : "text-ios-gray")}
          >
            <Shield className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Admin</span>
          </button>
        )}
      </nav>
      </div>

      {/* AI Practice Modal */}
      <TutorPracticeModal
        isAIPracticeOpen={isAIPracticeOpen}
        profile={profile}
        selectedMonth={selectedMonth}
        isHelpMode={isHelpMode}
        toggleHelpMode={toggleHelpMode}
        isSoundEnabled={isSoundEnabled}
        setIsSoundEnabled={setIsSoundEnabled}
        closeAIPractice={closeAIPractice}
        chatHistory={chatHistory}
        isAiLoading={isAiLoading}
        currentlySpeakingIndex={currentlySpeakingIndex}
        playMessageInChunks={playMessageInChunks}
        handleAIPractice={handleAIPractice}
        aiMessage={aiMessage}
        setAiMessage={setAiMessage}
        isRecording={isRecording}
        toggleRecording={toggleRecording}
        onNavigateToCapability={handleNavigateToCapability}
      />

      {/* Admin surface overlay (A12): review queues + Content Studio. Admin-only mount;
          the view also self-gates on role and RLS enforces every read/write. */}
      <AnimatePresence>
        {isAdminViewOpen && profile?.role === 'admin' && (
          <Suspense fallback={null}>
            <AdminView
              supabase={supabase}
              profile={profile}
              showToast={showToast}
              handleSupabaseError={handleSupabaseError}
              globalVoiceLimit={globalVoiceLimit}
              setGlobalVoiceLimit={setGlobalVoiceLimit}
              onClose={() => setIsAdminViewOpen(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Daily-session player overlay (path-types §5): Adaptive Guided ~30-min session sequenced
          through the practice engines. Full-screen; opened from Home "Start today's session". */}
      <AnimatePresence>
        {isDailySessionOpen && (
          <motion.div
            key="daily-session"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-ios-bg max-w-md mx-auto"
          >
            <Suspense fallback={null}>
              <DailySessionView
                supabase={supabase}
                user={user}
                selection={pathSelection.selection}
                onExit={() => setIsDailySessionOpen(false)}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Practice slice quiz overlay (the practice hub itself is the Practice tab above) */}
      <AnimatePresence>
        <PracticeQuiz
          isQuizOpen={isQuizOpen}
          selectedLesson={selectedLesson}
          onComplete={handleQuizComplete}
          onClose={closeQuiz}
          playSpeech={(text) => playSpeech(text)}
        />
      </AnimatePresence>

      <AnimatePresence>
        {confirmModal.isOpen && (
          <ConfirmationModal
            isOpen={confirmModal.isOpen}
            onClose={closeConfirmation}
            onConfirm={confirmModal.onConfirm}
            title={confirmModal.title}
            message={confirmModal.message}
            confirmText={confirmModal.confirmText}
            cancelText={confirmModal.cancelText}
            isDestructive={confirmModal.isDestructive}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <Toast toast={toast} positionClassName="bottom-24" />}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}
