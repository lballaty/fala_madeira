// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/validation.ts
// Description: Client-side input validation + limits for user-submitted free text
//   (ENGINEERING-STANDARDS §4). Trim → reject-empty → enforce max length, returning a typed
//   result the caller surfaces through the existing toast/error envelope — never a silent
//   truncation, never a raw exception. Length caps live in config.limits (no magic numbers).
//   These guards are the client's first line; the JWT-verified edge functions re-validate
//   server-side (defense in depth) — this module never replaces server validation.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { config } from '../config';

/**
 * Outcome of a text-field validation. Flat (non-discriminated) shape on purpose: the project's
 * tsconfig is not `strict`, so TypeScript does not narrow discriminated unions on `ok` — a flat
 * result with all three fields always present keeps `.value`/`.reason` accessible at every call
 * site without a narrowing guard. On success `reason` is ''; on failure `value` is ''.
 */
export interface ValidationResult {
  ok: boolean;
  /** Cleaned (trimmed) value on success; '' on failure. */
  value: string;
  /** Calm, human-readable reason on failure; '' on success. */
  reason: string;
}

/**
 * Trim, reject-empty, and enforce a max length on a free-text field. `label` is used
 * in the human-readable rejection message (e.g. "Message", "Correction"). Returns the
 * trimmed value on success so callers persist the cleaned text, not the raw draft.
 */
export const validateText = (
  raw: string,
  label: string,
  maxLength: number,
): ValidationResult => {
  const value = (raw ?? '').trim();
  if (value.length === 0) {
    return { ok: false, value: '', reason: `${label} cannot be empty.` };
  }
  if (value.length > maxLength) {
    return { ok: false, value: '', reason: `${label} is too long (max ${maxLength} characters).` };
  }
  return { ok: true, value, reason: '' };
};

/**
 * Validate a URL field: trim, reject-empty, enforce max length, and require a
 * parseable http(s) URL. Returns the trimmed value on success.
 */
export const validateUrl = (raw: string, label = 'Link'): ValidationResult => {
  const base = validateText(raw, label, config.limits.urlMax);
  if (!base.ok) return base;
  // Accept scheme-less input (e.g. "youtube.com/watch?v=…", "www.youtube.com/…") — the most
  // common paste — by defaulting to https:// when no http(s):// scheme is present. Without this,
  // new URL() throws on scheme-less text and the submit silently rejected valid links.
  const candidate = /^https?:\/\//i.test(base.value) ? base.value : `https://${base.value}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, value: '', reason: `${label} must be a valid URL.` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, value: '', reason: `${label} must start with http:// or https://.` };
  }
  // A bare word ("hello") parses as https://hello with an empty-ish host — require a dotted host
  // so we don't accept obvious non-URLs just because we prepended a scheme.
  if (!parsed.hostname.includes('.')) {
    return { ok: false, value: '', reason: `${label} must be a valid URL.` };
  }
  return { ok: true, value: candidate, reason: '' };
};
