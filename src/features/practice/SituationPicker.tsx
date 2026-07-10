// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/SituationPicker.tsx
// Description: Free, non-linear situation browser (docs/CONTENT-ARCHITECTURE.md §5): pick any
//   track (or All), any practical level 0–5 (or All), any situation — soft prerequisites are
//   an advisory "Recommended after: …" hint line ONLY, everything is always tappable, nothing
//   is ever locked (§12). Tapping a situation expands a "Practice this with…" mode row from
//   the registry; picking a mode calls onPick(situationId, modeId) so the hub routes into the
//   mode with that situation. Content comes from the src/content repository (memory → cache →
//   network → bundled); load failures log through src/lib/logger and show a calm retryable
//   error state.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { contentRepository, PRACTICAL_LEVELS, PracticalLevel, Situation, Track } from '../../content';
import { logger, userMessage, errorMessage } from '../../lib/logger';
import { PRACTICE_MODES, practiceConfig } from './registry';
import { VideoPlayer } from '../../components/VideoPlayer';

/** Product-facing names for the practical levels (CONTENT-ARCHITECTURE §4). */
const LEVEL_NAMES: Record<PracticalLevel, string> = {
  0: 'Tourist survival',
  1: 'Daily function',
  2: 'House & service management',
  3: 'Local conversation',
  4: 'Problem solving',
  5: 'Integrated resident',
};

/** Sentinel for the unfiltered track/level chip. */
const ALL = 'all' as const;

interface SituationPickerProps {
  /** The user chose a situation and a mode to practice it with. */
  onPick: (situationId: string, modeId: string) => void;
}

export const SituationPicker = ({ onPick }: SituationPickerProps) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [allSituations, setAllSituations] = useState<Situation[]>([]);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [trackFilter, setTrackFilter] = useState<string | typeof ALL>(ALL);
  const [levelFilter, setLevelFilter] = useState<PracticalLevel | typeof ALL>(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Initial load: tracks + the full situation set (also the soft-prereq title index).
  // Loading/error state resets happen in the retry handler (not synchronously here)
  // per react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [trackList, situationList] = await Promise.all([
          contentRepository.listTracks(),
          contentRepository.listSituations(),
        ]);
        if (cancelled) return;
        setTracks(trackList);
        setAllSituations(situationList);
        setIsLoading(false);
      } catch (error) {
        if (cancelled) return;
        const event = logger.error('PRACTICE_CONTENT_LOAD_FAILED', 'could not load tracks/situations for the situation browser', {
          category: 'DATA_PROCESSING',
          error,
        });
        setLoadError(
          userMessage('PRACTICE_CONTENT_LOAD_FAILED', errorMessage(error) || 'Could not load practice content', event.request_id),
        );
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // Filtered list: the repository applies track curation order + level AND-filtering (§5 soft ordering).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const filtered = await contentRepository.listSituations({
          trackId: trackFilter === ALL ? undefined : trackFilter,
          level: levelFilter === ALL ? undefined : levelFilter,
        });
        if (!cancelled) setSituations(filtered);
      } catch (error) {
        if (cancelled) return;
        const event = logger.error('PRACTICE_CONTENT_FILTER_FAILED', 'could not filter situations for the situation browser', {
          category: 'DATA_PROCESSING',
          error,
          details: { trackFilter, levelFilter },
        });
        setLoadError(
          userMessage('PRACTICE_CONTENT_FILTER_FAILED', errorMessage(error) || 'Could not load practice content', event.request_id),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackFilter, levelFilter, reloadNonce]);

  const titleById = useMemo(() => new Map(allSituations.map((s) => [s.id, s.title])), [allSituations]);

  /** Advisory hint line ONLY — soft prerequisites never lock anything (§5/§12). */
  const softPrereqHint = useCallback(
    (situation: Situation): string | null => {
      const prereqs = situation.soft_prerequisites ?? [];
      if (prereqs.length === 0) return null;
      const titles = prereqs.slice(0, practiceConfig.softPrereqHintMax).map((id) => titleById.get(id) ?? id);
      const extra = prereqs.length - titles.length;
      return `Recommended after: ${titles.join(', ')}${extra > 0 ? ` +${extra} more` : ''}`;
    },
    [titleById],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-sm text-ios-gray">{loadError}</p>
        <button
          onClick={() => {
            setIsLoading(true);
            setLoadError(null);
            setReloadNonce((n) => n + 1);
          }}
          className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform inline-flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try again</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ios-gray">
        Any track, any level, any situation — order is a recommendation, never a lock.
      </p>

      {/* Track chips (repository tracks + All) */}
      <div className="flex space-x-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setTrackFilter(ALL)}
          className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
            trackFilter === ALL ? 'bg-ios-blue text-white' : 'bg-card text-ios-gray ios-shadow'
          }`}
        >
          All tracks
        </button>
        {tracks.map((track) => (
          <button
            key={track.id}
            onClick={() => setTrackFilter(track.id)}
            title={track.goal}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              trackFilter === track.id ? 'bg-ios-blue text-white' : 'bg-card text-ios-gray ios-shadow'
            }`}
          >
            {track.name}
          </button>
        ))}
      </div>

      {/* Level chips (practical levels 0–5 + All) */}
      <div className="flex space-x-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setLevelFilter(ALL)}
          className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
            levelFilter === ALL ? 'bg-ios-blue text-white' : 'bg-card text-ios-gray ios-shadow'
          }`}
        >
          All levels
        </button>
        {PRACTICAL_LEVELS.map((level) => (
          <button
            key={level}
            onClick={() => setLevelFilter(level)}
            title={LEVEL_NAMES[level]}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              levelFilter === level ? 'bg-ios-blue text-white' : 'bg-card text-ios-gray ios-shadow'
            }`}
          >
            L{level}
          </button>
        ))}
      </div>

      {/* Situation list — everything always tappable (never a hard gate, §12) */}
      {situations.length === 0 ? (
        <p className="text-sm text-ios-gray text-center py-8">
          No situations match these filters yet — new content packs add more over time.
        </p>
      ) : (
        <div className="space-y-3">
          {situations.map((situation) => {
            const isExpanded = expandedId === situation.id;
            const hint = softPrereqHint(situation);
            return (
              <div key={situation.id} className="bg-card rounded-2xl ios-shadow overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : situation.id)}
                  className="w-full p-4 text-left flex items-start justify-between"
                  aria-expanded={isExpanded}
                >
                  <div className="space-y-1 pr-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ios-bg text-ios-gray">
                        L{situation.level}
                      </span>
                      <h3 className="font-semibold text-sm">{situation.title}</h3>
                    </div>
                    <p className="text-xs text-ios-gray line-clamp-2">{situation.summary}</p>
                    {hint && <p className="text-[10px] text-ios-gray italic">{hint}</p>}
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-ios-gray flex-shrink-0 mt-1" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-ios-gray flex-shrink-0 mt-1" />
                  )}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {situation.media?.find((m) => m.type === 'video') && (
                      <VideoPlayer url={situation.media.find((m) => m.type === 'video')!.url} />
                    )}
                    <p className="text-[10px] font-bold text-ios-gray uppercase">Practice this with…</p>
                    <div className="flex flex-wrap gap-2">
                      {PRACTICE_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => onPick(situation.id, mode.id)}
                          className="px-3 py-2 bg-ios-bg rounded-xl text-xs font-semibold flex items-center space-x-1.5 active:scale-95 transition-transform"
                        >
                          <mode.icon className="w-3.5 h-3.5 text-ios-blue" />
                          <span>{mode.title}</span>
                          {mode.status === 'coming-soon' && (
                            <span className="text-[9px] text-ios-gray font-bold uppercase">soon</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SituationPicker;
