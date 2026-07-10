// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/__tests__/validation.test.ts
// Description: Unit tests for the user-input validation guards (src/lib/validation.ts). Covers
//   validateText (trim, reject-empty, reject-over-max, return cleaned value) and validateUrl
//   (http(s) requirement, reject non-URL, reject non-http protocol). Pure/dependency-free
//   (imports only config); no mocks.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { describe, expect, it } from 'vitest';
import { validateText, validateUrl } from '../validation';

describe('validateText', () => {
  it('trims and returns the cleaned value on success', () => {
    const r = validateText('  hello  ', 'Message', 100);
    expect(r).toEqual({ ok: true, value: 'hello', reason: '' });
  });

  it('rejects empty and whitespace-only input', () => {
    expect(validateText('', 'Message', 100).ok).toBe(false);
    expect(validateText('   ', 'Message', 100).ok).toBe(false);
  });

  it('rejects input longer than the max (measured after trim)', () => {
    const r = validateText('a'.repeat(11), 'Message', 10);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('too long');
  });

  it('accepts input exactly at the max length', () => {
    const r = validateText('a'.repeat(10), 'Message', 10);
    expect(r.ok).toBe(true);
  });

  it('labels the rejection reason with the field name', () => {
    const r = validateText('', 'Correction', 100);
    expect(r.reason).toContain('Correction');
  });
});

describe('validateUrl', () => {
  it('accepts a valid https URL', () => {
    const r = validateUrl('https://youtu.be/abc', 'Video link');
    expect(r).toEqual({ ok: true, value: 'https://youtu.be/abc', reason: '' });
  });

  it('accepts a valid http URL', () => {
    expect(validateUrl('http://example.com').ok).toBe(true);
  });

  it('rejects non-URL text', () => {
    expect(validateUrl('not a url').ok).toBe(false);
  });

  it('rejects a non-http protocol (e.g. javascript:)', () => {
    expect(validateUrl('javascript:alert(1)').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(validateUrl('').ok).toBe(false);
  });
});
