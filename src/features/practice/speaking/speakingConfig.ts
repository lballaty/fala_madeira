// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/speakingConfig.ts
// Description: Behavioral tunables for the Speaking Coach + Pronunciation Trainer engine.
//   NOTE: these belong in src/config.ts (AGENTS.md §3 "config, not magic values") but that
//   file is under an active write claim by the parallel srs-adaptive-engine step — migrate
//   this block into config.ts once that claim is released (same holding pattern as
//   practiceConfig in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

export const speakingConfig = {
  /** BCP-47 tag for speech recognition (European Portuguese, per CONTENT-STANDARDS). */
  recognitionLanguage: 'pt-PT',
  /** One-shot recognize() budget for repeat-after-me (ms). */
  recognizeTimeoutMs: 8000,
  /** Listening budget for the response-speed drill (ms) — roomier: thinking time is the point. */
  speedListenTimeoutMs: 12000,
  /** Pause between phrases during a shadowing pass (ms). */
  shadowGapMs: 900,
  /** Playback-rate choices offered for reference audio (TTS). */
  playbackSpeeds: [0.8, 1.0] as const,
  /** Default reference playback rate. */
  defaultPlaybackSpeed: 1.0,
  /** Accuracy at or above this reads as "nailed it" (0..1). */
  greatAccuracy: 0.85,
  /** Accuracy at or above this reads as "close" (0..1); below = "again". */
  closeAccuracy: 0.6,
  /** Time-to-speech-start at or below this reads as "instant" (ms). */
  instantLatencyMs: 1500,
  /** Time-to-speech-start at or below this reads as "good pace" (ms). */
  goodLatencyMs: 3500,
  /** Max ready-made variants pulled per phrase pattern into the drill queue. */
  maxVariantsPerPattern: 2,
  /** Max vocabulary items appended to the drill queue (patterns lead, vocab supports). */
  maxVocabularyItems: 8,
} as const;
