// File: src/features/admin/audio/useAudioReview.ts
// Description: EN-23 admin audio-review hook. Enumerates the clips in scope (Level/Track/Situation,
//   default Level 0) by reusing linesForSituation() + the shared buildKey(), joins each clip with
//   its persisted verdict, its tier presence (device cache now; EN-8 server tier when it lands),
//   and automated signals (bytes/type/duration + silence/loudness scoring for cached clips), and
//   exposes verdict + enqueue actions that persist through ttsAudioReviewRepo. Review is resumable:
//   verdicts/queue are DB-backed, so a reload restores state. No-ops when !isAdmin (RLS is the real
//   gate). Author: claude-en23. Created: 2026-07-17.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../../config';
import { contentRepository, SituationFilter } from '../../../content/repository';
import { PracticalLevel } from '../../../content/schema';
import { linesForSituation } from '../../../lib/audio-download';
import { audioCache } from '../../../lib/audioCache';
import { synthesizeCached } from '../../../services/geminiService';
import { logger, userMessage } from '../../../lib/logger';
import { ShowToast } from '../../../hooks/useToast';
import {
  AudioReviewItem,
  AudioSignals,
  AudioVerdict,
  EnumeratedClip,
  ReviewRow,
  TierPresence,
} from './types';
import { scoreClip } from './audioSignals';
import { checkServerPresence, isServerTierAvailable } from './audioServerTier';
import { enqueueRegen, getReviews, isRepoError, listRegenQueue, newCorrelationId, upsertVerdict } from './ttsAudioReviewRepo';

export interface AudioReviewScope {
  level?: PracticalLevel;
  trackId?: string;
  situationId?: string;
}

interface UseAudioReviewArgs {
  supabase: SupabaseClient | null;
  isAdmin: boolean;
  actorId: string | null;
  showToast: ShowToast;
}

export interface UseAudioReview {
  scope: AudioReviewScope;
  setScope: (scope: AudioReviewScope) => void;
  /** The enriched rows visible so far (one bounded page at a time — see W3 pagination). */
  items: AudioReviewItem[];
  loading: boolean;
  /** True while a "load more" page is being enriched (distinct from the initial `loading`). */
  loadingMore: boolean;
  /** Total clips enumerated in the current scope (items.length ≤ totalCount). */
  totalCount: number;
  /** More clips remain beyond the currently-visible page. */
  hasMore: boolean;
  /** Enrich + append the next page of clips. No-op when nothing remains. */
  loadMore: () => Promise<void>;
  serverTierAvailable: boolean;
  reload: () => void;
  setVerdict: (clip: EnumeratedClip, verdict: AudioVerdict, notes?: string | null) => Promise<void>;
  enqueue: (clip: EnumeratedClip, reason: string | null) => Promise<void>;
  /**
   * Resolve a playable object URL for a clip. Uses the device cache when present, otherwise
   * synthesizes through the normal lookup chain (cache → pinned → EN-8 server tiers → provider).
   * Returns null and surfaces a logged toast on failure (never a silent dead button).
   */
  getPlaybackUrl: (clip: EnumeratedClip) => Promise<string | null>;
}

const PROVIDER = 'default';

/** Enumerate every clip in scope, reusing the shared line-walk + cache key. */
const enumerateClips = async (scope: AudioReviewScope): Promise<EnumeratedClip[]> => {
  const filter: SituationFilter = {
    level: scope.level,
    trackId: scope.trackId,
    situationId: scope.situationId,
  };
  const situations = await contentRepository.listSituations(filter);
  const clips: EnumeratedClip[] = [];
  const seen = new Set<string>();
  for (const situation of situations) {
    for (const line of linesForSituation(situation)) {
      const voice = line.voiceType ?? 'default';
      const buildKey = audioCache.buildKey(PROVIDER, voice, line.text);
      if (seen.has(buildKey)) continue;
      seen.add(buildKey);
      clips.push({
        buildKey,
        text: line.text,
        voice,
        voiceType: line.voiceType,
        situationId: situation.id,
        level: situation.level,
      });
    }
  }
  return clips;
};

/** Map a persisted review row to the panel's AudioSignals shape (empty when there is no review). */
const signalsFromReview = (review?: ReviewRow): AudioSignals =>
  review
    ? {
        bytes: review.signal_bytes ?? undefined,
        contentType: review.signal_content_type ?? undefined,
        durationMs: review.signal_duration_ms ?? undefined,
        rmsDbfs: review.signal_rms_dbfs ?? undefined,
        peakDbfs: review.signal_peak_dbfs ?? undefined,
        silentRatio: review.signal_silent_ratio ?? undefined,
        silent: review.signal_silent,
        deadAirMs: review.signal_dead_air_ms ?? undefined,
        suspicious: review.signal_suspicious,
        scoredAt: review.signal_scored_at ?? undefined,
      }
    : {};

export const useAudioReview = ({ supabase, isAdmin, actorId, showToast }: UseAudioReviewArgs): UseAudioReview => {
  const [scope, setScope] = useState<AudioReviewScope>({ level: 0 as PracticalLevel });
  const [items, setItems] = useState<AudioReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const serverTierAvailable = useMemo(() => isServerTierAvailable(), []);

  // Enumerated clips + batch-fetched review/queue maps for the CURRENT scope, kept in refs so
  // "load more" can enrich the next page without re-enumerating or re-querying the DB.
  const clipsRef = useRef<EnumeratedClip[]>([]);
  const reviewsRef = useRef<Record<string, ReviewRow>>({});
  const queuedRef = useRef<Set<string>>(new Set());
  const correlationRef = useRef<string>('');

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Enrich a slice of already-enumerated clips into panel rows: read the device cache (+ score a
  // cached clip that lacks persisted signals) and probe the server tier. This is the EXPENSIVE,
  // per-clip work — W3 keeps it bounded to one page at a time (never the whole scope at once).
  const enrichClips = useCallback(
    async (slice: EnumeratedClip[]): Promise<AudioReviewItem[]> => {
      const rows: AudioReviewItem[] = [];
      for (const clip of slice) {
        const review = reviewsRef.current[clip.buildKey];
        let deviceTier: TierPresence = 'missing';
        let signals = signalsFromReview(review);

        const cached = await audioCache.get(clip.buildKey);
        if (cached) {
          deviceTier = 'present';
          if (!review || review.signal_scored_at == null) {
            signals = await scoreClip(new Blob([cached]), { scoredAt: new Date().toISOString() });
          }
        }

        const serverTier = serverTierAvailable
          ? await checkServerPresence(clip.buildKey, correlationRef.current)
          : 'unknown';

        rows.push({
          ...clip,
          verdict: review?.verdict ?? 'unreviewed',
          notes: review?.notes ?? null,
          deviceTier,
          serverTier,
          signals,
          queued: queuedRef.current.has(clip.buildKey),
        });
      }
      return rows;
    },
    [serverTierAvailable],
  );

  useEffect(() => {
    // No-op for non-admins (items stays at its empty initial value; this hook only ever renders
    // under AdminView, which gates on role==='admin'). Avoids a synchronous setState in the effect.
    if (!isAdmin) return;
    let cancelled = false;
    const correlationId = newCorrelationId();

    (async () => {
      setLoading(true);
      try {
        const clips = await enumerateClips(scope);
        const reviewsResult = await getReviews(supabase, clips.map((c) => c.buildKey), correlationId);
        if (isRepoError(reviewsResult)) {
          showToast(reviewsResult.message, 'error');
        }
        const reviews = isRepoError(reviewsResult) ? {} : reviewsResult.data;

        const queueResult = await listRegenQueue(supabase, ['pending', 'claimed'], correlationId);
        if (isRepoError(queueResult)) showToast(queueResult.message, 'error');
        const queuedKeys = new Set((isRepoError(queueResult) ? [] : queueResult.data).map((r) => r.build_key));

        clipsRef.current = clips;
        reviewsRef.current = reviews;
        queuedRef.current = queuedKeys;
        correlationRef.current = correlationId;

        // W3: enrich only the FIRST page. A scope can hold hundreds/thousands of clips; enriching
        // every one does a sequential cache read + optional scoring + server probe PER clip, which
        // is exactly the "loads everything at once" defect. The rest reveal via loadMore().
        const firstPage = await enrichClips(clips.slice(0, config.audio.reviewPageSize));

        if (!cancelled) {
          setItems(firstPage);
          setTotalCount(clips.length);
        }
      } catch (error) {
        logger.error('EN23_REVIEW_LOAD_FAILED', 'failed to build the audio review list', {
          category: 'DATA_PROCESSING',
          correlationId,
          error,
        });
        if (!cancelled) showToast(userMessage('EN23_REVIEW_LOAD_FAILED', 'Could not load the audio list.'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, scope, supabase, showToast, serverTierAvailable, reloadTick, enrichClips]);

  const loadMore = useCallback(async () => {
    const from = items.length;
    const to = Math.min(from + config.audio.reviewPageSize, clipsRef.current.length);
    if (to <= from) return;
    setLoadingMore(true);
    try {
      const next = await enrichClips(clipsRef.current.slice(from, to));
      setItems((prev) => [...prev, ...next]);
    } finally {
      setLoadingMore(false);
    }
  }, [items.length, enrichClips]);

  const hasMore = items.length < totalCount;

  const applyLocal = useCallback((buildKey: string, patch: Partial<AudioReviewItem>) => {
    setItems((prev) => prev.map((it) => (it.buildKey === buildKey ? { ...it, ...patch } : it)));
  }, []);

  const setVerdict = useCallback(
    async (clip: EnumeratedClip, verdict: AudioVerdict, notes?: string | null) => {
      const current = items.find((it) => it.buildKey === clip.buildKey);
      applyLocal(clip.buildKey, { verdict, notes: notes ?? null }); // optimistic
      const result = await upsertVerdict(supabase, {
        build_key: clip.buildKey,
        voice: clip.voice,
        text: clip.text,
        situation_id: clip.situationId,
        level: clip.level,
        verdict,
        notes: notes ?? null,
        reviewed_by: actorId,
        signals: current?.signals,
      });
      if (isRepoError(result)) {
        applyLocal(clip.buildKey, { verdict: current?.verdict ?? 'unreviewed', notes: current?.notes ?? null }); // rollback
        showToast(result.message, 'error');
      }
    },
    [items, supabase, actorId, applyLocal, showToast],
  );

  const enqueue = useCallback(
    async (clip: EnumeratedClip, reason: string | null) => {
      applyLocal(clip.buildKey, { queued: true }); // optimistic
      const result = await enqueueRegen(supabase, {
        build_key: clip.buildKey,
        voice: clip.voice,
        text: clip.text,
        situation_id: clip.situationId,
        level: clip.level,
        reason,
        enqueued_by: actorId,
      });
      if (isRepoError(result)) {
        applyLocal(clip.buildKey, { queued: false }); // rollback
        showToast(result.message, 'error');
      } else {
        showToast('Enqueued for regeneration.', 'success');
      }
    },
    [supabase, actorId, applyLocal, showToast],
  );

  const getPlaybackUrl = useCallback(
    async (clip: EnumeratedClip): Promise<string | null> => {
      // Prefer a device-cached copy (instant, offline). W2: on a MISS, synthesize through the normal
      // lookup chain (cache → pinned → EN-8 server tiers → provider) so an admin can preview ANY
      // listed clip, not just ones already cached on this device. Failures route through the
      // centralized logger + a toast carrying the correlation id — never a silent dead button.
      try {
        const cached = await audioCache.get(clip.buildKey);
        const buffer: Uint8Array | ArrayBuffer = cached ?? (await synthesizeCached(clip.text, { voiceType: clip.voiceType }));
        // W4: we now hold the actual bytes — record the size so the row shows it even for a clip that
        // was never scored on this device (the buffer's byteLength is the true clip size).
        setItems((prev) =>
          prev.map((it) =>
            it.buildKey === clip.buildKey ? { ...it, signals: { ...it.signals, bytes: buffer.byteLength } } : it,
          ),
        );
        return URL.createObjectURL(new Blob([buffer]));
      } catch (error) {
        const event = logger.error('EN23B_PLAYBACK_FETCH_FAILED', 'failed to load audio for admin preview', {
          category: 'DATA_PROCESSING',
          error,
          details: { buildKey: clip.buildKey },
        });
        showToast(
          userMessage('EN23B_PLAYBACK_FETCH_FAILED', 'Could not load audio for this clip.', event.request_id),
          'error',
        );
        return null;
      }
    },
    [showToast],
  );

  return {
    scope,
    setScope,
    items,
    loading,
    loadingMore,
    totalCount,
    hasMore,
    loadMore,
    serverTierAvailable,
    reload,
    setVerdict,
    enqueue,
    getPlaybackUrl,
  };
};
