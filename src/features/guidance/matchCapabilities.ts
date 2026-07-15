// File: src/features/guidance/matchCapabilities.ts
// Description: Pure matcher (EN-18) — given a chat-help answer, return the capabilities it most
//   likely refers to so the help UI can offer a "Take me there" affordance for each. Deterministic
//   and side-effect free: scores each capability by keyword/title hits in the answer text and
//   returns the top matches (with a navigable target) in descending score. No LLM, no network —
//   the model writes prose; this maps that prose back onto stable capability ids.
// Author: Lane A (with assistant)
// Created: 2026-07-15

import { APP_CAPABILITIES, type AppCapability } from '../../content';

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Rank capabilities by how strongly `answer` refers to them. A title hit is worth more than a
 * keyword hit. Only capabilities with a navigation target are returned (there is nowhere to take
 * the user otherwise). Deterministic tie-break by registry order via a stable sort.
 */
export function matchCapabilities(answer: string, limit = 3): AppCapability[] {
  if (!answer || !answer.trim()) return [];
  const hay = normalize(answer);

  const scored = APP_CAPABILITIES
    .filter((c) => c.target?.controlId) // only offer where we can actually navigate
    .map((c, index) => {
      let score = 0;
      if (hay.includes(normalize(c.title))) score += 3;
      for (const kw of c.keywords) {
        if (hay.includes(normalize(kw))) score += 1;
      }
      return { c, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.slice(0, limit).map((entry) => entry.c);
}
