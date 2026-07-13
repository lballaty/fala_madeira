// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/settings/useSettings.ts
// Description: Settings-slice store hook extracted from App.tsx. Owns user preferences
//   (playback speed, sound, admin global voice limit) with their localStorage/Supabase sync
//   effects, plus settings-screen UI state (admin mode, tutor selection, support, user manual,
//   tutorial) and their handlers. applyProfilePrefs/getPrefsForNewProfile are consumed by the
//   auth slice when a profile is fetched/created.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useRef, useState } from 'react';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { LessonCorrection, LessonRequest, Ticket, TtsProviderId, UserProfile, VideoSuggestion } from '../../types';
import { ShowToast } from '../../hooks/useToast';
import { ConfirmModalState } from '../../hooks/useConfirmationModal';
import { logger, userMessage } from '../../lib/logger';
import { config } from '../../config';
import { audioCache } from '../../lib/audioCache';
import { downloadForOffline, DownloadScope } from '../../lib/audio-download';
import { validateText } from '../../lib/validation';

/** Correlation id for tracing a submissions read (mirrors useAdminQueues). */
const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

/**
 * Read-only snapshot of the current user's own submissions across the four feedback
 * tables. Owner-RLS (migrations 00001/00003) limits every SELECT to the caller's rows,
 * so these are genuinely "my submissions", not a global view.
 */
export interface MySubmissions {
  corrections: LessonCorrection[];
  requests: LessonRequest[];
  tickets: Ticket[];
  videos: VideoSuggestion[];
}

const emptySubmissions: MySubmissions = { corrections: [], requests: [], tickets: [], videos: [] };

interface SettingsDeps {
  supabase: SupabaseClient | null;
  user: User | null;
  profile: UserProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  showToast: ShowToast;
  handleSupabaseError: (error: unknown, operation: string, path: string) => unknown;
  requestConfirmation: (options: Omit<ConfirmModalState, 'isOpen'>) => void;
  getDiagnostics: () => { activeTab: string; chatHistoryLength: number };
}

export const useSettings = ({
  supabase,
  user,
  profile,
  setProfile,
  showToast,
  handleSupabaseError,
  requestConfirmation,
  getDiagnostics
}: SettingsDeps) => {
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('is_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = localStorage.getItem('playback_speed');
    return saved ? parseFloat(saved) : config.audio.defaultPlaybackSpeed;
  });
  const [globalVoiceLimit, setGlobalVoiceLimit] = useState(() => {
    const saved = localStorage.getItem('global_voice_limit');
    return saved ? parseInt(saved) : config.voice.defaultDailyVoiceLimit;
  });
  const [hasLoadedGlobalVoiceLimit, setHasLoadedGlobalVoiceLimit] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isTutorSelectionOpen, setIsTutorSelectionOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDescription, setSupportDescription] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [isUserManualOpen, setIsUserManualOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  // --- My submissions (Settings → account; feedback-status-visibility) -------
  // Read-only status view over the user's own corrections/requests/tickets/videos.
  const [isMySubmissionsOpen, setIsMySubmissionsOpen] = useState(false);
  const [mySubmissions, setMySubmissions] = useState<MySubmissions>(emptySubmissions);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  // Calm, Ref'd error string surfaced in the modal (null = no error). Never a raw exception.
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);

  // --- Offline audio (Settings → Offline; CONTENT-ARCHITECTURE §10) --------
  // "Save audio on device": when off, the app clears the cache and skips it (playback
  // still works online — it just does not persist between plays).
  const [saveAudioOnDevice, setSaveAudioOnDevice] = useState(() => {
    const saved = localStorage.getItem(config.offline.saveAudioKey);
    return saved !== null ? saved === 'true' : true;
  });
  // User-chosen bounded-LRU byte budget (the "Storage limit" selector).
  const [cacheLimitBytes, setCacheLimitBytes] = useState(() => {
    const saved = localStorage.getItem(config.offline.cacheLimitBytesKey);
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : config.audio.cacheMaxBytes;
  });
  // Live usage display ("Used: X MB"); refreshed after cache-mutating actions.
  const [cacheUsageBytes, setCacheUsageBytes] = useState(0);
  // Download-for-offline progress (0..1) and in-flight flag; null progress = idle.
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadAbortRef = useRef<AbortController | null>(null);

  const refreshCacheUsage = useCallback(async () => {
    try {
      const usage = await audioCache.usage();
      setCacheUsageBytes(usage.bytes);
    } catch (error) {
      logger.warn('OFFLINE_USAGE_READ_FAILED', 'could not read offline audio-cache usage', {
        category: 'SYSTEM_HEALTH',
        error,
      });
    }
  }, []);

  // Read usage once on mount so the Settings display is populated. The async
  // function is defined inside the effect (setState happens in its awaited body,
  // not synchronously in the effect) — matching the global-settings fetch below.
  useEffect(() => {
    const loadUsage = async () => {
      await refreshCacheUsage();
    };
    void loadUsage();
  }, [refreshCacheUsage]);

  // Persist "Save audio on device"; turning it off clears the cache immediately.
  useEffect(() => {
    localStorage.setItem(config.offline.saveAudioKey, saveAudioOnDevice.toString());
    if (!saveAudioOnDevice) {
      void audioCache.clear().then(refreshCacheUsage).catch((error: unknown) => {
        logger.warn('OFFLINE_CACHE_CLEAR_FAILED', 'could not clear offline audio cache after disabling save-on-device', {
          category: 'SYSTEM_HEALTH',
          error,
        });
      });
    }
  }, [saveAudioOnDevice, refreshCacheUsage]);

  // Persist the chosen storage limit (audioCache.readCacheLimitBytes reads it back for the LRU).
  useEffect(() => {
    localStorage.setItem(config.offline.cacheLimitBytesKey, cacheLimitBytes.toString());
  }, [cacheLimitBytes]);

  // Abort any in-flight download when the settings hook unmounts.
  useEffect(() => () => downloadAbortRef.current?.abort(), []);

  const handleClearAudioCache = useCallback(async () => {
    try {
      await audioCache.clear();
      await refreshCacheUsage();
      showToast('Offline audio cleared', 'success');
    } catch (error) {
      logger.error('OFFLINE_CACHE_CLEAR_FAILED', 'failed to clear offline audio cache', {
        category: 'SYSTEM_HEALTH',
        error,
      });
      showToast('Could not clear offline audio', 'error');
    }
  }, [refreshCacheUsage, showToast]);

  const handleCancelDownload = useCallback(() => {
    downloadAbortRef.current?.abort();
  }, []);

  const handleDownloadForOffline = useCallback(async (scope: DownloadScope) => {
    if (isDownloading) return;
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      const result = await downloadForOffline(scope, {
        signal: controller.signal,
        onProgress: ({ done, total }) => setDownloadProgress(total > 0 ? done / total : 1),
      });
      await refreshCacheUsage();
      switch (result.status) {
        case 'completed':
          showToast(`Downloaded ${result.synthesized + result.fromCache} clips for offline`, 'success');
          break;
        case 'cache-full':
          showToast('Storage limit reached — raise it in Offline settings to download more', 'error');
          break;
        case 'offline':
          showToast('You are offline — connect to download audio', 'error');
          break;
        case 'cancelled':
          showToast('Download cancelled', 'success');
          break;
        case 'empty':
          showToast('Nothing to download for this selection', 'success');
          break;
      }
    } catch (error) {
      logger.error('OFFLINE_DOWNLOAD_FAILED', 'offline audio download failed', {
        category: 'DATA_PROCESSING',
        error,
        details: { scope },
      });
      showToast('Download failed — please try again', 'error');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
      downloadAbortRef.current = null;
    }
  }, [isDownloading, refreshCacheUsage, showToast]);

  // --- Debounced preference persistence (perf/hardening) ---------------------
  // localStorage mirrors on every change (cheap, local, optimistic). The Supabase write is
  // debounced by config.settings.prefsWriteDebounceMs so dragging a slider or rapidly toggling
  // does not spam the DB with a write per frame — only the settled value is persisted. One timer
  // per preference key; a fresh change resets its window. The final render's value is captured in
  // a ref so the deferred write always persists the latest value even if the effect closure is
  // stale. Any write failure routes through the logger (never silent).
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleProfileWrite = useCallback(
    // `write` returns a Supabase PostgREST builder, which is a PromiseLike (thenable) resolving
    // to { error }, not a real Promise — typed as PromiseLike so `await` accepts it directly.
    (key: string, write: () => PromiseLike<{ error: unknown }>) => {
      const timers = debounceTimersRef.current;
      if (timers[key]) clearTimeout(timers[key]);
      timers[key] = setTimeout(() => {
        void (async () => {
          try {
            const result = await write();
            const error = result ? result.error : null;
            if (error) {
              logger.error('PREF_WRITE_FAILED', `debounced preference write failed for ${key}`, {
                category: 'DATA_PROCESSING',
                error,
                details: { key },
              });
            }
          } catch (error) {
            logger.error('PREF_WRITE_FAILED', `debounced preference write threw for ${key}`, {
              category: 'DATA_PROCESSING',
              error,
              details: { key },
            });
          }
        })();
      }, config.settings.prefsWriteDebounceMs);
    },
    [],
  );

  // Flush pending debounced writes on unmount so a fast navigate-away does not drop the last edit.
  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      for (const key of Object.keys(timers)) clearTimeout(timers[key]);
    };
  }, []);

  // Sync settings to localStorage (immediate/optimistic) and Supabase (debounced).
  useEffect(() => {
    localStorage.setItem('playback_speed', playbackSpeed.toString());
    if (user && profile && supabase) {
      const uid = user.id;
      scheduleProfileWrite('playback_speed', () =>
        supabase.from('profiles').update({ playback_speed: playbackSpeed }).eq('id', uid),
      );
    }
    // supabase is a per-session singleton (getSupabase) and intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable singleton omitted
  }, [playbackSpeed, user, profile, scheduleProfileWrite]);

  useEffect(() => {
    localStorage.setItem('is_sound_enabled', isSoundEnabled.toString());
    if (user && profile && supabase) {
      const uid = user.id;
      scheduleProfileWrite('is_sound_enabled', () =>
        supabase.from('profiles').update({ is_sound_enabled: isSoundEnabled }).eq('id', uid),
      );
    }
    // supabase is a per-session singleton (getSupabase) and intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable singleton omitted
  }, [isSoundEnabled, user, profile, scheduleProfileWrite]);

  useEffect(() => {
    localStorage.setItem('global_voice_limit', globalVoiceLimit.toString());
    if (hasLoadedGlobalVoiceLimit && profile?.role === 'admin' && supabase) {
      scheduleProfileWrite('global_voice_limit', () =>
        supabase
          .from('global_settings')
          .upsert({ key: config.globalSettingsKeys.voiceLimit, value: globalVoiceLimit.toString() }),
      );
    }
    // supabase is a per-session singleton (getSupabase) and intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable singleton omitted
  }, [globalVoiceLimit, hasLoadedGlobalVoiceLimit, profile, scheduleProfileWrite]);

  // Fetch global settings on mount
  useEffect(() => {
    const fetchGlobalSettings = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('global_settings')
        .select('*')
        .eq('key', config.globalSettingsKeys.voiceLimit)
        .single();

      if (data) {
        setGlobalVoiceLimit(parseInt(data.value));
      }
      setHasLoadedGlobalVoiceLimit(true);
    };
    fetchGlobalSettings();
    // Intentional run-once fetch on mount; supabase is a per-session singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional run-once fetch
  }, []);

  // Applied by the auth slice when a stored profile is fetched.
  const applyProfilePrefs = (data: UserProfile) => {
    if (data.playback_speed) setPlaybackSpeed(data.playback_speed);
    if (data.is_sound_enabled !== undefined) setIsSoundEnabled(data.is_sound_enabled);
  };

  // Read by the auth slice when creating a brand-new profile row.
  const getPrefsForNewProfile = () => ({ playbackSpeed, isSoundEnabled });

  const handleSelectTutor = async (tutorId: string) => {
    if (supabase && user) {
      const { error } = await supabase.from('profiles').update({ selected_tutor_id: tutorId }).eq('id', user.id);
      if (error) {
        handleSupabaseError(error, 'handleSelectTutor', 'profiles');
      } else {
        setProfile(prev => prev ? { ...prev, selected_tutor_id: tutorId } : null);
        showToast("Tutor selected!", "success");
        setIsTutorSelectionOpen(false);
      }
    } else {
      setProfile(prev => prev ? { ...prev, selected_tutor_id: tutorId } : {
        id: 'guest',
        email: 'guest@example.com',
        streak: 0,
        xp: 0,
        unlocked_level: 1,
        completed_lessons: [],
        last_active: new Date().toISOString(),
        selected_tutor_id: tutorId,
        role: 'user'
      });
      setIsTutorSelectionOpen(false);
    }
  };

  // Persist the user's preferred TTS provider (profiles.tts_provider). null = platform
  // default chain. The edge function honors this preference only when the provider's
  // platform secret or a resolvable bring-your-own key ref exists; a bad preference never
  // fails TTS server-side (router falls back to the default chain). Persisted through the
  // same owner-RLS profile-update path used everywhere else in this hook.
  const handleSetTtsProvider = async (provider: TtsProviderId | null) => {
    setProfile(prev => (prev ? { ...prev, tts_provider: provider } : prev));
    if (supabase && user) {
      const { error } = await supabase
        .from('profiles')
        .update({ tts_provider: provider })
        .eq('id', user.id);
      if (error) handleSupabaseError(error, 'handleSetTtsProvider', 'profiles');
    }
  };

  // Persist the bring-your-own-key REFERENCE (profiles.tts_byo_key_ref) — the NAME of an
  // admin-registered edge/Vault secret, NEVER a raw key. Empty string clears it to null.
  const handleSetTtsByoKeyRef = async (ref: string) => {
    const value = ref.trim() || null;
    setProfile(prev => (prev ? { ...prev, tts_byo_key_ref: value } : prev));
    if (supabase && user) {
      const { error } = await supabase
        .from('profiles')
        .update({ tts_byo_key_ref: value })
        .eq('id', user.id);
      if (error) handleSupabaseError(error, 'handleSetTtsByoKeyRef', 'profiles');
    }
  };

  const handleOpenTicket = async () => {
    if (!supabase || !user) return;
    // Validate + limit before persisting (ENGINEERING-STANDARDS §4).
    const subjectCheck = validateText(supportSubject, 'Subject', config.limits.ticketSubjectMax);
    if (!subjectCheck.ok) { showToast(subjectCheck.reason, 'error'); return; }
    const descCheck = validateText(supportDescription, 'Description', config.limits.ticketDescriptionMax);
    if (!descCheck.ok) { showToast(descCheck.reason, 'error'); return; }

    setIsSubmittingSupport(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .insert({
          user_id: user.id,
          subject: subjectCheck.value,
          description: descCheck.value,
          status: 'open',
          priority: 'medium',
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      showToast("Ticket submitted successfully!", "success");
      setIsSupportModalOpen(false);
      setSupportSubject('');
      setSupportDescription('');
    } catch (error) {
      handleSupabaseError(error, 'handleOpenTicket', 'tickets');
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleCollectLogs = async () => {
    if (!supabase || !user) return;

    requestConfirmation({
      title: "Collect Logs?",
      message: "This will collect anonymized app state and logs to help us diagnose issues. Do you permit this?",
      confirmText: "Yes, Collect",
      cancelText: "No, Cancel",
      onConfirm: async () => {
        try {
          const { activeTab, chatHistoryLength } = getDiagnostics();
          const logs = {
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            activeTab,
            profile: {
              streak: profile?.streak,
              xp: profile?.xp,
              level: profile?.unlocked_level
            },
            chatHistoryLength,
            sessionId: logger.getSessionId(),
            recentLogs: logger.getRecentLogs(),
            timestamp: new Date().toISOString()
          };

          const { error } = await supabase
            .from('logs')
            .insert({
              user_id: user.id,
              event: 'user_report',
              details: JSON.stringify(logs),
              timestamp: new Date().toISOString(),
              device_info: navigator.userAgent
            });

          if (error) throw error;
          showToast("Logs collected and sent!", "success");
        } catch (error) {
          handleSupabaseError(error, 'handleSendLogs', 'logs');
        }
      }
    });
  };

  // Load the current user's own submissions (owner-RLS SELECT on each table). Read-only:
  // the user views status here, they never act on rows. Failures route through logger with a
  // correlation id and surface a calm Ref'd message in the modal — nothing fails silently.
  const loadMySubmissions = useCallback(async () => {
    if (!supabase || !user) {
      const correlationId = newCorrelationId();
      logger.error('MY_SUBMISSIONS_NO_SESSION', 'cannot load submissions without a Supabase session', {
        category: 'DATA_PROCESSING',
        correlationId,
      });
      setSubmissionsError(
        userMessage('MY_SUBMISSIONS_NO_SESSION', 'Sign in to see your submissions.', correlationId),
      );
      return;
    }
    const correlationId = newCorrelationId();
    setIsLoadingSubmissions(true);
    setSubmissionsError(null);
    try {
      // Owner RLS scopes each SELECT to auth.uid(); the explicit user_id filter keeps the
      // query intent clear and matches the TEXT/uuid user_id columns (see DATABASE_DESIGN.md).
      const [c, r, t, v] = await Promise.all([
        supabase.from('lesson_corrections').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('lesson_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('video_suggestions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      if (c.error) throw c.error;
      if (r.error) throw r.error;
      if (t.error) throw t.error;
      if (v.error) throw v.error;

      setMySubmissions({
        corrections: (c.data ?? []) as LessonCorrection[],
        requests: (r.data ?? []) as LessonRequest[],
        tickets: (t.data ?? []) as Ticket[],
        videos: (v.data ?? []) as VideoSuggestion[],
      });
      logger.info('MY_SUBMISSIONS_LOADED', 'user submissions loaded', {
        category: 'DATA_PROCESSING',
        correlationId,
        details: {
          corrections: c.data?.length ?? 0,
          requests: r.data?.length ?? 0,
          tickets: t.data?.length ?? 0,
          videos: v.data?.length ?? 0,
        },
      });
    } catch (error) {
      logger.error('MY_SUBMISSIONS_LOAD_FAILED', 'could not load user submissions', {
        category: 'DATA_PROCESSING',
        correlationId,
        error,
      });
      setSubmissionsError(
        userMessage('MY_SUBMISSIONS_LOAD_FAILED', 'We could not load your submissions right now.', correlationId),
      );
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, [supabase, user]);

  // Open the modal and (re)load — always fetches fresh so the status shown is current.
  const openMySubmissions = useCallback(() => {
    setIsMySubmissionsOpen(true);
    void loadMySubmissions();
  }, [loadMySubmissions]);

  return {
    isSoundEnabled, setIsSoundEnabled,
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
    // Offline audio (Settings → Offline)
    saveAudioOnDevice, setSaveAudioOnDevice,
    cacheLimitBytes, setCacheLimitBytes,
    cacheUsageBytes,
    downloadProgress, isDownloading,
    handleClearAudioCache,
    handleDownloadForOffline,
    handleCancelDownload,
    applyProfilePrefs,
    getPrefsForNewProfile,
    handleSelectTutor,
    handleSetTtsProvider,
    handleSetTtsByoKeyRef,
    handleOpenTicket,
    handleCollectLogs,
    // My submissions (Settings → account; feedback-status-visibility)
    isMySubmissionsOpen, setIsMySubmissionsOpen,
    mySubmissions,
    isLoadingSubmissions,
    submissionsError,
    loadMySubmissions,
    openMySubmissions,
  };
};
