// File: supabase/functions/ai-gateway/__tests__/voiceLimit.test.ts
// Description: Outcome tests for the pure daily voice-limit decision (EN-27 Option-1 edge coverage;
//   TB-8/EN-11). Covers the limit precedence (per-user override -> global default -> hard floor),
//   the daily reset, unlimited tiers, and the allow/deny boundary — the entitlement math that gates
//   every TTS request.
// Author: EN-27 error-hardening (Option-1 edge coverage)
// Created: 2026-07-17

import { describe, expect, it } from 'vitest';
import { resolveVoiceLimit, VOICE_LIMIT_FLOOR } from '../voiceLimit';

const TODAY = '2026-07-17';

describe('resolveVoiceLimit (ai-gateway TB-8/EN-11)', () => {
  it('premium/unlimited tiers bypass the limit', () => {
    expect(resolveVoiceLimit({ subscription_tier: 'premium' }, '5', TODAY)).toMatchObject({ unlimited: true, allowed: true });
    expect(resolveVoiceLimit({ subscription_tier: 'unlimited' }, '5', TODAY)).toMatchObject({ unlimited: true, allowed: true });
  });

  it('uses the global default when there is no per-user override', () => {
    const d = resolveVoiceLimit({ subscription_tier: 'free', voice_usage_today: 3, last_voice_usage_date: TODAY }, '20', TODAY);
    expect(d.limit).toBe(20);
    expect(d.usage).toBe(3);
    expect(d.allowed).toBe(true);
    expect(d.nextUsage).toBe(4);
  });

  it('per-user voice_limit overrides the global default', () => {
    const d = resolveVoiceLimit({ subscription_tier: 'free', voice_limit: 3, voice_usage_today: 0, last_voice_usage_date: TODAY }, '20', TODAY);
    expect(d.limit).toBe(3);
  });

  it('falls back to the hard floor when neither per-user nor a valid global value exists', () => {
    const d = resolveVoiceLimit({ subscription_tier: 'free', last_voice_usage_date: TODAY }, null, TODAY);
    expect(d.limit).toBe(VOICE_LIMIT_FLOOR);
  });

  it('denies the request when usage has reached the limit', () => {
    const d = resolveVoiceLimit({ subscription_tier: 'free', voice_limit: 5, voice_usage_today: 5, last_voice_usage_date: TODAY }, '20', TODAY);
    expect(d.allowed).toBe(false);
  });

  it('resets usage to 0 when the last-usage date is not today (daily reset)', () => {
    const d = resolveVoiceLimit({ subscription_tier: 'free', voice_limit: 5, voice_usage_today: 5, last_voice_usage_date: '2026-07-16' }, '20', TODAY);
    expect(d.usage).toBe(0);
    expect(d.allowed).toBe(true);
    expect(d.nextUsage).toBe(1);
  });
});
