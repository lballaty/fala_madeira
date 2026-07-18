// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/config.ts
// Description: Single home for behavioral tunables and feature flags (ENGINEERING-STANDARDS §7).
//   Timeouts, retry/queue sizes, audio defaults, voice limits, global_settings key names, and
//   daily-session template placeholders live here — no numeric/string literals with behavioral
//   meaning scattered in features. Server-controlled values (daily voice limit, level unlock
//   key) live in the `global_settings` table; this module only names their keys and client-side
//   defaults. Secrets never live here (the unlock key is DB-only per §7).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

export const config = {
  ui: {
    /** Toast auto-dismiss delay (useToast). */
    toastDismissMs: 3000,
  },

  tutor: {
    /** Silence window before the AI tutor sends a friendly re-prompt (useTutorSession). */
    inactivityPromptMs: 45000,
  },

  audio: {
    /** Server TTS returns raw PCM at this rate (24kHz mono s16le) — must match the edge function. */
    ttsSampleRateHz: 24000,
    /** Default TTS playback speed when the user has no stored preference. */
    defaultPlaybackSpeed: 1.0,
    /**
     * Cap on the NUMBER of cached TTS clips in the platform blob store. Enforced by
     * the bounded LRU in the StorageAdapter (setBlob evicts least-recently-used clips
     * when a write would breach this). One dimension of the bound; cacheMaxBytes is
     * the other — whichever is hit first triggers eviction.
     */
    cacheMaxEntries: 500,
    /**
     * Default cap on the total BYTES of cached TTS clips (the user can raise/lower it
     * in Settings → Offline; the chosen value is persisted and passed to setBlob as the
     * LRU byte budget). 50 MB default ≈ a few hundred short clips at 24kHz mono s16le.
     */
    cacheMaxBytes: 50 * 1024 * 1024,
    /**
     * Storage-limit options offered by the Settings → Offline "Storage limit" selector
     * (bytes). The user's choice becomes the LRU byte budget. Mirrors the v3 mockup
     * (which showed a 200 MB option); ordered smallest → largest.
     */
    cacheLimitOptionsBytes: [25 * 1024 * 1024, 50 * 1024 * 1024, 100 * 1024 * 1024, 200 * 1024 * 1024],
    /**
     * EN-8 server audio tier. `verpexBase` is the base path the client GETs pre-hosted clips from
     * (Verpex serves REMOTE_PATH/audio/<keyToServerPath> statically, same-origin by default);
     * `supabaseAudioBucket` is the public Storage bucket that buffers clips before the Verpex cron
     * copies them. Read only on the server-tier MISS path in geminiService.synthesizeCached
     * (device cache → pinned → verpex → supabase → configured provider). Both tiers are optional:
     * until the operator deploys the server side, fetches simply miss and playback reaches the
     * provider unchanged. VITE_AUDIO_VERPEX_BASE overrides the base for non-standard hosting.
     */
    // Optional-chain `env` so this module stays import-safe outside Vite (e.g. Playwright's Node
    // collection context, where `import.meta.env` is undefined) — an unguarded read throws at load
    // and takes down every spec that transitively imports config. In Vite `env` is always defined.
    verpexBase: (import.meta.env?.VITE_AUDIO_VERPEX_BASE as string | undefined) || '/audio',
    supabaseAudioBucket: 'tts-audio',
    /**
     * Per-tier timeout (ms) for a server-audio GET (Verpex, then Supabase). Deliberately SHORT and
     * separate from net.requestTimeoutMs (15s, tuned for slow AI generation): a hosted static PCM
     * file returns in well under this, so a slow/hanging tier aborts fast and playback falls through
     * to the next tier / the provider instead of stalling. Worst case on a double hang ≈ 2× this.
     */
    serverTierTimeoutMs: 4000,
  },

  net: {
    // Bounded exponential-backoff-with-jitter policy for network/AI calls that lack their own
    // retry (ENGINEERING-STANDARDS §5). Applied by src/lib/retry.ts to the edge-function choke
    // point (geminiService.invokeEdgeFunction) — the sync queue and content repository run their
    // own tick-driven retry and are intentionally left to it (no double retry).
    /** Max attempts (1 = the initial try, no retry). 3 = initial + 2 retries. */
    maxAttempts: 3,
    /** Base delay before the first retry (ms); doubles each subsequent attempt. */
    baseDelayMs: 400,
    /** Hard ceiling on any single backoff wait (ms) so a long chain never stalls the UI. */
    maxDelayMs: 4000,
    /** Full-jitter fraction (0..1): actual wait = backoff * (1 - jitter*random). */
    jitterRatio: 0.5,
    /**
     * Per-attempt request timeout (ms) for the edge-function choke point. supabase.functions.invoke
     * has no default timeout, so a stalled fetch (cold start, slow generation, flaky mobile network)
     * would hang forever — leaving spinners (e.g. vocab lookup) spinning and the awaiting `finally`
     * never running. AbortSignal.timeout aborts each attempt so the promise always settles; withRetry
     * then retries (transient) or surfaces the error. 15s is generous over the ~4s typical translate.
     */
    requestTimeoutMs: 15000,
  },

  settings: {
    /**
     * Debounce window (ms) for persisting a slider/toggle preference to Supabase
     * (useSettings). Dragging a slider updates local state instantly (optimistic) but
     * only writes the DB once the value settles for this long — one write, not a spam
     * of writes per drag frame. localStorage still mirrors on every change (cheap, local).
     */
    prefsWriteDebounceMs: 600,
  },

  limits: {
    // Length/shape limits for user-submitted free text (ENGINEERING-STANDARDS §4 — validate
    // inputs before they hit the DB / edge functions). Enforced client-side by
    // src/lib/validation.ts and mirrored by server-side edge-function validation. Trim +
    // reject-empty + max-length; never silently truncate a submission the user can't see.
    /** Tutor/chat message the learner types (free chat + practice modal input). */
    tutorMessageMax: 2000,
    /** Correction report text (learning → correction modal). */
    correctionTextMax: 2000,
    /** Lesson-request theme (short one-liner). */
    requestThemeMax: 200,
    /** Lesson-request description. */
    requestDescMax: 2000,
    /** Support-ticket subject. */
    ticketSubjectMax: 200,
    /** Support-ticket description. */
    ticketDescriptionMax: 4000,
    /** Video-suggestion note. */
    suggestionNoteMax: 1000,
    /** Video-suggestion / any URL field. */
    urlMax: 2048,
    /** Vocabulary lookup query (single word / short phrase). */
    vocabQueryMax: 100,
  },

  offline: {
    /** localStorage key: whether TTS clips are saved on device ("Save audio on device"). */
    saveAudioKey: 'offline_save_audio',
    /** localStorage key: the user's chosen blob-cache byte budget (LRU limit). */
    cacheLimitBytesKey: 'offline_cache_limit_bytes',
    /**
     * Hard ceiling on how many text lines a single "Download for offline" run will
     * synthesize, regardless of scope size — a guard against an accidental whole-catalog
     * download. The run also stops early if the cache byte budget is reached.
     */
    maxDownloadLines: 2000,
    /**
     * EN-7 resilience: per-clip retry for transient synthesis failures (429/503/network/
     * timeout) so a large "Download for offline" run stops failing wholesale. `downloadMaxAttempts`
     * is total tries per clip (1 = no retry); backoff is exponential from `downloadRetryBaseMs`.
     */
    downloadMaxAttempts: 3,
    downloadRetryBaseMs: 800,
  },

  voice: {
    /**
     * Client-side default for the daily voice-practice limit when neither the profile
     * (`profiles.voice_limit`) nor the server value (`global_settings.voice_limit`) has
     * loaded yet. The server value is authoritative once fetched (useSettings).
     */
    defaultDailyVoiceLimit: 5,
  },

  logging: {
    /** In-memory ring buffer feeding the diagnostic-logs UI (logger tier a). */
    ringBufferMax: 200,
    /** Bounded ERROR/CRITICAL persistence queue → public.logs (logger tier b). */
    persistQueueMax: 100,
    /** Timer-driven flush interval for the persistence queue. */
    flushIntervalMs: 15000,
    /** Queue depth that triggers an immediate flush ahead of the timer. */
    flushBatchTrigger: 10,
  },

  /**
   * Key names of server-controlled rows in `public.global_settings` (key text PK, value text).
   * Values are managed in the DB (admin RLS) — the client only reads them by these keys.
   */
  globalSettingsKeys: {
    /** Daily voice-practice limit applied to non-premium users. */
    voiceLimit: 'voice_limit',
    /**
     * Level unlock access key. Seeded by supabase/migrations/00005_global_settings_seed.sql;
     * the operator rotates it in the DB. Never hardcode a key (or fallback key) in src/ —
     * if this row is unreachable, unlock is DENIED (useLessons.handleUnlockLevel).
     */
    levelUnlockKey: 'level_unlock_key',
  },

  srs: {
    /** SM-2 starting ease factor for a brand-new mastery item (mirrors mastery_items.ease DEFAULT). */
    initialEase: 2.5,
    /** SM-2 floor for the ease factor (classic SM-2 minimum EF). */
    minEase: 1.3,
    /** Interval after the first successful repetition — and after any failed recall (days). */
    firstIntervalDays: 1,
    /** Interval after the second consecutive successful repetition (days). */
    secondIntervalDays: 6,
    /** Minimum grade (0–5) that counts as a successful recall; below this repetitions reset. */
    passingGrade: 3,
    /** Grade recorded for the 'avoid' dimension when a situation is skipped/abandoned. */
    avoidanceGrade: 0,
    /** Default cap on items returned by selectDueItems / useDueItems. */
    defaultDueLimit: 20,
    /** How many weakest items dimensionSummary reports per dimension (Coach §6b input). */
    summaryWeakestCount: 3,
  },

  vocabulary: {
    // Vocabulary reinforcement quiz (EN-18) tunables. Comprehension reuses the EN-10 fuzzy
    // matcher (no config); production adds a spoken "now say it" step gated on mic availability.
    /** BCP-47 tag for the spoken-production step (European Portuguese, per CONTENT-STANDARDS). */
    recognitionLanguage: 'pt-PT',
    /** One-shot recognize() budget for the "now say it" production step (ms). */
    recognizeTimeoutMs: 8000,
  },

  coach: {
    // The Coach / Insights engine (docs/CONTENT-ARCHITECTURE.md §6b) tunables. Scoring =
    // weakness severity × goal-relevance × review urgency × recency/avoidance. All behavioral
    // multipliers/thresholds live here (no magic numbers in src/lib/coach.ts).

    /** Top N focus suggestions rankFocus returns; the Home Focus card shows the top 1–3. */
    maxSuggestions: 3,
    /** Neutral-low severity for a dimension/situation with no tracked items yet. */
    emptyDimensionSeverity: 0.2,
    /** A dimension must reach this severity (or have due items) to surface as a suggestion. */
    minDimensionSeverity: 0.6,
    /** A situation must reach this accumulated weakness (or be due/avoided) to surface. */
    minSituationWeakness: 1.0,
    /** Goal-relevance multiplier when content serves the learner's active track. */
    goalRelevanceBoost: 1.5,
    /** Review-urgency added per due item (sub-linear via the cap below). */
    urgencyPerDueItem: 0.15,
    /** Cap on the review-urgency boost so a large backlog does not dominate. */
    maxUrgencyBoost: 1.5,
    /** Recency: a situation is "stale" after this many days untouched. */
    staleAfterDays: 3,
    /** Recency boost added per stale day past the threshold. */
    recencyPerStaleDay: 0.1,
    /** Cap on the recency boost (bounded resurfacing). */
    maxRecencyBoost: 1.0,
    /** Boost applied when content was skipped/abandoned (the 'avoid' behavior signal). */
    avoidanceBoost: 0.8,
    /** Small boost for never-practiced content (new content is expected to be new). */
    neverPracticedBoost: 0.3,
    /** Damp completed-situation suggestions (favor forward motion, softly — never a gate). */
    completedDamp: 0.5,
    /** Engine each mastery dimension routes into (§3 engines table). */
    dimensionEngine: {
      hear: 'listening',
      say: 'speaking',
      retrieve: 'vocabulary',
      avoid: 'simulator',
    } as Record<'hear' | 'say' | 'retrieve' | 'avoid', string>,
    /** Engine an avoided situation routes into (face the scenario in a low-pressure roleplay). */
    avoidedEngine: 'simulator',
    /** Default engine a situation-focus suggestion opens (listening warmup entry). */
    situationEntryEngine: 'listening',
    /** Max chips per column (strengths / shaky) in the after-session recap. */
    recapMaxChips: 4,
    /** Minimum per-dimension ease gain across the week to count as "improved". */
    weeklyImprovementThreshold: 0.05,
    /** How many weakest dimensions the weekly insight names as next focus. */
    weeklyNextFocusCount: 2,
    /** How many days of history the weekly insight aggregates over. */
    weeklyWindowDays: 7,
  },

  sync: {
    /** platform.storage KV key holding the durable offline write queue (src/lib/sync-queue.ts). */
    storageKey: 'sync:queue',
    /**
     * Bounded queue depth for the offline write queue. When exceeded, the oldest
     * entries are dropped with a WARN (never silent) — see CONTENT-ARCHITECTURE §10.
     * Sized for a long offline session of progress/mastery/mission writes.
     */
    maxQueueEntries: 500,
  },

  dailySession: {
    // The daily-session template (docs/CONTENT-ARCHITECTURE.md §5) as CONFIGURABLE DATA:
    // the ~30-min voice-first session is an ordered list of segments, each mapping to a
    // practice engine (registry.ts mode id) for a target number of minutes. The Adaptive
    // Guided path (src/paths/adaptive-guided.ts) reads this array to build sessionPlan() —
    // changing the methodology (durations/segments/order) is a config edit, not code. The
    // 6 segments + durations mirror the §5 template (3+5+7+10+5+2 = 32 min) and the
    // intended-ui-v3 SEGS array. `engineId` values are registry.ts PracticeMode ids so the
    // session player can sequence straight into the existing engines.
    template: [
      { engineId: 'listening', label: 'Listening warmup', minutes: 3 },
      { engineId: 'speaking', label: 'Shadowing', minutes: 5 },
      { engineId: 'patterns', label: 'Pattern drill', minutes: 7 },
      { engineId: 'simulator', label: 'Roleplay', minutes: 10 },
      { engineId: 'vocabulary', label: 'Review', minutes: 5 },
      { engineId: 'missions', label: 'Real-world mission', minutes: 2 },
    ],
    /** Legacy placeholders kept for the review/new item budgets the composer may pass on. */
    targetDurationMinutes: 32,
    reviewItemCount: 5,
    newItemCount: 3,
  },

  paths: {
    /**
     * localStorage / profile key mirror for the chosen learning path + its cursor
     * (src/paths/index.ts). The active track is authoritative in user_track_selection
     * (migration 00006); the structured-course cursor (month/day) and the chosen path
     * type persist here so the choice survives reload before the profile round-trips.
     */
    selectionStorageKey: 'paths:selection',
    /** Default path for a user who has not chosen one yet (the tutor default, §5). */
    defaultPathType: 'adaptive-guided',
    /** Structured Course starts at month 1 / day 1 (legacy calendar origin). */
    structuredStartMonth: 1,
    structuredStartDay: 1,
  },

  home: {
    // Home dashboard tunables (U7/U8/FB4/G1 — docs/ui-mockup/intended-ui-v3.html Home).
    // The progress ring, competence line, streak + streak-freeze grace read these; no
    // behavioral literals live in HomeView / useHome.

    /**
     * Streak-freeze grace (§12 — calm/honest, never manipulative). A missed day
     * consumes one freeze instead of breaking the streak. No profiles column exists
     * for a freeze balance (docs/DATABASE_DESIGN.md profiles has `streak` + `last_active`
     * only), so the balance + last-reconciliation persist to the durable client store
     * keyed per user: `${freezeStorageKeyPrefix}${userId}`. DOCUMENTED SEAM: promote to a
     * profiles column later without changing the UI — only useHome's reader/writer changes.
     */
    freezeStorageKeyPrefix: 'home:streak-freeze:',
    /** Starting freeze balance a learner has (mirrors the v3 mockup's "❄️ 2 freezes"). */
    startingFreezeCount: 2,
    /** Hard cap on banked freezes (bounded — no runaway hoarding). */
    maxFreezeCount: 5,
    /**
     * Largest gap (in days) a freeze balance will bridge in one return. A gap wider than
     * this is an honest streak reset (freezes are a grace for the occasional missed day,
     * not an indefinite pause). One freeze is spent per missed day up to the balance.
     */
    maxFreezeBridgeDays: 5,
    /** Max competence phrases the "You can now…" line shows (honest, specific, not noise). */
    competenceMaxPhrases: 3,
    /** Below this many completed situations the competence line shows encouraging fallback copy. */
    competenceMinCompleted: 1,
  },

  onboarding: {
    /**
     * platform.storage KV key PREFIX for the first-run onboarding record
     * (src/features/onboarding). No dedicated profiles column exists for
     * onboarding-complete or placement (docs/DATABASE_DESIGN.md profiles has
     * consent flags only), so the completion flag + chosen placement level
     * persist to the durable client store keyed per user: `${prefix}${userId}`.
     * Consent itself persists to the profiles.has_accepted_* columns (the DB
     * source of truth). Documented seam: promote to a profiles column later
     * without changing the flow — only this reader/writer would change.
     */
    recordStorageKeyPrefix: 'onboarding:record:',
    /**
     * The "60-second first win" phrase the learner taps to hear then (optionally)
     * says back — the very first Madeiran Portuguese they produce (§5 core loop
     * Hear → Repeat). Kept here as a tunable so the greeting is data, not a literal.
     */
    firstWinPhrase: 'Bom dia!',
    firstWinTranslation: 'Good morning!',
    /** BCP-47 tag for the optional say-it-back speech recognition on the first win. */
    firstWinRecognitionLanguage: 'pt-PT',
    /** Client budget for the one-shot say-it-back recognition before it gives up gracefully. */
    firstWinRecognitionTimeoutMs: 6000,
  },
} as const;

/**
 * Feature flags for staged capabilities (ENGINEERING-STANDARDS §7). Client-side static flags;
 * server-controlled rollouts belong in `global_settings`. Check flags via this object only —
 * no ad-hoc booleans per file.
 */
export const featureFlags = {
  /**
   * Payments/premium upsell is DEFERRED — the app launched free with no upsell UI.
   * This flag is the single re-entry point. Re-entry checklist:
   *
   * 1. Flip this flag to true.
   * 2. Restore the UpgradeModal component. The extracted component was tombstoned
   *    (src/features/tutor/UpgradeModal.tsx) and was never committed; the original
   *    modal JSX survives in the pre-refactor monolith: `git show f65b216:src/App.tsx`
   *    (~line 4280, "Upgrade Modal" block). Re-extract it into
   *    src/features/tutor/UpgradeModal.tsx, gate its mount in src/App.tsx on
   *    isFeatureEnabled('payments'), and scrub/replace the stub payment-provider
   *    redirect toast with a real checkout call.
   * 3. Rewire the trigger: useTutorSession.toggleRecording's voice-limit branch
   *    (marked with a "Free launch" comment) currently shows only the limit toast —
   *    reinstate isUpgradeModalOpen state there and open the modal on limit hit.
   * 4. Payment-provider integration point: a Supabase edge function pair —
   *    checkout-session creation (client calls it from the modal) + provider webhook
   *    that writes the entitlement. No client-side secret keys.
   * 5. Entitlement seam (already live, KEPT through the free launch):
   *    profiles.subscription_tier ('free' | 'premium' | 'unlimited', src/types.ts).
   *    The webhook updates it; tier checks (e.g. subscription_tier !== 'unlimited'
   *    in useTutorSession) and voice_usage_today/voice_limit enforcement already
   *    default everyone to free behavior, so no schema work is needed to re-enter.
   */
  payments: false,
  /**
   * Native (Capacitor) speech recognition/synthesis shell. false = current behavior:
   * web platform adapters only (src/platform web implementations).
   */
  nativeSpeech: false,
  /**
   * Offline lesson/audio pack downloads. false = current behavior: audio is cached
   * opportunistically per clip; no background month-pack download is triggered
   * (see useLessons.handleActivateMonth).
   */
  offlineDownloads: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

/** Single helper for flag checks (§7: one helper, not ad-hoc booleans per file). */
export const isFeatureEnabled = (flag: FeatureFlag): boolean => featureFlags[flag];
