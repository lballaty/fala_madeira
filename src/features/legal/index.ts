// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/legal/index.ts
// Description: Public surface of the legal slice. Import from here (not from the
//   individual files) in other slices — including the future onboarding flow, which
//   only needs LegalPage + LegalDocId to show consent-linked documents.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

export { LegalPage, LEGAL_DOCUMENTS } from './LegalPage';
export { TERMS_OF_SERVICE } from './terms';
export { PRIVACY_POLICY } from './privacy';
export { AI_USE_DISCLOSURE } from './ai-use';
export type { LegalDocId, LegalDocument, LegalSection } from './types';
