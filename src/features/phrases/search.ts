// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/phrases/search.ts
// Description: Pure, dependency-free search helpers for the Phrase Library (CONTENT-ARCHITECTURE
//   §3 E10). Normalization is accent-insensitive (NFD decomposition + combining-mark strip) and
//   case-insensitive so "cafe" matches "café" and "amanha" matches "amanhã". Matching is
//   multi-token AND: every whitespace-separated query token must appear as a substring of the
//   normalized haystack. Deterministic and offline — no network, no state.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

/**
 * Normalize text for accent- and case-insensitive matching: Unicode NFD
 * decomposition, strip combining diacritical marks (U+0300–U+036F), lowercase,
 * collapse whitespace. Applied to both haystacks (at build time) and queries.
 */
export const normalizeForSearch = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * True when every token of the (raw) query appears in the pre-normalized
 * haystack. An empty/blank query matches everything (the library shows all).
 */
export const matchesQuery = (normalizedHaystack: string, rawQuery: string): boolean => {
  const tokens = normalizeForSearch(rawQuery).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => normalizedHaystack.includes(token));
};
