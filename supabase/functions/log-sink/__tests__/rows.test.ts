// File: supabase/functions/log-sink/__tests__/rows.test.ts
// Description: Outcome tests for the log-sink pure payload logic (EN-27 Option-1 edge coverage):
//   batch validation (shape + caps) and row mapping (level/category defaulting, spoofed-user_id →
//   NULL, message-embedded-in-details, details byte clamp). These are the abuse-control + data
//   integrity guarantees of the anonymous-writable sink.
// Author: EN-27 error-hardening (Option-1 edge coverage)
// Created: 2026-07-17

import { describe, expect, it } from 'vitest';
import {
  buildLogRows,
  validateEventsBatch,
  MAX_EVENTS_PER_BATCH,
  MAX_DETAILS_BYTES,
} from '../rows';

const NOW = 1_700_000_000_000;

describe('validateEventsBatch (log-sink caps/shape)', () => {
  it('rejects a non-array events field', () => {
    expect(validateEventsBatch({ events: 'nope' as unknown as [] })).toMatchObject({ ok: false, code: 'BAD_REQUEST', status: 400 });
  });
  it('treats an empty batch as a no-op success', () => {
    expect(validateEventsBatch({ events: [] })).toMatchObject({ ok: true, empty: true });
  });
  it('rejects an over-cap batch', () => {
    const events = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => ({}));
    expect(validateEventsBatch({ events })).toMatchObject({ ok: false, code: 'TOO_MANY_EVENTS', status: 413 });
  });
  it('accepts a normal batch', () => {
    const v = validateEventsBatch({ events: [{ event_type: 'x' }] });
    expect(v.ok).toBe(true);
  });
});

describe('buildLogRows (log-sink row mapping)', () => {
  it('defaults an unknown level to ERROR and unknown category to SYSTEM_HEALTH', () => {
    const [row] = buildLogRows([{ level: 'BOGUS', category: 'BOGUS', event_type: 'e' }], { deviceInfo: 'ua', nowMs: NOW });
    expect(row.level).toBe('ERROR');
    expect(row.category).toBe('SYSTEM_HEALTH');
  });

  it('gates a spoofed/garbage user_id to NULL (FK safety) but keeps a valid UUID', () => {
    const [bad] = buildLogRows([{ user_id: 'not-a-uuid', event_type: 'e' }], { deviceInfo: 'ua', nowMs: NOW });
    expect(bad.user_id).toBeNull();
    const uuid = '11111111-1111-1111-1111-111111111111';
    const [good] = buildLogRows([{ user_id: uuid, event_type: 'e' }], { deviceInfo: 'ua', nowMs: NOW });
    expect(good.user_id).toBe(uuid);
  });

  it('embeds the message inside details (the base row has no message column)', () => {
    const [row] = buildLogRows([{ event_type: 'e', message: 'boom', details: { a: 1 } }], { deviceInfo: 'ua', nowMs: NOW });
    const details = JSON.parse(row.details as string);
    expect(details.message).toBe('boom');
    expect(details.a).toBe(1);
  });

  it('clamps oversized details to the byte cap', () => {
    const huge = 'x'.repeat(MAX_DETAILS_BYTES * 2);
    const [row] = buildLogRows([{ event_type: 'e', details: { blob: huge } }], { deviceInfo: 'ua', nowMs: NOW });
    expect((row.details as string).length).toBeLessThanOrEqual(MAX_DETAILS_BYTES);
  });

  it('defaults a missing event_type and stamps the provided device info + timestamp', () => {
    const [row] = buildLogRows([{}], { deviceInfo: 'iPhone', nowMs: NOW });
    expect(row.event).toBe('client_event');
    expect(row.event_type).toBe('client_event');
    expect(row.device_info).toBe('iPhone');
    expect(row.timestamp).toBe(new Date(NOW).toISOString());
  });
});
