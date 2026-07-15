// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/SettingsView.tsx
// Description: Profile/settings tab extracted verbatim from App.tsx renderSettings: profile
//   card with time/streak, audio speed slider, admin mode + global voice limit, PWA install,
//   tutor switch, support, user manual, tutorial, legal pages (Terms/Privacy/AI disclosure),
//   change password, account deletion, and sign out. Renders its own modals (tutor selection,
//   support, user manual, tutorial overlay, legal page).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Bot, ChevronRight, Compass, Download, FileText, HardDrive, Inbox, Info, LifeBuoy, Lock, LogOut, Monitor, Moon, Palette, Shield, ShieldCheck, Sparkles, Sun, Trash2, User as UserIcon, Users, Volume2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';
import { LegalPage, LegalDocId } from '../legal';
import { AboutModal } from '../about';
import { isBlobStorePersistent } from '../../lib/audioCache';
import { geminiService } from '../../services/geminiService';
import { TUTORS } from '../../data/tutors';
import { User } from '@supabase/supabase-js';
import { TTS_PROVIDERS, UserProfile } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { ConfirmModalState } from '../../hooks/useConfirmationModal';
import { BeforeInstallPromptEvent } from '../../hooks/usePwaInstall';
import { errorMessage, logger, userMessage } from '../../lib/logger';
import { config } from '../../config';
import { contentRepository } from '../../content/repository';
import { Track } from '../../content/schema';
import { PATHS, type usePathSelection } from '../../paths';
import { AuthMode } from '../auth/useAuth';
import { useSettings } from './useSettings';
import { TutorSelectionModal } from './TutorSelectionModal';
import { SupportModal } from './SupportModal';
import { UserManualModal } from './UserManualModal';
import { TutorialOverlay } from './TutorialOverlay';
import { MySubmissionsModal } from './MySubmissionsModal';

/** Human-readable megabytes for the offline usage/limit display (1 MB = 1024*1024 B). */
const formatMb = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`;

interface SettingsViewProps {
  user: User | null;
  profile: UserProfile | null;
  settings: ReturnType<typeof useSettings>;
  totalTimeInSeconds: number;
  deferredPrompt: BeforeInstallPromptEvent | null;
  handleInstallClick: () => Promise<void>;
  setAuthMode: (mode: AuthMode) => void;
  requestConfirmation: (options: Omit<ConfirmModalState, 'isOpen'>) => void;
  handleLogout: () => Promise<void>;
  showToast: ShowToast;
  /** Path-type selection (docs/CONTENT-ARCHITECTURE.md §5) — the learning-path switcher. */
  pathSelection: ReturnType<typeof usePathSelection>;
}

export const SettingsView = ({
  user,
  profile,
  settings,
  totalTimeInSeconds,
  deferredPrompt,
  handleInstallClick,
  setAuthMode,
  requestConfirmation,
  handleLogout,
  showToast,
  pathSelection
}: SettingsViewProps) => {
  const {
    playbackSpeed, setPlaybackSpeed,
    globalVoiceLimit, setGlobalVoiceLimit,
    isAdminMode, setIsAdminMode,
    isTutorSelectionOpen, setIsTutorSelectionOpen,
    isSupportModalOpen, setIsSupportModalOpen,
    supportSubject, setSupportSubject,
    supportDescription, setSupportDescription,
    isSubmittingSupport,
    isUserManualOpen, setIsUserManualOpen,
    showTutorial, setShowTutorial,
    tutorialStep, setTutorialStep,
    handleSelectTutor, handleSetTtsProvider, handleSetTtsByoKeyRef,
    handleOpenTicket, handleCollectLogs,
    isMySubmissionsOpen, setIsMySubmissionsOpen,
    mySubmissions, isLoadingSubmissions, submissionsError,
    loadMySubmissions, openMySubmissions,
    saveAudioOnDevice, setSaveAudioOnDevice,
    cacheLimitBytes, setCacheLimitBytes,
    cacheUsageBytes,
    downloadProgress, isDownloading,
    handleClearAudioCache, handleDownloadForOffline, handleCancelDownload,
  } = settings;

  // Tracks power the "Download <track> for offline" selector (loaded from the
  // content repository; empty selection = download by level across all tracks).
  const [tracks, setTracks] = useState<Track[]>([]);
  const [downloadTrackId, setDownloadTrackId] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    contentRepository
      .listTracks()
      .then((loaded) => {
        if (!cancelled) setTracks(loaded);
      })
      .catch(() => {
        /* repository already logs load failures; the selector just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTrack = tracks.find((t) => t.id === downloadTrackId) ?? null;
  const downloadLabel = selectedTrack
    ? `Download "${selectedTrack.name}" for offline`
    : 'Download all levels for offline';

  // Human-readable labels for the voice-provider picker (values mirror types.TTS_PROVIDERS
  // and the profiles.tts_provider CHECK). Order matches the platform default chain first.
  const TTS_PROVIDER_LABELS: Record<(typeof TTS_PROVIDERS)[number], string> = {
    azure: 'Microsoft Azure',
    gemini: 'Google Gemini',
    google: 'Google Cloud',
    elevenlabs: 'ElevenLabs',
    openai: 'OpenAI',
    polly: 'Amazon Polly',
  };

  // Legal pages are self-contained (static content, no server state), so their
  // open/closed state lives here rather than in useSettings.
  const [openLegalDoc, setOpenLegalDoc] = useState<LegalDocId | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Appearance (light/dark) — three-way preference (System/Light/Dark) applied to
  // <html data-theme> and persisted by the useTheme hook (localStorage 'fm_theme').
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: 'system', label: 'System', Icon: Monitor },
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon },
  ];

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full pb-32">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>

      <div className="bg-card p-6 rounded-3xl ios-shadow flex flex-col items-center space-y-4">
        <div className="w-24 h-24 bg-ios-blue/10 rounded-full flex items-center justify-center text-ios-blue">
          <UserIcon className="w-12 h-12" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold">{user?.email}</h2>
          <p className="text-ios-gray">Member since 2026</p>
          <div className="mt-4 flex items-center justify-center space-x-4">
            <div className="bg-ios-bg px-4 py-2 rounded-2xl">
              <p className="text-[10px] uppercase tracking-wider font-bold text-ios-gray">Time Spent</p>
              <p className="text-lg font-bold text-ios-blue">
                {Math.floor(((profile?.total_time_spent || 0) + totalTimeInSeconds) / 60)}m
              </p>
            </div>
            <div className="bg-ios-bg px-4 py-2 rounded-2xl">
              <p className="text-[10px] uppercase tracking-wider font-bold text-ios-gray">Streak</p>
              <p className="text-lg font-bold text-orange-800">{profile?.streak || 0}d</p>
            </div>
          </div>
        </div>
      </div>

      {/* Appearance (dark-mode-and-typescale): three-way theme preference. System tracks the OS
          setting; Light/Dark force it. Applied to <html data-theme> + persisted by useTheme. */}
      <div className="bg-card p-6 rounded-3xl ios-shadow space-y-4">
        <div className="flex items-center">
          <Palette className="w-5 h-5 mr-3 text-brand" />
          <span className="font-bold text-text">Appearance</span>
        </div>
        <div className="flex bg-surface rounded-2xl p-1">
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const active = themePreference === value;
            return (
              <button
                key={value}
                onClick={() => setThemePreference(value)}
                aria-pressed={active}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-body font-semibold transition-colors',
                  active ? 'bg-card text-text ios-shadow' : 'text-muted',
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Learning-path switcher (docs/CONTENT-ARCHITECTURE.md §5): four path types over one
          content base — Structured course / Goal track / Adaptive guided / Free. Switchable
          anytime; progress and mastery are shared across paths. (Onboarding sets the initial
          choice later; this is the always-available switch surface it needs.) */}
      <div className="bg-card p-6 rounded-3xl ios-shadow space-y-4" data-testid="path-switcher">
        <div className="flex items-center">
          <Compass className="w-5 h-5 mr-3 text-ios-blue" />
          <span className="font-bold">Learning Path</span>
        </div>
        <p className="text-[11px] text-ios-gray leading-snug">
          All paths use the same situations and share your progress. Switch whenever you like.
        </p>
        <div className="space-y-2">
          {PATHS.map((path) => {
            const desc = path.describe();
            const active = pathSelection.selection.type === path.type;
            return (
              <button
                key={path.type}
                onClick={() => pathSelection.setPathType(path.type)}
                aria-pressed={active}
                className={cn(
                  'w-full text-left p-3 rounded-2xl border-2 transition-colors',
                  active
                    ? 'border-ios-blue bg-ios-blue/5'
                    : 'border-transparent bg-ios-bg hover:bg-ios-bg/70',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{desc.title}</span>
                  {active && (
                    <span className="text-[9px] font-bold uppercase text-ios-blue bg-ios-blue/10 px-2 py-0.5 rounded-full">
                      active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ios-gray mt-0.5">{desc.tagline}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-card p-6 rounded-3xl ios-shadow space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Volume2 className="w-5 h-5 mr-3 text-ios-blue" />
            <span className="font-bold">Audio Speed</span>
          </div>
          <span className="text-sm font-bold text-ios-blue">{playbackSpeed}x</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="1.5"
          step="0.1"
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
          aria-label="Audio speed"
          className="w-full accent-ios-blue"
        />
        <div className="flex justify-between text-[10px] font-bold text-ios-gray uppercase tracking-widest">
          <span>Slower</span>
          <span>Normal</span>
          <span>Faster</span>
        </div>
      </div>

      <div className="bg-card p-6 rounded-3xl ios-shadow space-y-4">
        <div className="flex items-center">
          <Volume2 className="w-5 h-5 mr-3 text-ios-blue" />
          <span className="font-bold">Voice Provider</span>
        </div>
        <select
          value={profile?.tts_provider ?? ''}
          onChange={(e) =>
            handleSetTtsProvider(
              e.target.value ? (e.target.value as (typeof TTS_PROVIDERS)[number]) : null,
            )
          }
          aria-label="Voice Provider"
          className="w-full p-3 rounded-2xl bg-ios-bg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ios-blue"
        >
          <option value="">Default (automatic)</option>
          {TTS_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {TTS_PROVIDER_LABELS[p]} (requires provider key)
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ios-gray leading-snug">
          Default lets the app pick the best available voice. Choosing a specific provider
          only takes effect when its API key is configured for your account.
        </p>

        {profile?.tts_provider && (
          <div className="space-y-2 pt-1">
            <label className="block text-[10px] uppercase tracking-wider font-bold text-ios-gray">
              Provider key reference
              <input
                type="text"
                defaultValue={profile?.tts_byo_key_ref ?? ''}
                onBlur={(e) => handleSetTtsByoKeyRef(e.target.value)}
                placeholder="e.g. TTS_ELEVENLABS_KEY_ALICE"
                className="mt-2 w-full p-3 rounded-2xl bg-ios-bg text-sm font-medium normal-case tracking-normal focus:outline-none focus:ring-2 focus:ring-ios-blue"
              />
            </label>
            <p className="text-[11px] text-ios-gray leading-snug">
              This is only the <span className="font-semibold">name</span> of a secret an
              administrator registers on the server — never paste your actual API key here.
              An admin must register the matching secret before this provider will be used;
              otherwise the app falls back to the default voice.
            </p>
          </div>
        )}
      </div>

      <div className="bg-card p-6 rounded-3xl ios-shadow space-y-4">
        <div className="flex items-center">
          <HardDrive className="w-5 h-5 mr-3 text-ios-blue" />
          <span className="font-bold">Offline Audio</span>
        </div>

        {/* Save audio on device — toggle. Off clears + skips the on-device cache. */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Save audio on device</p>
            <p className="text-[11px] text-ios-gray leading-snug">
              Keeps spoken clips so they replay instantly and work offline.
            </p>
          </div>
          <button
            onClick={() => setSaveAudioOnDevice(!saveAudioOnDevice)}
            role="switch"
            aria-checked={saveAudioOnDevice}
            aria-label="Save audio on device"
            className={cn(
              'w-10 h-6 rounded-full transition-colors relative flex-shrink-0',
              saveAudioOnDevice ? 'bg-ios-blue' : 'bg-ios-gray/20',
            )}
          >
            <div className={cn(
              'absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow-sm',
              saveAudioOnDevice ? 'right-0.5' : 'left-0.5',
            )} />
          </button>
        </div>

        {/* TB-9: honest warning when this browser can't persist audio (IndexedDB unavailable —
            private mode / storage blocked). Audio still plays but is lost on reload, so it "isn't
            saved". Prevents the confusing "I turned it on but nothing is saved" report. */}
        {!isBlobStorePersistent() && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
            <p className="text-[11px] text-amber-700 dark:text-amber-200 leading-snug" data-testid="offline-audio-unavailable">
              This browser can’t save audio for offline use (private mode or storage is blocked).
              Audio still plays, but it won’t be kept between sessions.
            </p>
          </div>
        )}

        {/* Storage limit selector + live usage. */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Storage limit</span>
          <select
            value={cacheLimitBytes}
            onChange={(e) => setCacheLimitBytes(parseInt(e.target.value, 10))}
            disabled={!saveAudioOnDevice}
            aria-label="Storage limit"
            className="p-2 rounded-xl bg-ios-bg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ios-blue disabled:opacity-40"
          >
            {config.audio.cacheLimitOptionsBytes.map((bytes) => (
              <option key={bytes} value={bytes}>{formatMb(bytes)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between text-[11px] text-ios-gray">
          <span>Used: {formatMb(cacheUsageBytes)} of {formatMb(cacheLimitBytes)}</span>
          <button
            onClick={handleClearAudioCache}
            className="font-semibold text-ios-blue active:opacity-60"
          >
            Clear cache
          </button>
        </div>

        {/* Download track/level for offline — pre-generates multi-voice audio. Online only. */}
        <div className="pt-2 border-t border-ios-bg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Download for offline</span>
            <span className="text-[10px] uppercase tracking-wider font-bold text-orange-700">
              Online only
            </span>
          </div>
          <select
            value={downloadTrackId}
            onChange={(e) => setDownloadTrackId(e.target.value)}
            disabled={!saveAudioOnDevice || isDownloading}
            aria-label="Download for offline"
            className="w-full p-3 rounded-2xl bg-ios-bg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ios-blue disabled:opacity-40"
          >
            <option value="">All levels (every track)</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {isDownloading ? (
            <div className="space-y-2">
              <div className="h-2 w-full bg-ios-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-ios-blue transition-all"
                  style={{ width: `${Math.round((downloadProgress ?? 0) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-ios-gray">
                  Downloading… {Math.round((downloadProgress ?? 0) * 100)}%
                </span>
                <button
                  onClick={handleCancelDownload}
                  className="flex items-center text-[11px] font-semibold text-red-500 active:opacity-60"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handleDownloadForOffline(downloadTrackId ? { trackId: downloadTrackId } : {})}
              disabled={!saveAudioOnDevice}
              className="w-full p-3 rounded-2xl bg-ios-blue text-white font-semibold flex items-center justify-center active:opacity-80 disabled:opacity-40"
            >
              <Download className="w-4 h-4 mr-2" />
              {downloadLabel}
            </button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl ios-shadow overflow-hidden space-y-px">
        {profile?.role === 'admin' && (
          <button
            onClick={() => setIsAdminMode(!isAdminMode)}
            role="switch"
            aria-checked={isAdminMode}
            className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
          >
            <div className="flex items-center">
              <Shield className={cn("w-5 h-5 mr-3", isAdminMode ? "text-ios-blue" : "text-ios-gray")} />
              Admin Mode
            </div>
            <div className={cn(
              "w-10 h-5 rounded-full transition-colors relative",
              isAdminMode ? "bg-ios-blue" : "bg-ios-gray/20"
            )}>
              <div className={cn(
                "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                isAdminMode ? "right-0.5" : "left-0.5"
              )} />
            </div>
          </button>
        )}

        {isAdminMode && profile?.role === 'admin' && (
          <div className="p-4 bg-purple-50 dark:bg-purple-950/40 space-y-4 border-b border-line">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-bold text-xs text-purple-800 dark:text-purple-200">Global Voice Limit</p>
                <p className="text-[10px] text-purple-600 dark:text-purple-300">Daily free messages for users</p>
              </div>
              <div className="flex items-center space-x-3 bg-card p-1 rounded-xl border border-purple-100 dark:border-purple-900">
                <button
                  onClick={() => setGlobalVoiceLimit(Math.max(0, globalVoiceLimit - 1))}
                  className="w-8 h-8 flex items-center justify-center text-purple-600 dark:text-purple-300 font-bold hover:bg-purple-50 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
                >-</button>
                <span className="font-bold text-purple-800 dark:text-purple-200 w-6 text-center text-sm">{globalVoiceLimit}</span>
                <button
                  onClick={() => setGlobalVoiceLimit(globalVoiceLimit + 1)}
                  className="w-8 h-8 flex items-center justify-center text-purple-600 dark:text-purple-300 font-bold hover:bg-purple-50 dark:hover:bg-purple-900/40 rounded-lg transition-colors"
                >+</button>
              </div>
            </div>
          </div>
        )}
        {/* TB-8: surface the daily voice limit read-only to ALL users (it was only visible behind
            admin mode, so users couldn't see their real allowance). Reflects the loaded server
            value; admins additionally get the +/- editor above. */}
        <div className="p-4 flex items-center justify-between border-b border-ios-bg">
          <div className="flex items-center">
            <Volume2 className="w-5 h-5 mr-3 text-ios-gray" />
            <div>
              <p className="font-medium">Daily voice limit</p>
              <p className="text-[11px] text-ios-gray">Free spoken-tutor messages per day · applies to all users</p>
            </div>
          </div>
          <span className="font-bold text-sm" data-testid="voice-limit-value">{globalVoiceLimit}</span>
        </div>
        {deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
          >
            <div className="flex items-center">
              <Download className="w-5 h-5 mr-3" />
              Install App
            </div>
            <ChevronRight className="w-4 h-4 text-ios-gray" />
          </button>
        )}
        <button
          onClick={() => setIsTutorSelectionOpen(true)}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Users className="w-5 h-5 mr-3" />
            Switch AI Tutor
          </div>
          <div className="flex items-center">
            <span className="text-xs text-ios-gray mr-2">
              {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'}
            </span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
        <button
          onClick={() => setIsSupportModalOpen(true)}
          className="w-full p-4 flex items-center text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <LifeBuoy className="w-5 h-5 mr-3 text-ios-blue" />
          Support & Feedback
        </button>

        <button
          onClick={openMySubmissions}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Inbox className="w-5 h-5 mr-3" />
            My Submissions
          </div>
          <ChevronRight className="w-4 h-4 text-ios-gray" />
        </button>

        <button
          onClick={() => setIsUserManualOpen(true)}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <BookOpen className="w-5 h-5 mr-3" />
            User Manual
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setShowTutorial(true); setTutorialStep(0); }}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Sparkles className="w-5 h-5 mr-3" />
            App Tutorial
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsAboutOpen(true)}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Info className="w-5 h-5 mr-3" />
            About
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setOpenLegalDoc('terms')}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <FileText className="w-5 h-5 mr-3" />
            Terms of Service
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setOpenLegalDoc('privacy')}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <ShieldCheck className="w-5 h-5 mr-3" />
            Privacy Policy
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setOpenLegalDoc('ai-use')}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Bot className="w-5 h-5 mr-3" />
            AI Disclosure
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setAuthMode('updatePassword')}
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Lock className="w-5 h-5 mr-3" />
            Change Password
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            requestConfirmation({
              title: "Delete Account?",
              message: "Are you sure you want to delete your account and all associated data? This action cannot be undone.",
              confirmText: "Delete Everything",
              cancelText: "Keep My Account",
              isDestructive: true,
              onConfirm: () => {
                geminiService.deleteAccount()
                  .then(() => {
                    showToast("Account deleted", "success");
                    handleLogout();
                  })
                  .catch((error: unknown) => {
                    const event = logger.error('ACCOUNT_DELETE_FAILED', 'Account deletion failed', {
                      category: 'SECURITY',
                      error,
                    });
                    showToast(
                      userMessage('ACCOUNT_DELETE_FAILED', errorMessage(error) || 'Account deletion failed — please try again or contact support', event.request_id),
                      'error'
                    );
                  });
              }
            });
          }}
          className="w-full p-4 flex items-center text-red-500 font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <Trash2 className="w-5 h-5 mr-3" />
          Delete Account & Data
        </button>

        <button onClick={handleLogout} className="w-full p-4 flex items-center justify-between text-red-500 font-medium active:bg-ios-bg">
          <div className="flex items-center">
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <TutorSelectionModal
        isTutorSelectionOpen={isTutorSelectionOpen}
        setIsTutorSelectionOpen={setIsTutorSelectionOpen}
        profile={profile}
        handleSelectTutor={handleSelectTutor}
      />

      <SupportModal
        isSupportModalOpen={isSupportModalOpen}
        setIsSupportModalOpen={setIsSupportModalOpen}
        supportSubject={supportSubject}
        setSupportSubject={setSupportSubject}
        supportDescription={supportDescription}
        setSupportDescription={setSupportDescription}
        isSubmittingSupport={isSubmittingSupport}
        handleOpenTicket={handleOpenTicket}
        handleCollectLogs={handleCollectLogs}
      />

      <MySubmissionsModal
        isOpen={isMySubmissionsOpen}
        onClose={() => setIsMySubmissionsOpen(false)}
        submissions={mySubmissions}
        isLoading={isLoadingSubmissions}
        error={submissionsError}
        onRefresh={loadMySubmissions}
      />

      <UserManualModal
        isUserManualOpen={isUserManualOpen}
        setIsUserManualOpen={setIsUserManualOpen}
      />

      <TutorialOverlay
        showTutorial={showTutorial}
        setShowTutorial={setShowTutorial}
        tutorialStep={tutorialStep}
        setTutorialStep={setTutorialStep}
      />

      <LegalPage doc={openLegalDoc} onClose={() => setOpenLegalDoc(null)} />
      <AboutModal
        open={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        onOpenLegal={(doc) => { setIsAboutOpen(false); setOpenLegalDoc(doc); }}
        onOpenSupport={() => { setIsAboutOpen(false); setIsSupportModalOpen(true); }}
      />
    </div>
  );
};

export default SettingsView;
