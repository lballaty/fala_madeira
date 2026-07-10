// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/culture/CultureView.tsx
// Description: Cultural Context Layer mode body (CONTENT-ARCHITECTURE §3 E7; docs/ui-mockup/
//   intended-ui-v3.html "CULTURE" screen). Two layers: (1) curated always-available explainer
//   cards (./explainers.ts — register ladder, "Queria vs Quero" indirectness, spoken-Madeira
//   realism; sources cited there, no AI-generated content), and (2) every situation-attached
//   cultural_note across ALL loaded situations from the src/content repository, grouped by
//   situation with level chips. When routed in with a situationId (situation browser), that
//   situation's notes group is pinned first. Fully offline-capable — reads only cached/bundled
//   content. Mounted via modes/culture.stub.tsx per the ENGINE INTEGRATION CONTRACT in
//   ../practice/registry.ts.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { contentRepository, Situation } from '../../content';
import { errorMessage, logger, userMessage } from '../../lib/logger';
import type { PracticeModeProps } from '../practice/registry';
import { CULTURE_EXPLAINERS } from './explainers';

const CultureView = ({ situationId, onExit }: PracticeModeProps) => {
  const [situations, setSituations] = useState<Situation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Load all situations once; only those carrying cultural_notes render below.
  // Loading/error resets happen in the retry handler per react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const situationList = await contentRepository.listSituations();
        if (cancelled) return;
        setSituations(situationList);
        setIsLoading(false);
      } catch (error) {
        if (cancelled) return;
        const event = logger.error('CULTURE_CONTENT_LOAD_FAILED', 'could not load situations for the culture layer', {
          category: 'DATA_PROCESSING',
          error,
        });
        setLoadError(
          userMessage('CULTURE_CONTENT_LOAD_FAILED', errorMessage(error) || 'Could not load cultural notes', event.request_id),
        );
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // Situations that actually carry cultural notes, grouped in repository order —
  // the routed-in situation (if any) pinned first so its social code is on top.
  const noteGroups = useMemo(() => {
    const groups = situations.filter((s) => (s.cultural_notes?.length ?? 0) > 0);
    if (!situationId) return groups;
    return [...groups.filter((s) => s.id === situationId), ...groups.filter((s) => s.id !== situationId)];
  }, [situations, situationId]);

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
      {/* Curated explainers — the always-available social-code layer (sources in ./explainers.ts) */}
      {CULTURE_EXPLAINERS.map((explainer) => (
        <div key={explainer.id} className="bg-card rounded-2xl ios-shadow p-4 space-y-2">
          <p className="text-[10px] font-bold text-ios-gray uppercase tracking-wide">{explainer.kicker}</p>
          <h3 className="font-bold text-[15px]">{explainer.title}</h3>
          <p className="text-[13px] leading-relaxed">{explainer.body}</p>
          {explainer.examples && (
            <div className="space-y-1.5 pt-1">
              {explainer.examples.map((example) => (
                <div key={example.pt} className="bg-ios-bg rounded-xl px-3 py-2">
                  <p className="text-[13px] font-semibold">{example.pt}</p>
                  <p className="text-[11px] text-ios-gray">{example.en}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Situation-attached cultural notes, grouped by situation (E7 over cultural_notes) */}
      {noteGroups.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-[10px] font-bold text-ios-gray uppercase tracking-wide px-1">
            From your situations
          </p>
          {noteGroups.map((situation) => (
            <div key={situation.id} className="bg-card rounded-2xl ios-shadow p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ios-bg text-ios-gray">
                  L{situation.level}
                </span>
                <h3 className="font-semibold text-sm">{situation.title}</h3>
                {situationId === situation.id && (
                  <span className="text-[9px] font-bold uppercase text-ios-blue bg-ios-blue/10 px-1.5 py-0.5 rounded-full">
                    your pick
                  </span>
                )}
              </div>
              {(situation.cultural_notes ?? []).map((note, i) => (
                <div key={note.id ?? `${situation.id}:note:${i}`} className="bg-[#B25000]/[0.07] rounded-xl px-3 py-2.5 space-y-1">
                  <p className="text-[12px] font-bold text-[#B25000]">🫱 {note.title}</p>
                  <p className="text-[13px] leading-relaxed">{note.body}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ios-gray text-center pb-2">
        Cultural notes attach to situations — you&apos;ll meet these exactly where they matter.
      </p>
    </div>
  );
};

export default CultureView;
