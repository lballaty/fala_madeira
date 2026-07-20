// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/features/tutor/TutorMessage.tsx
// Description: TB-14 — TUTOR-LOCAL renderer for a model turn. Parses the mixed PT/EN Markdown wall
//   (tutorMessageParser) into ordered segments and renders each Portuguese phrase as an independently
//   tappable unit: the PT via TranslatableText (tap-to-reveal English) paired with an AudioButton that
//   speaks ONLY the Portuguese (playSpeech(pt)). The phonetic guide, when present, is shown as small
//   muted subtext and is NEVER spoken. Non-Portuguese content (English paragraphs, objectives, notes,
//   headings) renders as prose via SafeMarkdown and has no play control. If the parse finds no
//   confident Portuguese it falls back to a single prose block + one whole-message play button, so a
//   weird turn degrades to today's whole-message behavior instead of breaking.
//
//   TUTOR-LOCAL, pending EN-21 convergence: EN-21 (the mode-aware shared message renderer) does not
//   exist yet. Per the TB-14 requirements we intentionally ship this renderer inside the tutor slice
//   and do NOT create a shared renderer here. FOLLOW-UP: when EN-21 lands, fold this parse+render into
//   it (conversation mode → these phrases) rather than maintaining a second parallel renderer.
// Author: TB-14 (with assistant)
// Created: 2026-07-20

import { SafeMarkdown } from '../../components/SafeMarkdown';
import { AudioButton } from '../../components/AudioButton';
import { TranslatableText } from '../../components/TranslatableText';
import { parseTutorMessage } from './tutorMessageParser';

interface TutorMessageProps {
  /** Raw model turn text (interleaved PT/EN Markdown). */
  text: string;
  /** Speaks the given text (PT only, for phrases). May be async. */
  playSpeech: (text: string) => Promise<void> | void;
}

export const TutorMessage = ({ text, playSpeech }: TutorMessageProps) => {
  const segments = parseTutorMessage(text);

  // Single-prose fallback: the parser found no confident Portuguese → render the whole message and
  // offer ONE whole-message play so nothing is lost (today's behavior for a malformed/plain turn).
  const isFallback = segments.length === 1 && segments[0].kind === 'prose';

  if (isFallback) {
    const only = segments[0] as { kind: 'prose'; text: string };
    return (
      <div className="space-y-2">
        <div className="prose prose-sm max-w-none">
          <SafeMarkdown>{only.text}</SafeMarkdown>
        </div>
        <AudioButton
          onPlay={() => playSpeech(only.text)}
          label="Play message"
          className="mt-1"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, i) => {
        if (seg.kind === 'phrase') {
          return (
            <div key={`seg-${i}`} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <TranslatableText text={seg.pt} translation={seg.en} className="font-medium" />
                {seg.phonetic && (
                  <span className="block text-xs text-ios-gray/70 mt-0.5">{seg.phonetic}</span>
                )}
              </div>
              <AudioButton
                onPlay={() => playSpeech(seg.pt)}
                label="Play phrase"
                className="shrink-0"
              />
            </div>
          );
        }
        return (
          <div key={`seg-${i}`} className="prose prose-sm max-w-none">
            <SafeMarkdown>{seg.text}</SafeMarkdown>
          </div>
        );
      })}
    </div>
  );
};

export default TutorMessage;
