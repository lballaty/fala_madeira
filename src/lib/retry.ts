// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/lib/retry.ts
// Description: Bounded exponential-backoff-with-jitter retry helper (ENGINEERING-STANDARDS §5).
//   Wraps a network/AI call and re-attempts it up to config.net.maxAttempts times with a doubling,
//   jittered, capped delay between attempts. Every retry is logged through src/lib/logger with a
//   shared correlation id (attempt number + final disposition) so the reliability behavior is
//   observable — never a silent retry. A `shouldRetry` predicate lets callers keep non-transient
//   failures (auth/validation) from being retried; the default retries everything. This is the
//   single retry primitive for src/ — the offline sync queue and content repository run their own
//   tick-driven retry and intentionally do NOT route through here (no double retry).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { logger } from './logger';
import { config } from '../config';

export interface RetryOptions {
  /** Human label for logs (e.g. 'edge:gemini:chat'). */
  label: string;
  /** Correlation id joining every attempt's log line; generated when omitted. */
  correlationId?: string;
  /** Max attempts including the first (defaults to config.net.maxAttempts). */
  maxAttempts?: number;
  /** Base backoff delay in ms (defaults to config.net.baseDelayMs). */
  baseDelayMs?: number;
  /** Ceiling on any single backoff wait in ms (defaults to config.net.maxDelayMs). */
  maxDelayMs?: number;
  /** Full-jitter fraction 0..1 (defaults to config.net.jitterRatio). */
  jitterRatio?: number;
  /**
   * Predicate deciding whether a thrown error is worth retrying. Return false for
   * non-transient failures (bad input, auth) so they surface immediately. Defaults
   * to always-retry (every error is treated as potentially transient).
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const newCorrelationId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying transient failures with bounded exponential backoff + jitter.
 * Resolves with the first successful result; rejects with the last error once the
 * attempt budget is exhausted (or immediately when `shouldRetry` returns false).
 */
export const withRetry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? config.net.maxAttempts;
  const baseDelayMs = options.baseDelayMs ?? config.net.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? config.net.maxDelayMs;
  const jitterRatio = options.jitterRatio ?? config.net.jitterRatio;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const correlationId = options.correlationId ?? newCorrelationId();

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLast = attempt >= maxAttempts;
      if (isLast || !shouldRetry(error, attempt)) {
        if (attempt > 1) {
          logger.warn('RETRY_EXHAUSTED', `retry gave up on "${options.label}" after ${attempt} attempt(s)`, {
            category: 'SYSTEM_HEALTH',
            correlationId,
            error,
            details: { label: options.label, attempt, maxAttempts },
          });
        }
        throw error;
      }
      // Exponential backoff (base * 2^(attempt-1)), capped, then full-jitter down.
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const wait = Math.round(backoff * (1 - jitterRatio * Math.random()));
      logger.warn('RETRY_ATTEMPT', `attempt ${attempt} of "${options.label}" failed — retrying in ${wait}ms`, {
        category: 'SYSTEM_HEALTH',
        correlationId,
        error,
        details: { label: options.label, attempt, maxAttempts, waitMs: wait },
      });
      await delay(wait);
    }
  }
  // Unreachable (loop either returns or throws), but satisfies the type checker.
  throw lastError;
};
