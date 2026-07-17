// File: src/platform/types.ts
// Description: Cross-platform capability contracts (speech-to-text, audio playback/recording,
//   persistent storage, notifications). UI and feature code depend ONLY on these interfaces —
//   never on window.SpeechRecognition, Web Audio, `idb`, or Capacitor plugin APIs directly
//   (ENGINEERING-STANDARDS §1.2). Web implementations live in src/platform/web/, native
//   (Capacitor) implementations in src/platform/native/; the runtime resolver in
//   src/platform/index.ts selects one and exports the `platform` singleton.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

// ---------------------------------------------------------------------------
// Typed failures
// ---------------------------------------------------------------------------

export type PlatformCapability = 'speech' | 'audio' | 'storage' | 'notifications';

export type PlatformErrorCode =
  | 'unavailable'        // capability does not exist on this platform/browser
  | 'not-implemented'    // native stub not yet wired to a Capacitor plugin
  | 'permission-denied'  // user or OS denied the required permission
  | 'no-speech'          // recognition heard nothing
  | 'timeout'            // recognize() hit its timeoutMs budget with no final transcript
  | 'audio-capture'      // microphone could not be captured
  | 'network'            // capability needs the network and it failed
  | 'aborted'            // operation was cancelled
  | 'playback-failure'   // audio element / buffer source failed to play
  | 'storage-failure'    // persistent store rejected the operation
  | 'unknown';

// Typed failure surface for every adapter. Callers switch on `code`; `detail`
// carries the raw platform-specific error string (e.g. the Web Speech
// SpeechRecognitionErrorEvent.error value) for display or logging.
export class PlatformError extends Error {
  readonly capability: PlatformCapability;
  readonly code: PlatformErrorCode;
  readonly detail?: string;

  constructor(
    capability: PlatformCapability,
    code: PlatformErrorCode,
    message: string,
    detail?: string,
  ) {
    super(message);
    this.name = 'PlatformError';
    this.capability = capability;
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Speech-to-text
// ---------------------------------------------------------------------------

export interface SpeechResult {
  // Aggregated transcript for this event. When `isFinal` is true this contains
  // only the newly-finalized text (safe to append); when false it is the
  // current interim aggregate (display-only, superseded by later events).
  transcript: string;
  isFinal: boolean;
}

export interface SpeechStartOptions {
  // BCP-47 tag, e.g. 'pt-PT'. Defaults to the implementation's default.
  language?: string;
  // Keep listening across pauses until stop() is called.
  continuous?: boolean;
  // Emit interim (non-final) results as they form.
  interimResults?: boolean;
}

export interface SpeechRecognizeOptions {
  // BCP-47 tag, e.g. 'pt-PT'. Defaults to the implementation's default.
  language?: string;
  // Client-side budget for the whole one-shot session. When it elapses before a
  // final transcript arrives, recognition is stopped and the promise rejects
  // with PlatformError('speech', 'timeout'). Omitted = rely on the platform's
  // natural end-of-utterance / silence timeout.
  timeoutMs?: number;
}

// Speech recognition (speech-to-text). Callback registration replaces any
// previously registered callback for that event; pass null to unregister.
export interface SpeechAdapter {
  isAvailable(): boolean;
  isListening(): boolean;
  onStart(cb: (() => void) | null): void;
  onResult(cb: ((result: SpeechResult) => void) | null): void;
  onNoMatch(cb: (() => void) | null): void;
  onError(cb: ((error: PlatformError) => void) | null): void;
  onEnd(cb: (() => void) | null): void;
  // Begin listening. Throws PlatformError('speech', 'unavailable' | 'not-implemented')
  // when recognition cannot start. Calling start() while already listening is a
  // safe no-op that re-fires onStart.
  start(options?: SpeechStartOptions): void;
  stop(): void;
  // One-shot convenience built on start/stop/onResult (shared implementation in
  // src/platform/speech-common.ts): listen for a single utterance and resolve
  // with the aggregated final transcript. Rejects with a typed
  // PlatformError('speech', ...) — 'unavailable' (no recognition on this
  // platform), 'permission-denied', 'timeout' (timeoutMs elapsed without a
  // final transcript), 'no-speech' (session ended having heard nothing), or
  // 'aborted' (a recognition session is already in progress). The adapter has a
  // single recognition channel: externally registered onResult/onError/onEnd
  // callbacks still fire during a recognize() run.
  recognize(options?: SpeechRecognizeOptions): Promise<string>;
}

// ---------------------------------------------------------------------------
// Audio playback + recording
// ---------------------------------------------------------------------------

export interface AudioPlayOptions {
  // Playback rate; 1.0 = normal speed.
  rate?: number;
  // Invoked once when playback finishes (or is stopped).
  onEnded?: () => void;
}

export interface SpeechSynthesisOptions {
  // BCP-47 tag for the synthesized voice, e.g. 'pt-PT'. Defaults to 'pt-PT'.
  lang?: string;
  // Speaking rate; 1.0 = normal speed.
  rate?: number;
  // Invoked once when speech finishes (or is stopped/cancelled).
  onEnded?: () => void;
}

export interface AudioAdapter {
  isAvailable(): boolean;
  // Play an audio URL or Blob (compressed formats via the platform's media
  // element/decoder). Resolves once playback has started. Starting a new
  // playback stops the previous one.
  play(source: string | Blob, options?: AudioPlayOptions): Promise<void>;
  // Play raw PCM (mono, signed 16-bit little-endian) through the shared audio
  // context — used for server TTS audio (24kHz s16le). Resolves once playback
  // has started; `options.onEnded` fires when it finishes.
  playPcm16(data: ArrayBuffer, sampleRate: number, options?: AudioPlayOptions): Promise<void>;
  // Text-to-speech via the platform's built-in speech-synthesis engine. This is the graceful
  // fallback when SERVER TTS is unavailable (edge TTS_UNAVAILABLE) — degraded quality but still
  // audible, per the TTS design. Resolves once speech has started; options.onEnded fires when it
  // finishes (or is stopped). Rejects PlatformError('audio','unavailable') when the platform has
  // no speech synthesis. stop() also cancels in-progress synthesis.
  speak(text: string, options?: SpeechSynthesisOptions): Promise<void>;
  pause(): void;
  // Resume a paused playback (also resumes a suspended audio context).
  resume(): Promise<void>;
  // Stop and discard the current playback, if any. Safe to call when idle.
  stop(): void;
  // Microphone capture. startRecording() throws PlatformError('audio',
  // 'permission-denied' | 'unavailable') on failure; stopRecording() resolves
  // with the captured audio.
  isRecordingSupported(): boolean;
  startRecording(): Promise<void>;
  stopRecording(): Promise<Blob>;
}

// ---------------------------------------------------------------------------
// Storage (key-value + blob store)
// ---------------------------------------------------------------------------

export interface StorageUsage {
  // Bytes used / granted, when the platform can report them; null otherwise.
  usedBytes: number | null;
  quotaBytes: number | null;
}

// Reported by blobUsage(): exact count/bytes of the blob (audio) store, tracked
// by the adapter itself (not the browser's coarse quota estimate). Drives the
// Settings "Used: X MB" display and LRU eviction decisions.
export interface BlobStoreUsage {
  // Number of blob entries currently held.
  count: number;
  // Sum of entry byte lengths currently held.
  bytes: number;
}

// Bound applied by setBlob() before writing a new entry (bounded LRU cache,
// CONTENT-ARCHITECTURE §10). When adding an entry would exceed EITHER limit the
// least-recently-used entries are evicted first. Omitted fields = that dimension
// is unbounded. A single entry larger than maxBytes is stored anyway (evicting
// everything else) so a lone oversized clip is never silently dropped.
export interface BlobLimits {
  maxEntries?: number;
  maxBytes?: number;
}

// Options for a durable-store write (setPinnedBlob). `protect` marks the entry as an EXPLICIT
// offline download that eviction must never reclaim (owner 2026-07-17: a download is a deliberate
// "keep offline" commitment). Omitted/false = an opportunistic auto-saved play, which IS reclaimable.
export interface PinnedWriteOptions {
  limits?: BlobLimits;
  protect?: boolean;
}

// Result of a durable-store write. `stored` is false when the entry could NOT be written within the
// limit WITHOUT evicting a protected download — the caller decides what to do (a play falls back to
// the ephemeral cache; a download surfaces an "out of offline space" message). `evicted` counts the
// reclaimable (unprotected) entries removed to make room.
export interface PinnedWriteResult {
  evicted: number;
  stored: boolean;
}

// Persistent client-side storage. Two namespaces: a JSON-value key-value store
// for structured state (progress, queued writes, preferences) and a blob store
// for binary payloads (cached TTS audio, content-pack media). IndexedDB-backed
// on web; native implementations may swap in filesystem/Preferences plugins.
export interface StorageAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  clear(prefix?: string): Promise<void>;
  getBlob(key: string): Promise<ArrayBuffer | null>;
  // Store a blob. When `limits` is supplied the store is treated as a bounded
  // LRU cache: reading (getBlob) or writing (setBlob) an entry marks it most
  // recently used, and a write that would breach `limits` first evicts the
  // least-recently-used entries (CONTENT-ARCHITECTURE §10). Without `limits`
  // the store is unbounded (legacy behavior). Returns how many entries were
  // evicted to make room (0 when none / unbounded) so callers can log it.
  setBlob(key: string, data: ArrayBuffer, limits?: BlobLimits): Promise<number>;
  deleteBlob(key: string): Promise<void>;
  blobKeys(prefix?: string): Promise<string[]>;
  clearBlobs(prefix?: string): Promise<void>;
  // DURABLE audio store (EN-8): a SECOND blob namespace that survives logout/restart, holding
  // CURATED (public, `hostable`) audio — the clips the user plays or downloads for offline use.
  // Because a locally-stored file serves BOTH intents at once (local ⇒ fast, persistent ⇒
  // offline), this single store replaces the older "cache vs saved" duplication: the bounded
  // 'audio' LRU (getBlob/setBlob) is now only an EPHEMERAL, cleared-on-logout tier for private
  // (non-`hostable`) audio, while this store is the persistent, user-facing "saved audio".
  //
  // It is BOUNDED like the LRU (owner directive 2026-07-17: "it can still be bounded") but with a
  // PROTECTION rule: eviction reclaims only UNPROTECTED (opportunistic auto-saved play) entries,
  // NEVER a `protect:true` explicit download. With `options.limits` a write reclaims least-recently
  // -used plays before writing when a limit would be breached; if the incoming entry still cannot
  // fit without evicting a download, the write is REFUSED (result.stored === false) so the caller
  // can react (a play falls back to the cache; a download surfaces "out of offline space"). Reading
  // (getPinnedBlob) marks an entry most-recently used. It is cleared ONLY by an explicit user action
  // — turning off "Save audio on device" or an app uninstall — NEVER on logout (contents are public,
  // no PII; SEC-2 safe). A clip lookup checks the ephemeral 'audio' cache FIRST, then this store,
  // before any server tier.
  getPinnedBlob(key: string): Promise<ArrayBuffer | null>;
  setPinnedBlob(key: string, data: ArrayBuffer, options?: PinnedWriteOptions): Promise<PinnedWriteResult>;
  // Exact count/bytes of the durable store (drives the Settings "saved audio" usage display).
  pinnedUsage(): Promise<BlobStoreUsage>;
  // Remove durable/saved blobs (all, or those matching `prefix`) — e.g. turning off "Save audio on
  // device". Deliberately separate from clearBlobs so clearing the ephemeral cache (e.g. on logout)
  // never deletes the user's saved offline audio, and vice-versa (the two operations are distinct).
  clearPinned(prefix?: string): Promise<void>;
  // Coarse platform quota estimate (navigator.storage.estimate on web) — the
  // whole origin, not just this app's blobs.
  usage(): Promise<StorageUsage>;
  // Exact count/bytes of the blob store, tracked by the adapter (drives the
  // Settings offline-audio usage display and LRU eviction).
  blobUsage(): Promise<BlobStoreUsage>;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface ScheduledNotification {
  // Stable caller-chosen id; scheduling the same id again replaces the pending one.
  id: string;
  title: string;
  body?: string;
  // Epoch milliseconds. Omitted or in the past = show immediately.
  at?: number;
}

export interface NotificationsAdapter {
  isAvailable(): boolean;
  requestPermission(): Promise<NotificationPermissionState>;
  // Schedule (or immediately show) a notification. No-op when the platform
  // does not support notifications (callers gate UX on isAvailable()).
  schedule(notification: ScheduledNotification): Promise<void>;
  cancel(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Resolved platform surface
// ---------------------------------------------------------------------------

export interface Platform {
  // True when running inside a Capacitor native shell (iOS/Android).
  readonly isNative: boolean;
  readonly speech: SpeechAdapter;
  readonly audio: AudioAdapter;
  readonly storage: StorageAdapter;
  readonly notifications: NotificationsAdapter;
}
