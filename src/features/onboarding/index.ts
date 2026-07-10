// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/onboarding/index.ts
// Description: Public surface of the onboarding slice (docs/CONTENT-ARCHITECTURE.md §5).
//   Import from here (not the individual files). useOnboarding is the first-run gate + commit
//   hook App.tsx consumes; OnboardingFlow is the lazy-loaded multi-step flow rendered before
//   the main tab shell for a signed-in, not-yet-onboarded user. OnboardingFlow is also the
//   default export of its module so App.tsx can React.lazy() it directly.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

export { OnboardingFlow } from './OnboardingFlow';
export { useOnboarding } from './useOnboarding';
export type { OnboardingRecord, OnboardingResult } from './useOnboarding';
