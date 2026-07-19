// File: src/content/onboardingCorpus.ts
// Description: EN-34 / EN-32 (absorbed) — THE single enumeration source for the onboarding spoken
//   audio corpus (alignment Refinement B: the panel, the pregen CLI, and the audio-warm edge fn must
//   all enumerate onboarding from ONE definition, or "what the panel shows" drifts from "what gets
//   hosted"). Kept as DATA (a list of (text, voiceType) pairs) so hosting the onboarding greetings is
//   a content edit here, not scattered literals.
//
//   GROUNDED IN THE ACTUAL FLOW, NOT A GUESS: the onboarding flow (src/features/onboarding/
//   OnboardingFlow.tsx) synthesizes exactly ONE spoken clip today — config.onboarding.firstWinPhrase
//   ("Bom dia!"), played by FirstWinStep via the default tutor voice (no tutor is chosen before the
//   first-win step, so resolveVoice() falls back to voiceTypeForTutor(undefined) = 'teacher'). That
//   one clip is therefore the whole onboarding audio surface in code as it stands.
//
//   NOTE FOR OWNER (surfaced, not fabricated): EN-32/EN-34 planning assumed "6 onboarding clips", but
//   the code plays only this one. The other five are a CONTENT decision (which additional onboarding
//   phrases to pre-host) that is not derivable from the code, so they are intentionally NOT invented
//   here (AGENTS §3: ad-hoc content is not a build order). Add each confirmed phrase to the array
//   below and both the pregen CLI and the warm fn will pick it up with zero further wiring.
// Author: claude-opus-runner (with owner)
// Created: 2026-07-19

import { config } from '../config';
import type { VoiceType } from './schema';

/** One onboarding clip to pre-host: the exact spoken text + the resolved voice archetype slot. */
export interface OnboardingClipSource {
  text: string;
  voiceType: VoiceType;
}

/**
 * The onboarding audio corpus. Seeded with the only clip the onboarding flow actually speaks today
 * (the first-win greeting at the default 'teacher' voice). Extend as owner-confirmed onboarding
 * phrases are added — this is the ONE place both the Node pregen script and the Deno warm fn read.
 */
export const ONBOARDING_CORPUS: OnboardingClipSource[] = [
  { text: config.onboarding.firstWinPhrase, voiceType: 'teacher' },
];
