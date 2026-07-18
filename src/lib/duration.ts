// File: src/lib/duration.ts
// Description: Human duration formatter (TB-21). "Time spent" was rendered as raw minutes with no
//   roll-up, so a multi-day total still read as e.g. "4317m". This scales seconds to the largest
//   sensible unit pair — minutes, then hours+minutes, then days+hours — e.g. "12m", "3h 12m",
//   "2d 4h". Pure + deterministic so it is unit-tested. NB: purely a DISPLAY fix (TB-21); the
//   underlying counter-inflation is TB-17 (computation), tracked separately.
// Author: TB-21 fix (with assistant)
// Created: 2026-07-17

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/**
 * Format a duration in SECONDS as a compact, unit-scaled string:
 *   < 1h  -> "Nm"          (e.g. "0m", "42m")
 *   < 1d  -> "Hh Mm"       (e.g. "3h 12m")
 *   >= 1d -> "Dd Hh"       (e.g. "2d 4h")
 * Negative/NaN inputs are treated as 0.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;

  if (s < SECONDS_PER_HOUR) {
    return `${Math.floor(s / SECONDS_PER_MINUTE)}m`;
  }
  if (s < SECONDS_PER_DAY) {
    const h = Math.floor(s / SECONDS_PER_HOUR);
    const m = Math.floor((s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(s / SECONDS_PER_DAY);
  const h = Math.floor((s % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return `${d}d ${h}h`;
}
