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
import { focusControl } from '../../lib/focusControl';
import { validateText } from '../../lib/validation';

/**
 * TB-8: decide whether an admin edit of the global voice limit should be persisted to
 * global_settings. Persist ONLY when the caller is an admin AND the current value differs from the
 * authoritative server value. Returning false for value === serverValue is what prevents load and
 * profile-identity-churn effect re-runs from re-writing a stale/display value and clobbering the
 * server setting (the 50 -> 20 reset). Pure + exported for regression testing.
 */
export function shouldPersistGlobalVoiceLimit({
  isAdmin,
  currentValue,
  serverValue,
}: {
  isAdmin: boolean;
  currentValue: number;
  serverValue: number | null;
}): boolean {
  return isAdmin && currentValue !== serverValue;
}

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

/**
 * TB-5: resolve the initial tutor read-aloud preference. Defaults OFF (opt-in) when there is no
 * saved value, so a new user is not auto-read to; a stored preference is respected. (A profile
 * value, when present, is applied later by the settings load and overrides this seed.)
 */
export const initialSoundEnabled = (saved: string | null): boolean =>
  saved !== null ? saved === 'true' : false;

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
  // TB-5: tutor read-aloud defaults OFF (opt-in). Auto-reading every tutor message aloud surprised
  // users ("it reads all out loud regardless if I want to"); the Mute/Unmute toggle re-enables it,
  // and the per-message play buttons give audio on demand. A saved preference is still respected.
  const [isSoundEnabled, setIsSoundEnabled] = useState(() =>
    initialSoundEnabled(localStorage.getItem('is_sound_enabled')),
  );
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = localStorage.getItem('playback_speed');
    return saved ? parseFloat(saved) : config.audio.defaultPlaybackSpeed;
  });
  const [globalVoiceLimit, setGlobalVoiceLimit] = useState(() => {
    const saved = localStorage.getItem('global_voice_limit');
    return saved ? parseInt(saved) : config.voice.defaultDailyVoiceLimit;
  });
  const [hasLoadedGlobalVoiceLimit, setHasLoadedGlobalVoiceLimit] = useState(false);
  // TB-8: the authoritative server value from the last successful fetch/write. The admin write-back
  // only fires when globalVoiceLimit DIFFERS from this — otherwise load + profile-identity churn
  // would re-persist a display/stale value and clobber the server setting (e.g. reset 50 -> 20).
  const serverVoiceLimitRef = useRef<number | null>(null);
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
      // Total device audio = ephemeral cache + durable saved store (EN-8). Both the "Clear cache"
      // action (reduces the cache part) and turning off "Save audio on device" (reduces the saved
      // part) visibly lower this number, so the display stays honest for both operations.
      const [cache, saved] = await Promise.all([audioCache.usage(), audioCache.pinnedUsage()]);
      setCacheUsageBytes(cache.bytes + saved.bytes);
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

  // Persist "Save audio on device". Turning it OFF is the explicit "delete my saved audio" action
  // (owner 2026-07-17): it clears the DURABLE saved store — NOT the ephemeral cache (that is the
  // separate "Clear cache" action / logout). Future curated plays route to the cache instead of the
  // saved store because synthesizeCached reads this flag at write time. The two are never conflated.
  useEffect(() => {
    localStorage.setItem(config.offline.saveAudioKey, saveAudioOnDevice.toString());
    if (!saveAudioOnDevice) {
      void audioCache.clearPinned().then(refreshCacheUsage).catch((error: unknown) => {
        logger.warn('OFFLINE_SAVED_CLEAR_FAILED', 'could not delete saved audio after turning off save-on-device', {
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
          // Inform + take the user to the control (owner 2026-07-17): scroll to + highlight the
          // storage-limit selector so they can raise it. Downloads are never evicted to make room —
          // when the store is full of downloads, raising the limit is the only way to fit more.
          showToast("You're out of offline space — raise the storage limit to download more", 'error');
          void focusControl('storage-limit');
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
    // TB-8: do NOT persist/reflect the provisional default (config 5) before the server value has
    // loaded — otherwise the initial render clobbers localStorage with 5, so the client keeps
    // showing 5 instead of the configured global limit (verified server value: 20). Only persist
    // once the authoritative value is loaded; then localStorage always matches the server.
    if (!hasLoadedGlobalVoiceLimit) return;
    localStorage.setItem('global_voice_limit', globalVoiceLimit.toString());
    // TB-8: persist to global_settings ONLY when an admin has actually CHANGED the value from the
    // authoritative server value — never on load or on profile-identity churn (which would re-write
    // a stale/display value and clobber the server setting). Update the ref so a subsequent effect
    // run for the same value doesn't re-write.
    if (
      supabase &&
      shouldPersistGlobalVoiceLimit({
        isAdmin: profile?.role === 'admin',
        currentValue: globalVoiceLimit,
        serverValue: serverVoiceLimitRef.current,
      })
    ) {
      serverVoiceLimitRef.current = globalVoiceLimit;
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
      const { data, error } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', config.globalSettingsKeys.voiceLimit)
        .maybeSingle();

      // TB-8: do NOT mark loaded on a failed/empty fetch. If we marked loaded without an
      // authoritative value, the write-back effect could persist the stale localStorage/default
      // value and clobber the server setting. A miss leaves the client on its provisional value
      // but never writes it back.
      if (error) {
        logger.error('global_settings_fetch_failed', 'global_settings voice_limit fetch failed', {
          category: 'SYSTEM_HEALTH',
          error,
        });
        return;
      }
      const parsed = data ? parseInt(data.value, 10) : NaN;
      if (Number.isFinite(parsed)) {
        setGlobalVoiceLimit(parsed);
        serverVoiceLimitRef.current = parsed;
        setHasLoadedGlobalVoiceLimit(true);
      }
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

  // Read by the auth slice when creating a brand-new profile row. SEC-3: a brand-new profile must
  // inherit device DEFAULTS, never the CURRENT device prefs — otherwise user B's first profile (a
  // fresh signup on a shared device) mirrors user A's playback speed / sound setting. Defence-in-depth
  // alongside the auth-slice device-owner cleanup (which resets prefs before a switched-in user loads).
  const getPrefsForNewProfile = () => ({
    playbackSpeed: config.audio.defaultPlaybackSpeed,
    isSoundEnabled: initialSoundEnabled(null),
  });

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

  // SEC-2: reset device-persisted user preferences to their defaults on logout so the next user
  // on a shared device never inherits them. The persist effects re-write the defaults to
  // localStorage; the DB profile stays authoritative and re-applies the next user's prefs on
  // login (applyProfilePrefs), and a brand-new profile is seeded from these defaults (not the
  // previous user's values). Runs after user/profile are cleared, so no profile write leaks.
  const resetForLogout = useCallback(() => {
    setIsSoundEnabled(initialSoundEnabled(null));
    setPlaybackSpeed(config.audio.defaultPlaybackSpeed);
    setGlobalVoiceLimit(config.voice.defaultDailyVoiceLimit);
    setHasLoadedGlobalVoiceLimit(false);
    setSaveAudioOnDevice(true);
    setCacheLimitBytes(config.audio.cacheMaxBytes);
  }, []);

  return {
    resetForLogout,
    isSoundEnabled, setIsSoundEnabled,
    playbackSpeed, setPlaybackSpeed,
    globalVoiceLimit, setGlobalVoiceLimit,
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
