// File: src/features/admin/audio/AudioPanel.tsx
// Description: EN-23 admin audio-management panel (rendered in AdminView's Audio tab, already gated
//   on role==='admin'). Scope selector (Level default 0 + Track), a coverage+signals table (tier
//   badges, byte/duration/silence signals, suspicious flag), inline preview from the device cache,
//   good/bad/re-record verdict + notes, and enqueue-for-regeneration. Presentational shell over
//   useAudioReview; owns only local UI state (scope inputs, notes drafts, playback). The EN-8 server
//   tier shows "pending EN-8" until that config lands. Author: claude-en23. Created: 2026-07-17.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Play, RefreshCw } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { contentRepository } from '../../../content/repository';
import { PRACTICAL_LEVELS, PracticalLevel, Track } from '../../../content/schema';
import { AudioReviewItem, AudioVerdict } from './types';
import { UseAudioReview } from './useAudioReview';

interface AudioPanelProps {
  audio: UseAudioReview;
}

const VERDICTS: { value: Exclude<AudioVerdict, 'unreviewed'>; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'bad', label: 'Bad' },
  { value: 're_record', label: 'Re-record' },
];

/** Human-readable clip size (W4) — bytes → B / KB / MB. */
const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const tierBadge = (tier: AudioReviewItem['deviceTier'], label: string, pendingLabel?: string): string => {
  if (tier === 'present') return `${label}: yes`;
  if (tier === 'missing') return `${label}: no`;
  return pendingLabel ?? `${label}: unknown`;
};

export const AudioPanel = ({ audio }: AudioPanelProps) => {
  const { scope, setScope, items, loading, loadingMore, totalCount, hasMore, loadMore, serverTierAvailable, reload, setVerdict, enqueue, getPlaybackUrl } = audio;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void contentRepository.listTracks().then((t) => {
      if (!cancelled) setTracks(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Revoke any object URL on unmount to avoid leaks.
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const suspiciousCount = useMemo(() => items.filter((it) => it.signals.suspicious).length, [items]);

  const play = async (item: AudioReviewItem) => {
    // W2: getPlaybackUrl now synthesizes on a device-cache miss, so this can take a moment and can
    // fail (the hook surfaces a logged toast) — show a per-row loading state while it resolves.
    setLoadingKey(item.buildKey);
    let url: string | null = null;
    try {
      url = await getPlaybackUrl(item);
    } finally {
      setLoadingKey((k) => (k === item.buildKey ? null : k));
    }
    if (!url) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setPlayingKey(item.buildKey);
    const el = audioElRef.current;
    if (el) {
      el.src = url;
      void el.play();
    }
  };

  return (
    <div className="space-y-4">
      {/* Scope selector */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="audio-scope-level" className="text-xs font-bold text-ios-gray">Level</label>
        <select
          id="audio-scope-level"
          data-testid="audio-scope-select"
          value={scope.level ?? ''}
          onChange={(e) =>
            setScope({ level: e.target.value === '' ? undefined : (Number(e.target.value) as PracticalLevel) })
          }
          className="rounded-lg border border-line bg-card px-2 py-1 text-sm"
        >
          {PRACTICAL_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              Level {lvl}
            </option>
          ))}
        </select>

        <label htmlFor="audio-scope-track" className="text-xs font-bold text-ios-gray ml-2">Track</label>
        <select
          id="audio-scope-track"
          data-testid="audio-scope-track"
          value={scope.trackId ?? ''}
          onChange={(e) => setScope(e.target.value === '' ? { level: 0 as PracticalLevel } : { trackId: e.target.value })}
          className="rounded-lg border border-line bg-card px-2 py-1 text-sm max-w-[10rem]"
        >
          <option value="">— by level —</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <button
          onClick={reload}
          data-testid="audio-reload"
          className="ml-auto flex items-center gap-1 text-xs font-bold text-ios-blue min-h-[44px] px-2"
          aria-label="Reload audio list"
        >
          <RefreshCw className="w-4 h-4" /> Reload
        </button>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-ios-gray" data-testid="audio-summary">
        <span data-testid="audio-count">
          {items.length}
          {totalCount > items.length ? ` of ${totalCount}` : ''} clip(s)
        </span>
        {suspiciousCount > 0 && (
          <span className="flex items-center gap-1 text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5" /> {suspiciousCount} suspicious
          </span>
        )}
        {!serverTierAvailable && <span className="italic">server tier: pending EN-8</span>}
      </div>

      {loading && <p className="text-sm text-ios-gray" data-testid="audio-loading">Loading clips…</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-ios-gray" data-testid="audio-empty">No clips in this scope.</p>
      )}

      {/* Clip rows */}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.buildKey}
            data-testid="audio-clip-row"
            data-build-key={item.buildKey}
            data-verdict={item.verdict}
            data-suspicious={item.signals.suspicious ? 'true' : 'false'}
            className={cn('rounded-xl border p-3 bg-card', item.signals.suspicious ? 'border-amber-400' : 'border-line')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.text}</p>
                <p className="text-[11px] text-ios-gray">
                  voice: {item.voice} · {tierBadge(item.deviceTier, 'device')} ·{' '}
                  {serverTierAvailable ? tierBadge(item.serverTier, 'server') : 'server: pending EN-8'}
                </p>
                <p className="text-[11px] text-ios-gray">
                  {item.signals.bytes != null && (
                    <span data-testid="audio-size">size: {formatBytes(item.signals.bytes)} · </span>
                  )}
                  {item.signals.durationMs != null && <>dur: {item.signals.durationMs}ms · </>}
                  {item.signals.rmsDbfs != null && <>rms: {item.signals.rmsDbfs}dBFS · </>}
                  {item.signals.silent && <span className="text-amber-600">silent · </span>}
                  {item.signals.deadAirMs != null && item.signals.deadAirMs > 0 && (
                    <>dead-air: {item.signals.deadAirMs}ms</>
                  )}
                </p>
              </div>
              <button
                onClick={() => void play(item)}
                disabled={loadingKey === item.buildKey}
                data-testid="audio-play"
                data-loading={loadingKey === item.buildKey ? 'true' : 'false'}
                className="shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px] text-ios-blue disabled:text-ios-gray/40"
                aria-label={loadingKey === item.buildKey ? `Loading ${item.text}` : `Play ${item.text}`}
                aria-busy={loadingKey === item.buildKey}
              >
                {loadingKey === item.buildKey ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Verdict controls */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {VERDICTS.map((v) => (
                <button
                  key={v.value}
                  onClick={() => void setVerdict(item, v.value, notesDraft[item.buildKey] ?? item.notes ?? null)}
                  data-testid={`audio-verdict-${v.value}`}
                  aria-pressed={item.verdict === v.value}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold border',
                    item.verdict === v.value ? 'bg-ios-blue text-white border-ios-blue' : 'border-line text-ios-gray',
                  )}
                >
                  {v.label}
                </button>
              ))}
              <input
                type="text"
                placeholder="notes"
                defaultValue={item.notes ?? ''}
                onChange={(e) => setNotesDraft((d) => ({ ...d, [item.buildKey]: e.target.value }))}
                data-testid="audio-notes"
                className="flex-1 min-w-[6rem] rounded-lg border border-line bg-ios-bg px-2 py-1 text-xs"
              />
              <button
                onClick={() => void enqueue(item, notesDraft[item.buildKey] ?? item.notes ?? null)}
                disabled={item.queued}
                data-testid="audio-enqueue"
                className="rounded-full px-3 py-1 text-xs font-bold border border-ios-blue text-ios-blue disabled:opacity-40"
              >
                {item.queued ? 'Queued' : 'Enqueue'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* W3: reveal the next bounded page on demand instead of enriching the whole scope up front. */}
      {hasMore && (
        <button
          onClick={() => void loadMore()}
          disabled={loadingMore}
          data-testid="audio-load-more"
          className="w-full rounded-xl border border-line bg-card py-2 text-sm font-bold text-ios-blue disabled:opacity-40"
        >
          {loadingMore ? 'Loading…' : `Load more (${items.length} of ${totalCount})`}
        </button>
      )}

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- TTS preview, no captions available */}
      <audio ref={audioElRef} onEnded={() => setPlayingKey(null)} data-testid="audio-player" hidden />
      {playingKey && <span className="sr-only">Playing preview</span>}
    </div>
  );
};
