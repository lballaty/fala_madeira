// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/practice/speaking/SpeakingView.tsx
// Description: Speaking Coach + Pronunciation Trainer container (engine-speaking-pronunciation;
//   docs/CONTENT-ARCHITECTURE.md §3). Default-exports the ComponentType<PracticeModeProps> the
//   registry lazy-loads. Loads the drill queue for props.situationId via the content repository
//   (./speakingItems — engine's own default when null; situations are never gated, §5/§12),
//   then lets the learner pick one of four drills: Repeat-after-me, Shadowing, Record-and-
//   compare, Response-speed. Capability-aware degradation (mic / recognition), honest and
//   never a dead button: STT-only drills are hidden with a note when recognition is absent;
//   record-and-compare falls back to reference-listen + self-grade without a mic. Renders only
//   the body — the hub owns the back-header chrome (ENGINE INTEGRATION CONTRACT in ../registry).
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { useEffect, useState } from 'react';
import { AudioLines, Ear, Mic, Timer, type LucideIcon } from 'lucide-react';
import type { PracticeModeProps } from '../registry';
import { platform } from '../../../platform';
import { logger } from '../../../lib/logger';
import { SpeakingContent, loadSpeakingContent } from './speakingItems';
import { RepeatAfterMe } from './RepeatAfterMe';
import { Shadowing } from './Shadowing';
import { RecordCompare } from './RecordCompare';
import { ResponseSpeed } from './ResponseSpeed';

type DrillId = 'repeat' | 'shadow' | 'compare' | 'speed';

interface DrillMeta {
  id: DrillId;
  title: string;
  blurb: string;
  icon: LucideIcon;
  /** Hard requirement on speech recognition — when false the tile is hidden + noted. */
  needsStt: boolean;
}

const DRILLS: DrillMeta[] = [
  { id: 'repeat', title: 'Repeat after me', blurb: 'Hear it, say it, get a score', icon: Ear, needsStt: false },
  { id: 'shadow', title: 'Shadowing', blurb: 'Speak along with the voice', icon: AudioLines, needsStt: false },
  { id: 'compare', title: 'Record & compare', blurb: 'Hear yourself next to the model', icon: Mic, needsStt: false },
  { id: 'speed', title: 'Response speed', blurb: 'Answer before you translate', icon: Timer, needsStt: true },
];

const SpeakingView = ({ situationId, onExit }: PracticeModeProps) => {
  const [content, setContent] = useState<SpeakingContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [drill, setDrill] = useState<DrillId | null>(null);

  // Capabilities resolved once (adapters are stable singletons).
  const [sttAvailable] = useState(() => platform.speech.isAvailable());
  const [recordingSupported] = useState(() => platform.audio.isRecordingSupported());

  // State updates live inside promise callbacks only (never synchronously in the
  // effect body) — keeps react-hooks/set-state-in-effect happy, same pattern as
  // src/hooks/useDueItems.ts.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setIsLoading(true);
        return loadSpeakingContent(situationId);
      })
      .then((loaded) => {
        if (cancelled) return;
        setContent(loaded);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error('SPEAKING_CONTENT_LOAD_FAILED', 'Failed to load speaking content', {
          category: 'DATA_PROCESSING',
          error: err,
          details: { situationId },
        });
        setContent({ situation: null, items: [], fallbackNote: null });
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [situationId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ios-blue" />
      </div>
    );
  }

  const items = content?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-sm text-ios-gray">
          There are no speakable phrases available yet. New situations arrive as content packs —
          nothing is locked while you wait.
        </p>
        <button
          onClick={onExit}
          className="px-6 py-3 bg-ios-blue text-white rounded-2xl font-bold text-sm active:scale-95 transition-transform"
        >
          Back to Practice
        </button>
      </div>
    );
  }

  // Attempt key for pass-level (whole-list) drills: the situation, or the first item's content.
  const passKey = content?.situation?.id ?? items[0].key;

  const renderDrill = () => {
    switch (drill) {
      case 'repeat':
        return <RepeatAfterMe items={items} sttAvailable={sttAvailable} />;
      case 'shadow':
        return <Shadowing items={items} attemptKey={passKey} />;
      case 'compare':
        return <RecordCompare items={items} recordingSupported={recordingSupported} />;
      case 'speed':
        return <ResponseSpeed items={items} sttAvailable={sttAvailable} />;
      default:
        return null;
    }
  };

  if (drill) {
    const meta = DRILLS.find((d) => d.id === drill)!;
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDrill(null)}
            className="text-sm font-semibold text-ios-blue active:scale-95 transition-transform"
          >
            All drills
          </button>
          <span className="text-sm font-bold">{meta.title}</span>
        </div>
        {renderDrill()}
      </div>
    );
  }

  const availableDrills = DRILLS.filter((d) => !d.needsStt || sttAvailable);
  const hiddenForStt = DRILLS.filter((d) => d.needsStt && !sttAvailable);

  return (
    <div className="p-6 space-y-3">
      <header className="space-y-1">
        <h2 className="text-xl font-bold">{content?.situation?.title ?? 'Speaking practice'}</h2>
        <p className="text-sm text-ios-gray">
          {items.length} phrase{items.length === 1 ? '' : 's'} · pick a drill
        </p>
      </header>

      {content?.fallbackNote && (
        <p className="text-xs text-ios-gray bg-ios-bg rounded-xl px-3 py-2">{content.fallbackNote}</p>
      )}

      {!sttAvailable && (
        <p className="text-xs text-ios-gray bg-ios-bg rounded-xl px-3 py-2">
          Speech recognition isn&apos;t available on this device, so drills score by self-assessment.
          Everything below still works.
        </p>
      )}

      {availableDrills.map((d) => (
        <button
          key={d.id}
          onClick={() => setDrill(d.id)}
          className="w-full bg-card p-4 rounded-2xl ios-shadow flex items-center space-x-3 text-left active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-[#FF3B30] flex items-center justify-center flex-shrink-0">
            <d.icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-sm block">{d.title}</span>
            <span className="text-xs text-ios-gray block truncate">{d.blurb}</span>
          </div>
        </button>
      ))}

      {hiddenForStt.length > 0 && (
        <p className="text-[11px] text-ios-gray text-center pt-1">
          {hiddenForStt.map((d) => d.title).join(', ')} need speech recognition — available on devices that
          support it.
        </p>
      )}
    </div>
  );
};

export default SpeakingView;
