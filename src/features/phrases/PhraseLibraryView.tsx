// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/phrases/PhraseLibraryView.tsx
// Description: Phrase Library mode body (CONTENT-ARCHITECTURE §3 E10; docs/ui-mockup/
//   intended-ui-v3.html "PHRASE LIBRARY" screen). Aggregates vocabulary + phrase patterns
//   across ALL situations from the src/content repository (memory → cache → network → bundled,
//   so it works offline), with live accent-insensitive search (./search.ts), register/level/
//   track filters, per-entry 🔊 TTS (./useEntryAudio.ts), when-to-use lines (author note or
//   docs/CONTENT-STANDARDS.md §3 register guidance), and "from: <situation>" provenance.
//   Tapping the provenance chip scopes the library to that situation. SEAM: PracticeModeProps
//   only exposes onExit() — cross-mode navigation (e.g. "open this situation in the Listening
//   engine") is hub-owned routing (PracticeHubView.openMode) not reachable from a mode body, so
//   provenance taps filter in-place instead of leaving the mode. Mounted via
//   modes/phrases.stub.tsx per the ENGINE INTEGRATION CONTRACT in ../practice/registry.ts.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Volume2, X } from 'lucide-react';
import {
  contentRepository,
  PRACTICAL_LEVELS,
  PracticalLevel,
  Register,
  REGISTERS,
  Situation,
  Track,
} from '../../content';
import { errorMessage, logger, userMessage } from '../../lib/logger';
import type { PracticeModeProps } from '../practice/registry';
import { buildPhraseLibrary, whenToUse } from './library';
import { matchesQuery } from './search';
import { useEntryAudio } from './useEntryAudio';

/** Sentinel for the unfiltered register/level/track chips (SituationPicker convention). */
const ALL = 'all' as const;

const chipClass = (active: boolean): string =>
  `px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
    active ? 'bg-ios-blue text-white' : 'bg-card text-ios-gray ios-shadow'
  }`;

const PhraseLibraryView = ({ situationId, onExit }: PracticeModeProps) => {
  const [situations, setSituations] = useState<Situation[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [query, setQuery] = useState('');
  const [registerFilter, setRegisterFilter] = useState<Register | typeof ALL>(ALL);
  const [levelFilter, setLevelFilter] = useState<PracticalLevel | typeof ALL>(ALL);
  const [trackFilter, setTrackFilter] = useState<string | typeof ALL>(ALL);
  // Routed in from the situation browser → start scoped to that situation (clearable chip).
  const [situationFilter, setSituationFilter] = useState<string | null>(situationId);

  const { playingId, audioError, play } = useEntryAudio();

  // Load the full situation set once (the library aggregates across ALL situations).
  // Loading/error resets happen in the retry handler per react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [situationList, trackList] = await Promise.all([
          contentRepository.listSituations(),
          contentRepository.listTracks(),
        ]);
        if (cancelled) return;
        setSituations(situationList);
        setTracks(trackList);
        setIsLoading(false);
      } catch (error) {
        if (cancelled) return;
        const event = logger.error('PHRASE_LIBRARY_LOAD_FAILED', 'could not load situations for the phrase library', {
          category: 'DATA_PROCESSING',
          error,
        });
        setLoadError(
          userMessage('PHRASE_LIBRARY_LOAD_FAILED', errorMessage(error) || 'Could not load the phrase library', event.request_id),
        );
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // Flatten once per content load; filtering below is a cheap in-memory pass.
  const entries = useMemo(() => buildPhraseLibrary(situations), [situations]);

  const visible = useMemo(
    () =>
      entries.filter((entry) => {
        if (situationFilter && entry.situationId !== situationFilter) return false;
        // Entries without an explicit register are register-safe defaults → 'neutral'.
        if (registerFilter !== ALL && (entry.register ?? 'neutral') !== registerFilter) return false;
        if (levelFilter !== ALL && entry.level !== levelFilter) return false;
        if (trackFilter !== ALL && !entry.tracks.includes(trackFilter)) return false;
        return matchesQuery(entry.haystack, query);
      }),
    [entries, situationFilter, registerFilter, levelFilter, trackFilter, query],
  );

  const situationTitleById = useMemo(() => new Map(situations.map((s) => [s.id, s.title])), [situations]);
  const sourceCount = useMemo(() => new Set(visible.map((e) => e.situationId)).size, [visible]);

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
        <button onClick={onExit} className="block mx-auto text-sm text-ios-blue font-semibold">
          Back to Practice
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search phrases… (try: repeat, coffee)"
        aria-label="Search phrases"
        className="w-full px-4 py-3 rounded-2xl bg-card ios-shadow text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue"
      />

      {/* Register chips (REGISTERS enum + All) */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold text-ios-gray uppercase px-1">Register</p>
        <div className="flex space-x-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button onClick={() => setRegisterFilter(ALL)} className={chipClass(registerFilter === ALL)}>
            All
          </button>
          {REGISTERS.map((register) => (
            <button key={register} onClick={() => setRegisterFilter(register)} className={chipClass(registerFilter === register)}>
              {register}
            </button>
          ))}
        </div>
      </div>

      {/* Level chips (practical levels 0–5 + All) */}
      <div className="flex space-x-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setLevelFilter(ALL)} className={chipClass(levelFilter === ALL)}>
          All levels
        </button>
        {PRACTICAL_LEVELS.map((level) => (
          <button key={level} onClick={() => setLevelFilter(level)} className={chipClass(levelFilter === level)}>
            L{level}
          </button>
        ))}
      </div>

      {/* Track chips (repository tracks + All) — only when tracks exist in loaded content */}
      {tracks.length > 0 && (
        <div className="flex space-x-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button onClick={() => setTrackFilter(ALL)} className={chipClass(trackFilter === ALL)}>
            All tracks
          </button>
          {tracks.map((track) => (
            <button key={track.id} onClick={() => setTrackFilter(track.id)} title={track.goal} className={chipClass(trackFilter === track.id)}>
              {track.name}
            </button>
          ))}
        </div>
      )}

      {/* Active situation scope (routed in, or provenance tap) — clearable */}
      {situationFilter && (
        <button
          onClick={() => setSituationFilter(null)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-ios-blue/10 text-ios-blue rounded-full text-xs font-bold"
        >
          <span>From: {situationTitleById.get(situationFilter) ?? situationFilter}</span>
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {audioError && <p className="text-xs text-red-500">{audioError}</p>}

      <p className="text-xs text-ios-gray">
        {visible.length} {visible.length === 1 ? 'phrase' : 'phrases'}
        {sourceCount > 0 ? ` · from ${sourceCount} ${sourceCount === 1 ? 'situation' : 'situations'}` : ''}
      </p>

      {/* Entry cards (mockup: PT + 🔊 / EN / when-to-use / provenance) */}
      {visible.length === 0 ? (
        <p className="text-sm text-ios-gray text-center py-8">No matches — try another word.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => {
            const use = whenToUse(entry);
            return (
              <div key={entry.id} className="bg-card rounded-2xl ios-shadow p-4 space-y-1">
                <div className="flex items-start justify-between space-x-2">
                  <div className="min-w-0">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                      <span className="font-bold text-[15px]">{entry.pt}</span>
                      {entry.register && (
                        <span className="text-[9px] font-bold uppercase text-ios-gray bg-ios-bg px-1.5 py-0.5 rounded-full">
                          {entry.register}
                        </span>
                      )}
                    </div>
                    {entry.en && <p className="text-xs text-ios-gray">{entry.en}</p>}
                    {entry.pronunciation && <p className="text-[11px] text-ios-gray italic">{entry.pronunciation}</p>}
                  </div>
                  <button
                    onClick={() => void play(entry.id, entry.pt)}
                    aria-label={`Play "${entry.pt}"`}
                    className={`p-2 rounded-full flex-shrink-0 active:scale-95 transition-transform ${
                      playingId === entry.id ? 'bg-ios-blue text-white' : 'bg-ios-bg text-ios-blue'
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                {use && <p className="text-[11px] text-[#B25000] leading-snug">when to use: {use}</p>}
                <button
                  onClick={() => setSituationFilter(entry.situationId)}
                  className="text-[10px] text-ios-gray underline decoration-dotted"
                >
                  from: {entry.situationTitle}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PhraseLibraryView;
