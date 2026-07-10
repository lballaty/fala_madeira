// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/listening/listeningConfig.ts
// Description: Listening Engine tunables (speeds, check/dictation sizing). NOTE: these belong
//   in src/config.ts (AGENTS.md §3 "config, not magic values") but that file is under an
//   active write claim by the parallel srs-adaptive-engine step — migrate this block into
//   config.ts once that claim is released (same deferral as practiceConfig in ../registry.ts).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

export const listeningConfig = {
  /**
   * Speed pills (docs/ui-mockup/intended-ui-v3.html Listening screen). `rate` is the
   * playback rate passed to platform.audio.playPcm16 — audio is cached per text+voice
   * (never per speed), so one clip serves all three speeds.
   */
  speeds: [
    { id: 'slow', label: 'slow', rate: 0.7 },
    { id: 'normal', label: 'normal', rate: 1.0 },
    { id: 'natural', label: 'natural', rate: 1.15 },
  ],
  defaultSpeedId: 'normal',

  /** Max "what did you hear?" comprehension checks generated per dialogue/phrase set. */
  maxChecks: 3,
  /** Choices per comprehension check (1 correct + distractors; degrades to 2 when short on distractors). */
  choicesPerCheck: 3,
  /** Cap on phrase/vocabulary items in the no-dialogue fallback list (keeps the screen scannable). */
  maxPhraseItems: 12,
} as const;

export type ListeningSpeed = (typeof listeningConfig.speeds)[number];
export type SpeedId = ListeningSpeed['id'];

/** Resolve a speed pill by id (falls back to normal — never throws on a stale id). */
export const getListeningSpeed = (id: SpeedId): ListeningSpeed =>
  listeningConfig.speeds.find((s) => s.id === id) ?? listeningConfig.speeds[1];
